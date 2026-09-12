import type { AuthorizationPlugin } from '../../core/index.js';
import {
  DatabaseAuthorizationService,
  type DatabaseAuthorizationApi,
} from './api.js';
import { DatabaseResourceAuthorizer } from './authorizer.js';
import { DatabaseCollectionRegistry } from './collection-registry.js';
import type { DatabaseAuthorizationParams } from './model.js';
import { RecordAccessPolicyRegistry } from './record-access-registry.js';

export type DatabaseAuthorizationPlugin =
  AuthorizationPlugin<DatabaseAuthorizationApi>;

export interface DatabaseAuthorizationOptions {
  source?: string;
}

export function databaseAuthorization(
  options: DatabaseAuthorizationOptions = {},
): DatabaseAuthorizationPlugin {
  const source = options.source ?? 'main';
  const collections = new DatabaseCollectionRegistry(source);
  const recordAccess = new RecordAccessPolicyRegistry();
  const api = new DatabaseAuthorizationService(collections, recordAccess);
  return {
    id: 'database',
    requiresGrants: true,
    authorizationApi: { database: api },
    setup(authz): void {
      const authorizer = new DatabaseResourceAuthorizer({
        collections,
        recordAccess,
      });
      authz.resources.add<DatabaseAuthorizationParams>({
        resourceType: 'database.collection',
        authorize: (request, context) =>
          authorizer.authorize(request, context.grants, context.constraints),
      });
    },
  };
}
