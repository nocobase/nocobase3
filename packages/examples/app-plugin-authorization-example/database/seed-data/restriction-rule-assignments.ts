import { randomUUID } from 'node:crypto';
import type { SalesSeedContext } from './context.js';
import { restrictionRules } from './restriction-rules.js';
export function restrictionRuleAssignmentRows({
  users,
  now,
}: SalesSeedContext) {
  const subjects = [
    users.assistant,
    users.engineer,
    users.manager,
    users.delivery,
    users.proposal,
    users.coordinator,
  ].map((id) => ({ type: 'user', id }));
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
