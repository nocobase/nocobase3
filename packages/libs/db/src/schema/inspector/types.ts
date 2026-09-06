import type { DatabaseDialect } from '../../database/config.js';

export type PhysicalCollectionKind =
  'table' | 'partitionedTable' | 'foreignTable' | 'view' | 'materializedView';

export interface PhysicalSchemaInfo {
  readonly name: string;
  readonly default: boolean;
}

export interface PhysicalCollectionIdentifier {
  readonly tableName: string;
  readonly schema?: string;
}

export interface PhysicalCollectionIdentity {
  readonly tableName: string;
  readonly schema: string;
}

export interface PhysicalCollectionSummary extends PhysicalCollectionIdentity {
  readonly kind: PhysicalCollectionKind;
  readonly comment?: string;
}

export interface ListPhysicalCollectionsOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly schemas?: readonly string[];
  readonly tableNamePrefixes?: readonly string[];
  readonly kinds?: readonly PhysicalCollectionKind[];
}

export interface PhysicalCollectionPage {
  readonly items: readonly PhysicalCollectionSummary[];
  readonly nextCursor?: string;
}

export interface ScanPhysicalCollectionsOptions {
  readonly pageSize?: number;
  readonly schemas?: readonly string[];
  readonly tableNamePrefixes?: readonly string[];
  readonly kinds?: readonly PhysicalCollectionKind[];
}

export type PhysicalDataType =
  | 'integer'
  | 'bigInt'
  | 'string'
  | 'text'
  | 'boolean'
  | 'decimal'
  | 'float'
  | 'double'
  | 'date'
  | 'time'
  | 'datetime'
  | 'datetimeTz'
  | 'json'
  | 'blob'
  | 'uuid'
  | 'native';

export interface PhysicalColumnDefault {
  readonly expression: string;
  readonly value?: unknown;
}

export interface PhysicalGeneratedColumn {
  readonly expression?: string;
  readonly stored?: boolean;
}

export interface PhysicalColumnSchema {
  readonly columnName: string;
  readonly ordinalPosition: number;
  readonly dataType: PhysicalDataType;
  readonly nativeType: string;
  readonly nativeTypeSchema?: string;
  readonly nullable: boolean;
  readonly default?: PhysicalColumnDefault;
  readonly autoIncrement: boolean;
  readonly unsigned?: boolean;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  /** Decimal places in fractional seconds, separate from numeric precision. */
  readonly fractionalSecondsPrecision?: number;
  readonly comment?: string;
  readonly generated?: PhysicalGeneratedColumn;
}

export interface PhysicalPrimaryKeySchema {
  readonly name?: string;
  readonly columns: readonly string[];
}

export interface PhysicalUniqueConstraintSchema {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly deferrable?: boolean;
  readonly initiallyDeferred?: boolean;
}

export type PhysicalIndexKey = (
  | {
      readonly columnName: string;
      readonly expression?: never;
    }
  | {
      readonly expression: string;
      readonly columnName?: never;
    }
) & {
  readonly order?: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
};

export interface PhysicalIndexConstraintReference {
  readonly kind: 'primaryKey' | 'unique';
  readonly name?: string;
}

export interface PhysicalIndexSchema {
  readonly name: string;
  readonly keys: readonly PhysicalIndexKey[];
  readonly includeColumns?: readonly string[];
  readonly unique: boolean;
  readonly backsConstraint?: PhysicalIndexConstraintReference;
  readonly method?: string;
  readonly predicate?: string;
}

export type PhysicalReferentialAction =
  'noAction' | 'restrict' | 'cascade' | 'setNull' | 'setDefault';

export interface PhysicalForeignKeySchema {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly referencedCollection: PhysicalCollectionIdentity;
  readonly referencedColumns: readonly string[];
  readonly onDelete?: PhysicalReferentialAction;
  readonly onUpdate?: PhysicalReferentialAction;
  readonly deferrable?: boolean;
  readonly initiallyDeferred?: boolean;
}

export interface PhysicalCheckConstraintSchema {
  readonly name?: string;
  readonly expression: string;
}

export type PhysicalSchemaAspect =
  | 'columns'
  | 'primaryKey'
  | 'uniqueConstraints'
  | 'indexes'
  | 'foreignKeys'
  | 'checkConstraints'
  | 'comments'
  | 'viewDefinition';

export type PhysicalSchemaInspectionStatus =
  'complete' | 'partial' | 'unsupported';

export interface SchemaInspectionWarning {
  readonly code: string;
  readonly message: string;
  readonly aspect: PhysicalSchemaAspect;
}

export interface PhysicalSchemaInspection {
  readonly aspects: Readonly<
    Record<PhysicalSchemaAspect, PhysicalSchemaInspectionStatus>
  >;
  readonly warnings: readonly SchemaInspectionWarning[];
}

export interface PhysicalCollectionSchema extends PhysicalCollectionSummary {
  readonly viewDefinition?: string;
  readonly columns: readonly PhysicalColumnSchema[];
  readonly primaryKey?: PhysicalPrimaryKeySchema;
  readonly uniqueConstraints: readonly PhysicalUniqueConstraintSchema[];
  readonly indexes: readonly PhysicalIndexSchema[];
  readonly foreignKeys: readonly PhysicalForeignKeySchema[];
  readonly checkConstraints: readonly PhysicalCheckConstraintSchema[];
  readonly inspection: PhysicalSchemaInspection;
}

export interface SchemaInspector {
  listSchemas(): Promise<PhysicalSchemaInfo[]>;
  getPhysicalCollection(
    identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined>;
  listPhysicalCollections(
    options?: ListPhysicalCollectionsOptions,
  ): Promise<PhysicalCollectionPage>;
  scanPhysicalCollections(
    options?: ScanPhysicalCollectionsOptions,
  ): AsyncIterable<PhysicalCollectionSchema>;
}

export interface SchemaInspectorFactoryContext<
  TClient = unknown,
  TConfig = unknown,
> {
  readonly connectionName: string;
  readonly config: Readonly<TConfig>;
  resolveClient(): Promise<TClient>;
}

export interface DatabaseDialectAdapter<TClient = unknown, TConfig = unknown> {
  readonly dialect: DatabaseDialect;
  createSchemaInspector(
    context: SchemaInspectorFactoryContext<TClient, TConfig>,
  ): SchemaInspector;
}
