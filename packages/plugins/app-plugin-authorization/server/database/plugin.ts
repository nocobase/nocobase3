import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  composeDatabasePolicies,
  DatabaseAuthorizationService,
  type DatabaseAuthorizationApi,
} from './api.js';
import { DatabaseResourceAuthorizer } from './authorizer.js';
import { collectionResolver, describeCollection } from './collections.js';
import type { DatabaseAuthorizationParams } from './model.js';
import { builtInRecordAccess } from './record-access.js';

export type DatabasePlugin = AuthorizationPlugin<
  DatabaseAuthorizationApi,
  DatabaseConnection
>;

/** Registers the `database.collection` catalog type and `authz.database`. */
export function databasePlugin(database?: DatabaseManager): DatabasePlugin {
  const api = new DatabaseAuthorizationService();
  return {
    id: 'database',
    requiresGrants: true,
    composeConditions: (checks) => ({
      database: composeDatabasePolicies(checks),
    }),
    authorizationApi: { database: api },
    setup(authz): void {
      for (const definition of builtInRecordAccess)
        authz.recordAccess.define(definition);
      const connection = authz.connection;
      const resolveCollection = connection
        ? collectionResolver(connection, database)
        : undefined;
      const authorizer = new DatabaseResourceAuthorizer({
        recordAccess: authz.recordAccess,
        ...(resolveCollection ? { resolveCollection } : {}),
      });
      authz.resourceTypes.add<DatabaseAuthorizationParams>({
        type: 'database.collection',
        items: api.collections.items,
        actions: ['read', 'create', 'update', 'delete'],
        recordAccess: true,
        authorize: (request, context) =>
          authorizer.authorize(request, context.grants, context.constraints),
        authorizeUnrestricted: (request) =>
          authorizer.authorizeUnrestricted(request),
      });
      api.attach({
        compositeResources: authz.compositeResources,
        middleware: () => authz.middleware(),
        ...(connection ? { connection } : {}),
        describe: async (name) =>
          connection && api.collections.has(name)
            ? describeCollection(connection, name)
            : undefined,
      });
    },
  };
}
