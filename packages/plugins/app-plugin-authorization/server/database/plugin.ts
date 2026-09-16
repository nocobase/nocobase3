import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import {
  DatabaseAuthorizationService,
  type DatabaseAuthorizationApi,
} from './api.js';
import { DatabaseResourceAuthorizer } from './authorizer.js';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import { collectionResolver } from './collections.js';
import type { DatabaseAuthorizationParams } from './model.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

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

export function databaseAuthorization(): DatabaseAuthorizationPlugin {
  const collections = new DatabaseCollectionRegistry();
  const recordAccess = new RecordAccessPolicyRegistry();
  const api = new DatabaseAuthorizationService(recordAccess);
  return {
    id: 'database',
    requiresGrants: true,
    authorizationApi: { db: api },
    setup(authz): void {
      // Collection metadata comes from the connection the host passed in; an
      // application that installed the plugin without one grants nothing.
      const authorizer = new DatabaseResourceAuthorizer({
        collections,
        recordAccess,
        ...(authz.connection
          ? { resolveCollection: collectionResolver(authz.connection) }
          : {}),
      });
      authz.resources.add<
        DatabaseAuthorizationParams,
        DatabaseCollectionRegistry
      >({
        resourceType: 'database.collection',
        items: collections,
        authorize: (request, context) =>
          authorizer.authorize(request, context.grants, context.constraints),
        authorizeUnrestricted: (request) =>
          authorizer.authorizeUnrestricted(request),
      });
    },
  };
}

declare module '@nocobase/authorization/core' {
  interface AuthorizationResourceItems {
    'database.collection': DatabaseCollectionRegistry;
  }
}
