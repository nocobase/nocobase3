import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import {
  DatabaseAuthorizationService,
  type DatabaseAuthorizationApi,
} from './api.js';
import { DatabaseResourceAuthorizer } from './authorizer.js';
import { collectionResolver } from './collections.js';
import type { DatabaseAuthorizationParams } from './model.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

export type DatabaseAuthorizationPlugin = AuthorizationPlugin<
  DatabaseAuthorizationApi,
  DatabaseConnection
>;

export interface DatabaseAuthorizationOptions {
  source?: string;
}

export function databaseAuthorization(
  options: DatabaseAuthorizationOptions = {},
): DatabaseAuthorizationPlugin {
  const source = options.source ?? 'main';
  const recordAccess = new RecordAccessPolicyRegistry();
  const api = new DatabaseAuthorizationService(source, recordAccess);
  return {
    id: 'database',
    requiresGrants: true,
    authorizationApi: { database: api },
    setup(authz): void {
      // Collection metadata comes from the connection the host passed in; an
      // application that installed the plugin without one grants nothing.
      const authorizer = new DatabaseResourceAuthorizer({
        source,
        recordAccess,
        ...(authz.connection
          ? { resolveCollection: collectionResolver(authz.connection) }
          : {}),
      });
      authz.resources.add<DatabaseAuthorizationParams>({
        resourceType: 'database.collection',
        authorize: (request, context) =>
          authorizer.authorize(request, context.grants, context.constraints),
        authorizeUnrestricted: (request) =>
          authorizer.authorizeUnrestricted(request),
      });
    },
  };
}
