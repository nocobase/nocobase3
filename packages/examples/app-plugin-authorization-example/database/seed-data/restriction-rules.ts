import { defineRestrictionRule } from '@nocobase/authorization/restriction-rules';
import {
  encodeAuthorizationTitle,
  selection,
} from '@nocobase/authorization/core';
import {
  projectReference,
  quoteResource,
  orderResource,
} from '../../server/sales-resources.js';
import { label, PROJECTS, QUOTES, ORDERS } from '../../catalog.js';
import { timestamps, type SalesSeedContext } from './context.js';
const publicRecords = selection.recordAccess('example.sales.public');
export const restrictionRules = [
  defineRestrictionRule(`example-public-${PROJECTS}`, projectReference)
    .title(label('rules.public'))
    .scope('view', 'projects', publicRecords)
    .scope('edit', 'projects', publicRecords)
    .build(),
  defineRestrictionRule(`example-public-${QUOTES}`, quoteResource.reference())
    .title(label('rules.public'))
    .scope('view', 'quotes', publicRecords)
    .scope('edit', 'quotes', publicRecords)
    .scope('submit', 'quotes', publicRecords)
    .scope('submit', 'projects', publicRecords)
    .build(),
  defineRestrictionRule(`example-public-${ORDERS}`, orderResource.reference())
    .title(label('rules.public'))
    .scope('view', 'orders', publicRecords)
    .scope('deliver', 'orders', publicRecords)
    .scope('manageRelations', 'orders', publicRecords)
    .build(),
];
export function restrictionRuleRows(context: SalesSeedContext) {
  return restrictionRules.map((rule) => ({
    id: rule.key,
    key: rule.key,
    title: encodeAuthorizationTitle(rule.title),
    resourceType: rule.resource.type,
    resourceId: rule.resource.id,
    actions: JSON.stringify(rule.actions),
    reason: rule.reason ?? null,
    ...timestamps(context),
  }));
}
