/**
 * Test support entrypoint.
 *
 * Runtime packages should import the main `@nocobase/db` entrypoint. This
 * subpath exists so dialect packages can own their unit tests without
 * reaching into another package's source tree with relative imports.
 */
export { attachDatabaseDriverRuntime } from './database/runtime.js';
export { resolveDatabaseCapabilities } from './database/capabilities.js';
export {
  resolveKnexConnectionConfig,
  type KnexConnectionConfig,
} from './database/internal/knex/config.js';
export { createKnexClient } from './database/internal/knex/client.js';
export { CollectionRenameAtomicityError } from './collection/builder/builder.js';
export { DatabaseCollectionMetadataStore } from './metadata/internal/database-document-store.js';
export {
  compileJsonCondition,
  validateJsonCondition,
} from './repository/json-filter.js';
export { DefaultFilterBuilder } from './repository/filter-builder.js';
export {
  temporalBinding,
  temporalProjection,
} from './repository/internal/temporal-sql.js';
