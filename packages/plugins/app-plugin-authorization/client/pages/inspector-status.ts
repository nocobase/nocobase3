import type { AuthorizationDecision } from '../authorization-client.js';

export type InspectionStatus = 'all' | 'scoped' | 'none' | 'error' | 'context';
export function inspectionStatus(
  decision: AuthorizationDecision,
  fields: readonly string[] = [],
): InspectionStatus {
  if (
    decision.reasons.some((reason) => reason.code === 'USER_CONTEXT_REQUIRED')
  )
    return 'context';
  if (
    decision.reasons.some((reason) =>
      /FAILED|UNAVAILABLE|INVALID_|UNKNOWN_/.test(reason.code),
    )
  )
    return 'error';
  if (decision.effect === 'deny') return 'none';
  if (decision.effect === 'permit') return 'all';
  const conditions = decision.conditions;
  if (
    conditions?.type === 'database' &&
    conditions.scope === true &&
    conditions.allFields === true
  )
    return 'all';
  if (
    conditions?.type === 'database' &&
    conditions.allFields === undefined &&
    conditions.scope === true &&
    Array.isArray(conditions.fields) &&
    fields.length > 0 &&
    fields.every((field) => (conditions.fields as unknown[]).includes(field))
  )
    return 'all';
  return 'scoped';
}
