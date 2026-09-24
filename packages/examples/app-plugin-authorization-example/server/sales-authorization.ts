import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import {
  salesSections,
  salesCollections,
  salesResources,
} from './sales-resources.js';
import { createSalesRecordAccess } from './sales-record-access.js';
export { PROJECTS, QUOTES, ORDERS } from '../catalog.js';

export function registerSalesAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  for (const section of salesSections) authz.sections.add(section);
  for (const collection of salesCollections)
    authz.database.collections.add(collection);
  for (const resource of salesResources) authz.business.define(resource);
  for (const definition of createSalesRecordAccess(database))
    authz.recordAccess.define(definition);
}
