import { defineSharingRule } from '@nocobase/authorization/sharing-rules';
import {
  encodeAuthorizationTitle,
  selection,
} from '@nocobase/authorization/core';
import {
  projectReference,
  quoteResource,
  orderResource,
} from '../../server/sales-resources.js';
import { label } from '../../catalog.js';
import { timestamps, type SalesSeedContext } from './context.js';
export const sharingRules = [
  defineSharingRule('example-delivery-orders', orderResource.reference())
    .title(label('rules.delivery'))
    .scope('view', 'orders', selection.recordAccess('example.sales.region'))
    .scope('deliver', 'orders', selection.recordAccess('example.sales.region'))
    .scope(
      'manageRelations',
      'orders',
      selection.recordAccess('example.sales.region'),
    )
    .build(),
  defineSharingRule('example-selected-projects', projectReference)
    .title(label('rules.projects'))
    .scope(
      'view',
      'projects',
      selection.records(['project-2', 'project-3', 'project-4']),
    )
    .build(),
  defineSharingRule('example-proposal-handover', quoteResource.reference())
    .title(label('teams.handover'))
    .scope('edit', 'quotes', selection.records(['quote-7']))
    .scope('submit', 'quotes', selection.records(['quote-7']))
    .scope('submit', 'projects', selection.records(['project-3']))
    .build(),
];
export function sharingRuleRows(context: SalesSeedContext) {
  return sharingRules.map((rule) => ({
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
