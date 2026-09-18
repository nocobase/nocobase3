import { sharingRule } from '@nocobase/authorization/sharing-rules';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { databaseScope } from '@nocobase/app-plugin-authorization';
import {
  projectResource,
  quoteResource,
  orderResource,
} from '../../server/sales-resources.js';
import { label } from '../../catalog.js';
import { timestamps, type SalesSeedContext } from './context.js';
export const sharingRules = [
  sharingRule('example-delivery-orders', orderResource.reference())
    .title(label('rules.delivery'))
    .scope('view', 'orders', {
      type: 'policy',
      policy: databaseScope('example.sales.region'),
    })
    .scope('deliver', 'orders', {
      type: 'policy',
      policy: databaseScope('example.sales.region'),
    })
    .build(),
  sharingRule('example-selected-projects', projectResource.reference())
    .title(label('rules.projects'))
    .scope('view', 'projects', {
      type: 'records',
      ids: ['project-2', 'project-3', 'project-4'],
    })
    .build(),
  sharingRule('example-proposal-handover', quoteResource.reference())
    .title(label('teams.handover'))
    .scope('submit', 'quotes', { type: 'records', ids: ['quote-7'] })
    .scope('submit', 'projects', { type: 'records', ids: ['project-3'] })
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
