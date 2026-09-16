export { default } from './plugin.js';
export { DATABASE_EXPLORER_PAGE } from './routes/index.js';
export {
  listConnections,
  listCollections,
  readCollection,
  readPhysicalCollection,
  MAX_COLLECTION_PAGE_SIZE,
  type ExplorerDatabaseConfig,
} from './explorer.js';
export {
  describeConnection,
  describeConnections,
} from './connection-summary.js';
export { isSchemaInspectorError, toExplorerError } from './errors.js';
export {
  DatabaseExplorerError,
  type CollectionDetail,
  type CollectionEntry,
  type CollectionListResult,
  type ConnectionListResult,
  type ConnectionSummary,
  type DatabaseExplorerErrorCode,
  type ListCollectionsQuery,
  type PhysicalCollectionDetail,
} from './types.js';
