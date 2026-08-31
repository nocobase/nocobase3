import type { PermissionGrant } from '../permission-sets/model.js';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import type {
  DatabaseAccessScope,
  DatabaseGrantDefinition,
  DatabaseRecordAccess,
} from './model.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

export interface DatabaseApi {
  readonly collections: DatabaseCollectionRegistry;
  readonly recordAccess: RecordAccessPolicyRegistry;
  grant(resource: string, definition: DatabaseGrantDefinition): PermissionGrant;
  scope(recordAccess: DatabaseRecordAccess): DatabaseAccessScope;
}

export interface DatabaseAuthorizationApi {
  database: DatabaseApi;
}

export class DatabaseAuthorizationService implements DatabaseApi {
  readonly collections: DatabaseCollectionRegistry;
  readonly recordAccess: RecordAccessPolicyRegistry;

  constructor(
    collections: DatabaseCollectionRegistry,
    recordAccess: RecordAccessPolicyRegistry,
  ) {
    this.collections = collections;
    this.recordAccess = recordAccess;
  }

  grant(
    resource: string,
    definition: DatabaseGrantDefinition,
  ): PermissionGrant {
    return {
      resource: {
        type: 'database.collection',
        id: this.collections.resolveName(resource),
      },
      actions: Object.entries(definition).map(([action, config]) => ({
        action,
        policy: { type: 'database', ...config },
      })),
    };
  }

  scope(recordAccess: DatabaseRecordAccess): DatabaseAccessScope {
    return {
      type: 'database',
      recordAccess,
    };
  }
}
