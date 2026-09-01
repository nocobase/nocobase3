import type { DatabaseDialect } from '../../database/config.js';
import { SchemaInspectorError } from './errors.js';
import type { SchemaInspector } from './inspector.js';
import {
  decodePhysicalCollectionCursor,
  encodePhysicalCollectionCursor,
  sameCursorFilter,
  type DecodedPhysicalCollectionCursor,
  type PhysicalCollectionCursorFilter,
} from './shared/cursor.js';
import type {
  ListPhysicalCollectionsOptions,
  PhysicalCollectionIdentifier,
  PhysicalCollectionPage,
  PhysicalCollectionSchema,
  PhysicalCollectionSummary,
  PhysicalSchemaInfo,
  ScanPhysicalCollectionsOptions,
} from './types.js';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;
const PHYSICAL_COLLECTION_KINDS = new Set([
  'table',
  'partitionedTable',
  'foreignTable',
  'view',
  'materializedView',
]);

export interface NormalizedPhysicalCollectionListOptions {
  readonly limit: number;
  readonly schemas?: readonly string[];
  readonly tableNamePrefixes?: readonly string[];
  readonly kinds?: ListPhysicalCollectionsOptions['kinds'];
}

export abstract class BaseSchemaInspector implements SchemaInspector {
  protected constructor(
    protected readonly connectionName: string,
    protected readonly dialect: DatabaseDialect,
  ) {}

  async listSchemas(): Promise<PhysicalSchemaInfo[]> {
    return this.run(() => this.inspectSchemas());
  }

  async getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined> {
    this.assertIdentifier(identifier);
    return this.run(() => this.inspectCollection(identifier), identifier);
  }

  async listPhysicalCollections(
    options: ListPhysicalCollectionsOptions = {},
  ): Promise<PhysicalCollectionPage> {
    this.assertOptionsObject(options);
    const normalized = this.normalizeListOptions(options);
    const filter = cursorFilter(normalized);
    const cursor = this.resolveCursor(options.cursor, filter);

    if (
      normalized.schemas?.length === 0 ||
      normalized.tableNamePrefixes?.length === 0 ||
      normalized.kinds?.length === 0
    ) {
      return { items: [] };
    }

    const results = await this.run(() =>
      this.inspectCollectionSummaries(
        normalized,
        cursor?.after,
        normalized.limit + 1,
      ),
    );
    const items = results.slice(0, normalized.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        results.length > normalized.limit && last
          ? encodePhysicalCollectionCursor({
              after: { schema: last.schema, tableName: last.tableName },
              filter,
            })
          : undefined,
    };
  }

  async *scanPhysicalCollections(
    options: ScanPhysicalCollectionsOptions = {},
  ): AsyncIterable<PhysicalCollectionSchema> {
    this.assertOptionsObject(options);
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.assertPageSize(pageSize, 'pageSize');
    let cursor: string | undefined;
    do {
      const page = await this.listPhysicalCollections({
        limit: pageSize,
        cursor,
        schemas: options.schemas,
        tableNamePrefixes: options.tableNamePrefixes,
        kinds: options.kinds,
      });
      for (const summary of page.items) {
        const collection = await this.getPhysicalCollection({
          schema: summary.schema,
          tableName: summary.tableName,
        });
        if (collection) {
          yield collection;
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  protected abstract inspectSchemas(): Promise<PhysicalSchemaInfo[]>;
  protected abstract inspectCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined>;
  protected abstract inspectCollectionSummaries(
    options: NormalizedPhysicalCollectionListOptions,
    after: DecodedPhysicalCollectionCursor['after'] | undefined,
    fetchLimit: number,
  ): Promise<PhysicalCollectionSummary[]>;

  protected invalidOptions(
    message: string,
    identifier?: Partial<PhysicalCollectionIdentifier>,
  ): SchemaInspectorError {
    return new SchemaInspectorError(message, {
      code: 'SCHEMA_INSPECTION_INVALID_OPTIONS',
      connectionName: this.connectionName,
      dialect: this.dialect,
      schema: identifier?.schema,
      tableName: identifier?.tableName,
    });
  }

  private normalizeListOptions(
    options: ListPhysicalCollectionsOptions,
  ): NormalizedPhysicalCollectionListOptions {
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    this.assertPageSize(limit, 'limit');
    return {
      limit,
      schemas: this.normalizeStrings(options.schemas, 'schemas', false),
      tableNamePrefixes: this.normalizeStrings(
        options.tableNamePrefixes,
        'tableNamePrefixes',
        true,
      ),
      kinds: this.normalizeKinds(options.kinds),
    };
  }

  private resolveCursor(
    value: string | undefined,
    filter: PhysicalCollectionCursorFilter,
  ): DecodedPhysicalCollectionCursor | undefined {
    if (value === undefined) {
      return undefined;
    }
    const cursor =
      typeof value === 'string' && value !== ''
        ? decodePhysicalCollectionCursor(value)
        : undefined;
    if (!cursor || !sameCursorFilter(cursor.filter, filter)) {
      throw new SchemaInspectorError(
        'Schema inspection cursor is invalid or does not match the current filters.',
        {
          code: 'SCHEMA_INSPECTION_INVALID_CURSOR',
          connectionName: this.connectionName,
          dialect: this.dialect,
        },
      );
    }
    return cursor;
  }

  private assertIdentifier(identifier: PhysicalCollectionIdentifier): void {
    if (
      !identifier ||
      typeof identifier !== 'object' ||
      Array.isArray(identifier) ||
      typeof identifier.tableName !== 'string' ||
      identifier.tableName.trim() === ''
    ) {
      throw this.invalidOptions(
        'Physical collection tableName must be a non-empty string.',
        identifier,
      );
    }
    if (
      identifier.schema !== undefined &&
      (typeof identifier.schema !== 'string' || identifier.schema.trim() === '')
    ) {
      throw this.invalidOptions(
        'Physical collection schema must be a non-empty string when provided.',
        identifier,
      );
    }
  }

  private assertOptionsObject(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw this.invalidOptions(
        'Schema inspection options must be an object when provided.',
      );
    }
  }

  private assertPageSize(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
      throw this.invalidOptions(
        `Schema inspection ${name} must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
      );
    }
  }

  private normalizeStrings<T extends string>(
    values: readonly T[] | undefined,
    name: string,
    allowEmpty: boolean,
  ): readonly T[] | undefined {
    if (values === undefined) {
      return undefined;
    }
    if (!Array.isArray(values)) {
      throw this.invalidOptions(
        `Schema inspection ${name} must be an array of strings.`,
      );
    }
    for (const value of values) {
      if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
        throw this.invalidOptions(
          `Schema inspection ${name} must contain only ${allowEmpty ? '' : 'non-empty '}strings.`,
        );
      }
    }
    return [...new Set(values)].sort();
  }

  private normalizeKinds(
    values: ListPhysicalCollectionsOptions['kinds'],
  ): ListPhysicalCollectionsOptions['kinds'] {
    const normalized = this.normalizeStrings(values, 'kinds', false);
    for (const value of normalized ?? []) {
      if (!PHYSICAL_COLLECTION_KINDS.has(value)) {
        throw this.invalidOptions(
          `Unsupported physical collection kind "${value}".`,
        );
      }
    }
    return normalized;
  }

  private async run<T>(
    action: () => Promise<T>,
    identifier?: PhysicalCollectionIdentifier,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof SchemaInspectorError) {
        throw error;
      }
      throw new SchemaInspectorError('Database schema inspection failed.', {
        code: isPermissionError(error)
          ? 'SCHEMA_INSPECTION_PERMISSION_DENIED'
          : 'SCHEMA_INSPECTION_FAILED',
        connectionName: this.connectionName,
        dialect: this.dialect,
        schema: identifier?.schema,
        tableName: identifier?.tableName,
        cause: error,
      });
    }
  }
}

function cursorFilter(
  options: NormalizedPhysicalCollectionListOptions,
): PhysicalCollectionCursorFilter {
  return {
    schemas: options.schemas,
    tableNamePrefixes: options.tableNamePrefixes,
    kinds: options.kinds,
  };
}

function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as Record<string, unknown>;
  const code = scalarString(record.code ?? record.sqlState);
  const message = scalarString(record.message);
  return (
    code === '42501' ||
    code === 'SQLITE_AUTH' ||
    code === 'ER_TABLEACCESS_DENIED_ERROR' ||
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    /permission denied|access denied|not authorized/i.test(message)
  );
}

function scalarString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? `${value}`
    : '';
}
