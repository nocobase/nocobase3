import { selection } from '@nocobase/authorization/core';
import { defineDefaultAccessRule } from '@nocobase/authorization/default-access';
import {
  projectReference,
  quoteResource,
  orderResource,
} from '../../server/sales-resources.js';
import { timestamps, type SalesSeedContext } from './context.js';
export const defaultAccessRules = [
  defineDefaultAccessRule('example-default-projects', projectReference)
    .scope('view', 'projects', selection.recordAccess('recordsIOwn'))
    .scope('edit', 'projects', selection.recordAccess('recordsIOwn'))
    .build(),
  defineDefaultAccessRule('example-default-quotes', quoteResource.reference())
    .scope('view', 'quotes', selection.recordAccess('example.sales.own'))
    .scope('edit', 'quotes', selection.recordAccess('example.sales.prepared'))
    .scope('submit', 'quotes', selection.recordAccess('example.sales.prepared'))
    .scope('submit', 'projects', selection.recordAccess('example.sales.region'))
    .build(),
  defineDefaultAccessRule('example-default-orders', orderResource.reference())
    .scope('view', 'orders', selection.recordAccess('example.sales.own'))
    .scope('deliver', 'orders', selection.recordAccess('example.sales.own'))
    .scope(
      'manageRelations',
      'orders',
      selection.recordAccess('example.sales.own'),
    )
    .build(),
];
export function defaultAccessRuleRows(context: SalesSeedContext) {
  return defaultAccessRules.map((rule) => ({
    id: rule.key,
    key: rule.key,
    resourceType: rule.resource.type,
    resourceId: rule.resource.id,
    actions: JSON.stringify(rule.actions),
    ...timestamps(context),
  }));
}
