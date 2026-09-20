import {
  defineRecordAccess,
  type RecordAccessPolicy,
} from '@nocobase/authorization/core';
import { buildFilter } from '@nocobase/repository-input';
import type { DatabaseManager } from '@nocobase/db';
import { label, PROJECTS, QUOTES, ORDERS } from '../catalog.js';
import {
  resolveOwnedSalesRecords,
  resolveRegionalSalesRecords,
  resolvePublicSalesRecords,
} from './sales-scopes.js';

/** Construct declarations with application-owned dependencies; registration stays in the Provider. */
export function createSalesRecordAccess(
  database: DatabaseManager,
): readonly RecordAccessPolicy[] {
  return [
    defineRecordAccess('example.sales.prepared', (access) =>
      access
        .title(label('sales.scope.prepared'))
        .resources({ type: 'database.collection', id: QUOTES })
        .resolve(({ principal }) =>
          buildFilter((filter) =>
            filter.string('preparedById').eq(principal.id),
          ),
        ),
    ),
    defineRecordAccess('example.sales.own', (access) =>
      access
        .title(label('sales.scope.own'))
        .resources(
          ...[QUOTES, ORDERS].map((id) => ({
            type: 'database.collection',
            id,
          })),
        )
        .resolve((context) => resolveOwnedSalesRecords(database, context)),
    ),
    defineRecordAccess('example.sales.region', (access) =>
      access
        .title(label('sales.scope.region'))
        .resources(
          ...[PROJECTS, QUOTES, ORDERS].map((id) => ({
            type: 'database.collection',
            id,
          })),
        )
        .resolve((context) => resolveRegionalSalesRecords(database, context)),
    ),
    defineRecordAccess('example.sales.public', (access) =>
      access
        .title(label('sales.scope.public'))
        .resources(
          ...[PROJECTS, QUOTES, ORDERS].map((id) => ({
            type: 'database.collection',
            id,
          })),
        )
        .resolve((context) => resolvePublicSalesRecords(database, context)),
    ),
  ];
}
