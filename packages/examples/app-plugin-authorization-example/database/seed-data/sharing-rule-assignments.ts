import { randomUUID } from 'node:crypto';
import type { SalesSeedContext } from './context.js';
export function sharingRuleAssignmentRows({ users, now }: SalesSeedContext) {
  return [
    {
      sharingRuleId: 'example-delivery-orders',
      subjectType: 'user',
      subjectId: users.delivery,
    },
    {
      sharingRuleId: 'example-delivery-orders',
      subjectType: 'example.sales.team',
      subjectId: 'delivery',
    },
    {
      sharingRuleId: 'example-selected-projects',
      subjectType: 'user',
      subjectId: users.assistant,
    },
    {
      sharingRuleId: 'example-selected-projects',
      subjectType: 'user',
      subjectId: users.engineer,
    },
    {
      sharingRuleId: 'example-proposal-handover',
      subjectType: 'example.sales.team',
      subjectId: 'proposal',
    },
  ].map((row) => ({
    id: randomUUID(),
    ...row,
    createdAt: now,
  }));
}
