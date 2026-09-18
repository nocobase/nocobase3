import { defaultAccessRule } from '@nocobase/authorization/default-access';
import { databaseScope } from '@nocobase/app-plugin-authorization';
import {
  projectResource,
  quoteResource,
  orderResource,
} from '../../server/sales-resources.js';
import { timestamps, type SalesSeedContext } from './context.js';
export const defaultAccessRules = [
  defaultAccessRule(projectResource.reference())
    .scope('view', 'projects', databaseScope('recordsIOwn'))
    .scope('edit', 'projects', databaseScope('recordsIOwn'))
    .build(),
  defaultAccessRule(quoteResource.reference())
    .scope('view', 'quotes', databaseScope('example.sales.own'))
    .scope('edit', 'quotes', databaseScope('example.sales.own'))
    .scope('submit', 'quotes', databaseScope('example.sales.prepared'))
    .scope('submit', 'projects', databaseScope('example.sales.region'))
    .build(),
  defaultAccessRule(orderResource.reference())
    .scope('view', 'orders', databaseScope('example.sales.own'))
    .scope('deliver', 'orders', databaseScope('example.sales.own'))
    .build(),
];
export function defaultAccessRuleRows(context: SalesSeedContext) {
  return defaultAccessRules.map((rule) => ({
    id: `default:${rule.resource.id}`,
    resourceType: rule.resource.type,
    resourceId: rule.resource.id,
    actions: JSON.stringify(rule.actions),
    ...timestamps(context),
  }));
}
