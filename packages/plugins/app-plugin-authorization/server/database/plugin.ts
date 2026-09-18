import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  composeDatabasePolicies,
  DatabaseAuthorizationService,
  type DatabaseAuthorizationApi,
} from './api.js';
import { DatabaseResourceAuthorizer } from './authorizer.js';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import { collectionResolver } from './collections.js';
import type { DatabaseAuthorizationParams } from './model.js';
import {
  allRecords,
  customFilter,
  recordsIOwn,
  recordsICreated,
} from './record-access.js';

/**
 * The api is narrowed to the service so the host can bind itself to it after
 * the Authorization exists; a plugin's `setup` is not handed the instance.
 */
export interface DatabaseAuthorizationPlugin extends AuthorizationPlugin<
  DatabaseAuthorizationApi,
  DatabaseConnection
> {
  readonly authorizationApi: { db: DatabaseAuthorizationService };
}

export function databaseAuthorization(
  database?: DatabaseManager,
): DatabaseAuthorizationPlugin {
  const api = new DatabaseAuthorizationService();
  const collections = api.collections;
  return {
    id: 'database',
    composeConditions: (checks) => ({
      database: composeDatabasePolicies(checks),
    }),
    requiresGrants: true,
    authorizationApi: { db: api },
    setup(authz): void {
      for (const policy of [
        allRecords(),
        customFilter(),
        recordsIOwn(),
        recordsICreated(),
      ])
        authz.recordAccess.add(policy);
      // Collection metadata comes from the connection the host passed in; an
      // application that installed the plugin without one grants nothing.
      const authorizer = new DatabaseResourceAuthorizer({
        collections,
        recordAccess: authz.recordAccess,
        ...(authz.connection
          ? {
              resolveCollection: collectionResolver(authz.connection, database),
            }
          : {}),
      });
      authz.resourceTypes.add<
        DatabaseAuthorizationParams,
        DatabaseCollectionRegistry
      >({
        resourceType: 'database.collection',
        items: collections,
        actions: ['read', 'create', 'update', 'delete'].map((name) => ({
          name,
          authorize: (request, context) =>
            authorizer.authorize(
              {
                ...request,
                params: request.params as DatabaseAuthorizationParams,
              },
              context.grants,
              context.constraints,
            ),
          authorizeUnrestricted: (request) =>
            authorizer.authorizeUnrestricted({
              ...request,
              params: request.params as DatabaseAuthorizationParams,
            }),
        })),
      });
    },
  };
}

declare module '@nocobase/authorization/core' {
  interface AuthorizationResourceItems {
    'database.collection': DatabaseCollectionRegistry;
  }
}
