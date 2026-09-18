import { randomUUID } from 'node:crypto';
import type { SalesSeedContext } from './context.js';
import { restrictionRules } from './restriction-rules.js';
export function restrictionRuleAssignmentRows({
  users,
  now,
}: SalesSeedContext) {
  const subjects = [
    ...[users.assistant, users.engineer, users.manager, users.delivery].map(
      (id) => ({ type: 'user', id }),
    ),
    ...['proposal', 'delivery'].map((id) => ({
      type: 'example.sales.team',
      id,
    })),
  ];
  return restrictionRules.flatMap((rule) =>
    subjects.map((subject) => ({
      id: randomUUID(),
      restrictionRuleId: rule.key,
      subjectType: subject.type,
      subjectId: subject.id,
      createdAt: now,
    })),
  );
}
