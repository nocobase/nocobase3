// Supported package API. Internal modules are intentionally not re-exported.
export {
  CollectionMetadataStoreRequiredError,
  createDatabaseManager,
} from './database/manager.js';
export { databaseManagerToken } from './database/token.js';
export { defineDatabase } from './database/config.js';
export { SchemaManagementNotAllowedError } from './database/schema-management.js';
export type {
  ConnectionConfig,
  DatabaseConfig,
  DatabaseDialect,
  DatabaseDriver,
  MssqlConnectionConfig,
  MysqlConnectionConfig,
  OracleConnectionConfig,
  PostgresConnectionConfig,
  SchemaManagementMode,
  SqliteConnectionConfig,
} from './database/config.js';
export type { DatabaseConnection } from './database/connection.js';
export type { DatabaseManager } from './database/manager.js';

export { CollectionRelationValidationError } from './collection/registry/relation-validator.js';
export { CollectionResolutionError } from './collection/resolver/errors.js';
export type {
  BuilderExecOptions,
  BuilderResult,
  CollectionAlterBuilder,
  CollectionDefinition,
  CollectionDefinitionBuilder,
  CollectionOperation,
  FieldDefinition,
  FieldDefinitionBuilder,
  RelationFieldBuilder,
  RelationFieldDefinition,
  OptimisticLockDefinition,
} from './collection/types.js';
export type { CollectionBuilder } from './collection/builder/builder.js';

export type {
  ComparisonOperator,
  DeleteQuery,
  Expression,
  ExpressionBuilder,
  InsertQuery,
  QueryAdapter,
  Row,
  SelectQuery,
  SqlBool,
  UpdateQuery,
} from './query/types.js';

export { defineMigration } from './migration/define.js';
export { loadMigrations, validateMigrations } from './migration/loader.js';
export { createMigrator } from './migration/migrator.js';
export type { Migrator } from './migration/migrator.js';
export type {
  CreateMigratorOptions,
  DatabaseMigratorOptions,
  MigrationContext,
  MigrationDefinition,
  MigrationRollbackResult,
  MigrationRunResult,
  MigrationSource,
  MigrationTransactionMode,
} from './migration/types.js';

export { defineSeed } from './seed/define.js';
export { loadSeeds, validateSeeds } from './seed/loader.js';
export { createSeeder } from './seed/seeder.js';
export type { Seeder } from './seed/seeder.js';
export type {
  CreateSeederOptions,
  DatabaseSeederOptions,
  SeedContext,
  SeedDefinition,
  SeedRunResult,
  SeedSource,
  SeedTransactionMode,
} from './seed/types.js';

export {
  CollectionMetadataConflictError,
  CollectionMetadataStoreReadOnlyError,
} from './metadata/document-store-errors.js';
export { CollectionMetadataPatchError } from './metadata/service-errors.js';
export { CollectionMetadataValidationError } from './metadata/errors.js';
export { defineCollectionMetadata } from './metadata/define.js';
export { extractLegacyCollectionMetadata } from './metadata/legacy-extraction.js';
export { InMemoryCollectionMetadataStore } from './metadata/in-memory-document-store.js';
export { ModuleCollectionMetadataStore } from './metadata/module-document-store.js';
export { validateCollectionMetadataDocument } from './metadata/validation.js';
export type {
  CollectionMetadataDocument,
  FieldMetadata,
  RelationMetadata,
} from './metadata/document.js';
export type { CollectionMetadataStore } from './metadata/document-store.js';

export type { DatabaseCapabilities } from './schema/adapter.js';
export type { SchemaInspector } from './schema/inspector/types.js';

export { UnsupportedCapabilityError } from './schema/capabilities.js';

export { RepositoryError } from './repository/errors.js';
export type {
  AggregateAst,
  AggregateBuilder,
  AggregateExpression,
  AggregateFunction,
  AggregateNode,
  AggregateOptions,
  AggregateResult,
  AggregateSelection,
  AggregateSelectionResult,
  BooleanFilterOperators,
  NumericMutationOperand,
  NumericMutationOperation,
  NumericMutationJsonInput,
  NumericMutationBuilder,
  NumericMutationInput,
  ScalarUpdateValues,
  DynamicUpdateMutationInput,
  ConnectTarget,
  CreateManyOptions,
  CreateManyResult,
  CreateMutationValues,
  CreateOneOptions,
  CreateRelationFieldMutationBuilder,
  CreateRelationFieldMutationInput,
  CreateRelationFieldMutationJsonInput,
  CreateTarget,
  CreatedTargetReference,
  DateFilterOperators,
  DeleteManyOptions,
  DeleteManyResult,
  DeleteOneOptions,
  DeleteOneResult,
  DescribeMutationOptions,
  EmptyFilterOperators,
  FilterAst,
  FilterBuilder,
  FilterConditionNode,
  FilterFieldGroup,
  FilterGroupNode,
  FilterLiteral,
  FilterNode,
  FilterOnlyOptions,
  FilterOperator,
  FilterOperand,
  FilterRelationNode,
  FilterScalar,
  FilterShorthand,
  FilterShorthandValue,
  FilterValue,
  FilterVariable,
  FindManyOptions,
  FindOneOptions,
  GroupByOptions,
  GroupByResult,
  GroupBySelectionResult,
  JsonFilterOperators,
  MutationScope,
  MutationValidationError,
  MutationValidationResult,
  NestedCreateOptions,
  NonEmptyRepositorySort,
  NonEmptySortAst,
  NumberFilterOperators,
  RelationClearNode,
  RelationCreateValues,
  RelationCreateValuesInput,
  RelationDeleteInput,
  RelationDeleteInputList,
  RelationDeleteTarget,
  RelationFilterOperators,
  RelationMutationAst,
  RelationMutationNode,
  RelationModifyNode,
  RelationPatchNode,
  RelationReplaceNode,
  RelationSetNode,
  RelationTargetSelector,
  RelationTargetSelectorInput,
  RelationUpdateInput,
  RelationUpdateInputList,
  RelationUpdateTarget,
  RelationUpdateValues,
  RelationUpsertInput,
  RelationUpsertInputList,
  RelationUpsertTarget,
  Repository,
  RepositoryAggregateNumeric,
  RepositoryContext,
  RepositoryCursor,
  RepositoryCursorDirection,
  RepositoryFilter,
  RepositoryMutationDescription,
  RepositoryMutationScalarValue,
  RepositoryPath,
  RepositoryReadOptions,
  RepositoryRecord,
  RepositoryRelationMutationDescription,
  RepositorySelect,
  RepositorySort,
  RepositoryUniqueFieldSetDescription,
  RelationSelectBuilder,
  SelectAst,
  SelectBuilder,
  SelectIncludeNode,
  SelectNode,
  SingleMutationResult,
  SingleMutationSelector,
  SortAggregateBuilder,
  SortAggregateNode,
  SortAst,
  SortBuilder,
  SortDirection,
  SortExpression,
  SortFieldBuilder,
  SortFieldNode,
  SortNullsPosition,
  SortNullsBuilder,
  SortNode,
  SortRelationBuilder,
  StringFilterOperators,
  StringFilterOptions,
  StreamOptions,
  TextFilterOperators,
  TimeFilterOperators,
  UniqueSelector,
  UpdateManyOptions,
  UpdateManyResult,
  UpdateMutationValues,
  UpdateOneOptions,
  UpsertOneOptions,
  UpdateRelationFieldMutationBuilder,
  UpdateRelationFieldMutationInput,
  UpdateRelationFieldMutationJsonInput,
  ValidateMutationOptions,
} from './repository/types.js';
export type {
  RepositoryErrorCode,
  RepositoryErrorOptions,
} from './repository/errors.js';
