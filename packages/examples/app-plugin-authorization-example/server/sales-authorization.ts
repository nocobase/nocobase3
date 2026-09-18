import { type AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { label, PROJECTS, QUOTES, ORDERS } from '../catalog.js';
import {
  salesGroups,
  salesPages,
  salesCollections,
  salesResources,
  quotesCollection,
} from './sales-resources.js';
import {
  resolveOwnedSalesRecords,
  resolveRegionalSalesRecords,
  resolvePublicSalesRecords,
} from './sales-scopes.js';
export { PROJECTS, QUOTES, ORDERS } from '../catalog.js';

export function registerSalesAuthorization(
  authz: AppAuthorizationService,
  database: DatabaseManager,
): void {
  for (const group of salesGroups) authz.resourceGroups.add(group);
  for (const page of salesPages) page.register(authz.pages);
  for (const collection of salesCollections) collection.register(authz.db);
  for (const resource of salesResources) resource.register(authz.resources);
  const quotes = quotesCollection.reference(authz.db);

  quotes
    .recordAccess('example.sales.prepared')
    .title(label('sales.scope.prepared'))
    .resolve(({ principal, filter }) => filter.eq('preparedById', principal.id))
    .register();
  authz.db.recordAccess
    .define('example.sales.own', {
      collections: [QUOTES, ORDERS],
      title: label('sales.scope.own'),
    })
    .resolve((context) => resolveOwnedSalesRecords(database, context))
    .register();
  authz.db.recordAccess
    .define('example.sales.region', {
      collections: [PROJECTS, QUOTES, ORDERS],
      title: label('sales.scope.region'),
    })
    .resolve((context) => resolveRegionalSalesRecords(database, context))
    .register();
  authz.db.recordAccess
    .define('example.sales.public', {
      collections: [PROJECTS, QUOTES, ORDERS],
      title: label('sales.scope.public'),
    })
    .resolve((context) => resolvePublicSalesRecords(database, context))
    .register();
}
