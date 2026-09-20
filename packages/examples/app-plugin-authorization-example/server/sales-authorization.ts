import { type AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import {
  salesGroups,
  salesPages,
  salesCollections,
  salesResources,
} from './sales-resources.js';
import { createSalesRecordAccess } from './sales-record-access.js';
export { PROJECTS, QUOTES, ORDERS } from '../catalog.js';

export function registerSalesAuthorization(
  authz: AppAuthorizationService,
  database: DatabaseManager,
): void {
  for (const group of salesGroups) authz.resourceGroups.add(group);
  for (const page of salesPages) authz.pages.add(page);
  for (const collection of salesCollections)
    authz.db.collections.add(collection);
  for (const resource of salesResources) resource.register(authz.resources);
  for (const policy of createSalesRecordAccess(database))
    authz.recordAccess.add(policy);
}
