import type { DatabaseCapabilities } from './adapter.js';
import type {
  BuilderExecOptions,
  BuilderImpact,
  BuilderWarning,
  ColumnSchemaDefinition,
  PhysicalConstraintDefinition,
  PhysicalIndexDefinition,
  SchemaOperation,
  TableAlterSchemaOperation,
  TableSchemaDefinition,
  ViewSchemaDefinition,
} from './types.js';

export interface CapabilityPlan {
  schemaOperations: SchemaOperation[];
  warnings: BuilderWarning[];
  impact: BuilderImpact[];
}

export interface CapabilityPlannerOptions {
  capabilities?: DatabaseCapabilities;
  dialect?: string;
  strict?: boolean;
}

export class UnsupportedCapabilityError extends Error {
  constructor(readonly warnings: BuilderWarning[]) {
    super(createUnsupportedCapabilityMessage(warnings));
    this.name = 'UnsupportedCapabilityError';
  }
}

export function planCapabilities(
  schemaOperations: SchemaOperation[],
  options: CapabilityPlannerOptions = {},
): CapabilityPlan {
  const planner = new CapabilityPlanner(options);
  return planner.plan(schemaOperations);
}

export function throwIfStrictWarnings(
  warnings: BuilderWarning[],
  options: Pick<BuilderExecOptions, 'strict'>,
): void {
  if (options.strict && warnings.length > 0) {
    throw new UnsupportedCapabilityError(warnings);
  }
}

class CapabilityPlanner {
  private readonly warnings: BuilderWarning[] = [];
  private readonly impact: BuilderImpact[] = [];
  private readonly dialect: string;

  constructor(private readonly options: CapabilityPlannerOptions) {
    this.dialect = options.dialect ?? 'unknown';
  }

  plan(schemaOperations: SchemaOperation[]): CapabilityPlan {
    const planned = schemaOperations.flatMap((operation) => this.planOperation(operation, []));
    return {
      schemaOperations: planned,
      warnings: this.warnings,
      impact: this.impact,
    };
  }

  private planOperation(operation: SchemaOperation, path: Array<string | number>): SchemaOperation[] {
    switch (operation.type) {
      case 'createTable': {
        const table = this.planTable(operation.table, [...path, 'table']);
        return [{ ...operation, table }];
      }
      case 'alterTable': {
        const operations = operation.operations.flatMap((tableOperation, index) =>
          this.planTableAlterOperation(tableOperation, [...path, 'operations', index]),
        );
        if (operations.length === 0) {
          return [];
        }
        return [{ ...operation, operations }];
      }
      case 'dropTable':
      case 'renameTable':
        return [operation];
      case 'createView':
        return this.planCreateView(operation, path);
      case 'refreshMaterializedView':
        if (!this.capability('refreshMaterializedViews')) {
          this.warn({
            code: 'UNSUPPORTED_REFRESH_MATERIALIZED_VIEW',
            capability: 'refreshMaterializedViews',
            fallback: 'skip',
            severity: 'unsafe',
            path,
            message: `${this.dialect} does not support refreshing materialized views. The refresh operation will be skipped.`,
          });
          this.addImpact('warning', operation.type, 'The materialized view refresh will be skipped because there is no safe fallback.');
          return [];
        }
        return [operation];
      default:
        return assertNever(operation);
    }
  }

  private planCreateView(
    operation: Extract<SchemaOperation, { type: 'createView' }>,
    path: Array<string | number>,
  ): SchemaOperation[] {
    if (!this.capability('views')) {
      this.warn({
        code: 'UNSUPPORTED_VIEW',
        capability: 'views',
        fallback: 'skip',
        severity: 'unsafe',
        path,
        message: `${this.dialect} does not support views. The view will not be created.`,
      });
      this.addImpact('warning', operation.type, 'The view operation will be skipped because there is no safe fallback.');
      return [];
    }

    if (operation.materialized && !this.capability('materializedViews')) {
      this.warn({
        code: 'UNSUPPORTED_MATERIALIZED_VIEW',
        capability: 'materializedViews',
        fallback: 'skip',
        severity: 'unsafe',
        path,
        message: `${this.dialect} does not support materialized views. The materialized view will not be created.`,
      });
      this.addImpact('warning', operation.type, 'The materialized view operation will be skipped because there is no safe fallback.');
      return [];
    }

    const view = this.planView(operation.view, [...path, 'view']);

    if (operation.orReplace && !this.capability('replaceView')) {
      this.warn({
        code: 'UNSUPPORTED_REPLACE_VIEW',
        capability: 'replaceView',
        fallback: 'downgrade',
        severity: 'warning',
        path,
        message: `${this.dialect} does not support replacing views. The operation will be compiled as a regular create view.`,
      });
      this.addImpact('warning', operation.type, 'The replace view operation will be downgraded to create view.');
      return [{ ...operation, view, orReplace: false }];
    }

    return [{ ...operation, view }];
  }

  private planTable(table: TableSchemaDefinition, path: Array<string | number>): TableSchemaDefinition {
    return {
      ...table,
      db: this.planDbOptions(table.db, path),
      columns: table.columns.map((column, index) => this.planColumn(column, [...path, 'columns', index])),
      indexes: table.indexes.map((index, indexPosition) => this.planIndex(index, [...path, 'indexes', indexPosition])),
      constraints: table.constraints.flatMap((constraint, index) =>
        this.planConstraint(constraint, [...path, 'constraints', index]),
      ),
    };
  }

  private planView(view: ViewSchemaDefinition, path: Array<string | number>): ViewSchemaDefinition {
    return {
      ...view,
      db: this.planDbOptions(view.db, path),
      indexes: view.indexes?.map((index, indexPosition) =>
        this.planIndex(index, [...path, 'indexes', indexPosition]),
      ),
    };
  }

  private planTableAlterOperation(
    operation: TableAlterSchemaOperation,
    path: Array<string | number>,
  ): TableAlterSchemaOperation[] {
    switch (operation.type) {
      case 'addColumn':
        return [{ ...operation, column: this.planColumn(operation.column, [...path, 'column']) }];
      case 'alterColumn':
        return [{ ...operation, changes: this.planColumn(operation.changes as ColumnSchemaDefinition, [...path, 'changes']) }];
      case 'addIndex':
        return [{ ...operation, index: this.planIndex(operation.index, [...path, 'index']) }];
      case 'addConstraint':
        return this.planConstraint(operation.constraint, [...path, 'constraint']).map((constraint) => ({
          ...operation,
          constraint,
        }));
      case 'dropColumn':
      case 'dropIndex':
      case 'dropConstraint':
        return [operation];
      default:
        return assertNever(operation);
    }
  }

  private planColumn(column: ColumnSchemaDefinition, path: Array<string | number>): ColumnSchemaDefinition {
    let next: ColumnSchemaDefinition = {
      ...column,
      db: this.planDbOptions(column.db, path),
    };

    if (next.db?.nativeType && !this.capability('nativeTypes')) {
      const { nativeType: _nativeType, ...db } = next.db;
      next = {
        ...next,
        type: fallbackNativeColumnType(next.type),
        db: pruneEmptyObject(db),
      };
      this.warn({
        code: 'UNSUPPORTED_NATIVE_TYPE',
        capability: 'nativeTypes',
        fallback: 'downgrade',
        severity: 'warning',
        path: [...path, 'db', 'nativeType'],
        message: `${this.dialect} does not support native types. Column ${next.name} will use ${next.type} instead.`,
      });
      this.addImpact('warning', 'nativeType', `Column ${next.name} native type will be downgraded to ${next.type}.`);
    }

    return next;
  }

  private planDbOptions<T extends { schema?: string; comment?: string } | undefined>(
    db: T,
    path: Array<string | number>,
  ): T {
    if (!db) {
      return db;
    }

    let next = { ...db };

    if (next.schema && !this.capability('schemas')) {
      const schema = next.schema;
      delete next.schema;
      this.warn({
        code: 'UNSUPPORTED_SCHEMA',
        capability: 'schemas',
        fallback: 'ignore',
        severity: schema === 'public' ? 'warning' : 'unsafe',
        path: [...path, 'db', 'schema'],
        message: `${this.dialect} does not support database schemas. Schema "${schema}" will be ignored.`,
      });
      this.addImpact('warning', 'schema', `Database schema "${schema}" will be ignored.`);
    }

    if (next.comment && !this.capability('comments')) {
      delete next.comment;
      this.warn({
        code: 'UNSUPPORTED_COMMENT',
        capability: 'comments',
        fallback: 'skip',
        severity: 'warning',
        path: [...path, 'db', 'comment'],
        message: `${this.dialect} does not support database comments. The database comment will be skipped.`,
      });
      this.addImpact('warning', 'comment', 'A database comment will be skipped.');
    }

    return pruneEmptyObject(next) as T;
  }

  private planIndex(index: PhysicalIndexDefinition, path: Array<string | number>): PhysicalIndexDefinition {
    if (index.predicate && !this.capability('partialIndexes')) {
      const { predicate: _predicate, ...next } = index;
      this.warn({
        code: 'UNSUPPORTED_PARTIAL_INDEX',
        capability: 'partialIndexes',
        fallback: 'downgrade',
        severity: 'warning',
        path: [...path, 'predicate'],
        message: `${this.dialect} does not support partial indexes. The index will be created without a predicate.`,
      });
      this.addImpact('warning', 'partialIndex', 'An index predicate will be ignored.');
      return next;
    }

    return index;
  }

  private planConstraint(
    constraint: PhysicalConstraintDefinition,
    path: Array<string | number>,
  ): PhysicalConstraintDefinition[] {
    switch (constraint.type) {
      case 'primary':
        return [this.planDeferrableConstraint(constraint, path)];
      case 'unique':
        return this.planUniqueConstraint(constraint, path);
      case 'foreignKey':
        if (!this.capability('foreignKeys')) {
          this.warn({
            code: 'UNSUPPORTED_FOREIGN_KEY',
            capability: 'foreignKeys',
            fallback: 'skip',
            severity: 'unsafe',
            path,
            message: `${this.dialect} does not support foreign keys. The foreign key constraint will be skipped.`,
          });
          this.addImpact('warning', constraint.type, 'A foreign key constraint will be skipped because there is no safe fallback.');
          return [];
        }
        return [this.planDeferrableConstraint(constraint, path)];
      case 'check':
        this.warn({
          code: 'UNSUPPORTED_CHECK_CONSTRAINT',
          capability: 'checkConstraints',
          fallback: 'skip',
          severity: 'unsafe',
          path,
          message: 'Check constraints are modeled in the DSL but are not compiled by the current schema adapter. The check constraint will be skipped.',
        });
        this.addImpact('warning', constraint.type, 'A check constraint will be skipped because it is not compiled yet.');
        return [];
      default:
        return assertNever(constraint);
    }
  }

  private planUniqueConstraint(
    constraint: Extract<PhysicalConstraintDefinition, { type: 'unique' }>,
    path: Array<string | number>,
  ): PhysicalConstraintDefinition[] {
    const next = this.planDeferrableConstraint(constraint, path);

    if (next.predicate && !this.capability('partialIndexes')) {
      this.warn({
        code: 'UNSUPPORTED_PARTIAL_UNIQUE_CONSTRAINT',
        capability: 'partialIndexes',
        fallback: 'skip',
        severity: 'unsafe',
        path: [...path, 'predicate'],
        message: `${this.dialect} does not support partial unique constraints. The unique constraint will be skipped because there is no safe automatic fallback.`,
      });
      this.addImpact('warning', next.type, 'A partial unique constraint will be skipped because there is no safe fallback.');
      return [];
    }

    return [next];
  }

  private planDeferrableConstraint<T extends Extract<PhysicalConstraintDefinition, { deferrable?: unknown }>>(
    constraint: T,
    path: Array<string | number>,
  ): T {
    if (!constraint.deferrable || this.capability('deferrableConstraints')) {
      return constraint;
    }

    const { deferrable: _deferrable, ...next } = constraint;
    this.warn({
      code: 'UNSUPPORTED_DEFERRABLE_CONSTRAINT',
      capability: 'deferrableConstraints',
      fallback: 'downgrade',
      severity: 'warning',
      path: [...path, 'deferrable'],
      message: `${this.dialect} does not support deferrable constraints. The constraint will be created without deferrable behavior.`,
    });
    this.addImpact('warning', constraint.type, 'A deferrable constraint will be created without deferrable behavior.');
    return next as T;
  }

  private capability(name: keyof DatabaseCapabilities): boolean {
    return this.options.capabilities?.[name] ?? true;
  }

  private warn(warning: BuilderWarning): void {
    this.warnings.push({
      dialect: this.dialect,
      ...warning,
    });
  }

  private addImpact(level: BuilderImpact['level'], operation: string, message: string): void {
    this.impact.push({ level, operation, message });
  }
}

function fallbackNativeColumnType(type: string): string {
  return type === 'native' ? 'text' : type;
}

function pruneEmptyObject<T extends Record<string, unknown>>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function createUnsupportedCapabilityMessage(warnings: BuilderWarning[]): string {
  const unsafeWarnings = warnings.filter((warning) => warning.severity === 'unsafe');
  const selected = unsafeWarnings.length > 0 ? unsafeWarnings : warnings;
  return selected.map((warning) => warning.message).join('\n');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
