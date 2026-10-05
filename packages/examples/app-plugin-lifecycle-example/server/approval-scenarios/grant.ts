// Scenario 28: approvals that grant a scope, and the use of that scope.
//
// Two lifecycles. An authorization request asks for one matter on one
// subject — a price exception or payment terms on a contract, a budget — and
// its approval writes a grant in the same transaction. The grant is a record
// of its own: it carries the approved scope (an amount, a number of uses, a
// validity window, the subject revision it was approved on) and every use is
// a `consume` self-transition, so the grant's version serializes uses and an
// overdraw is refused rather than raced.
import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  SCENARIO_COLLECTIONS,
  type LifecycleFiring,
  type ScenarioServices,
} from './services.js';

/** The collection authorization requests are kept in. */
export const AUTHORIZATION_REQUESTS = 'scenarioAuthorizationRequests' as const;

/** What an approval allows. A null limit or use count is unlimited. */
export interface GrantScope {
  readonly limitCents: number | null;
  readonly maxUses: number | null;
  /** ISO instants; the grant holds from `validFrom` until before `validUntil`. */
  readonly validFrom: string;
  readonly validUntil: string;
}

export type AuthorizationRequestState =
  'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface AuthorizationRequest extends LifecycleRecord {
  /** The business object, such as a contract. */
  readonly subjectId: string;
  /** The subject's revision the request was made on. */
  readonly subjectRevision: number;
  /** What is asked about the subject: `priceException`, `paymentTerms`, `budget`. */
  readonly matter: string;
  readonly applicantId: string;
  readonly requested: GrantScope;
  /** The active grant this request replaces, when it says so. */
  readonly supersedes?: string | null;
  readonly approverId?: string | null;
  /** The scope as approved, which may be narrower than the one asked for. */
  readonly approved?: GrantScope | null;
  readonly grantId?: string | null;
  readonly status: AuthorizationRequestState;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
}

export interface AuthorizationRequestParameters {
  approverRole: string;
  /** Matters that may not hold active grants on one subject at once. */
  conflictingMatters: readonly (readonly [string, string])[];
}

export interface AuthorizationRequestTypes {
  record: AuthorizationRequest;
  state: AuthorizationRequestState;
  parameters: AuthorizationRequestParameters;
  services: ScenarioServices;
}

export type BudgetGrantState =
  'active' | 'exhausted' | 'expired' | 'revoked' | 'superseded';

/** One use of a grant, kept on the grant. */
export interface GrantUsage {
  readonly key: string;
  readonly amountCents: number;
  readonly by: string;
  readonly at: string;
}

export interface BudgetGrant extends LifecycleRecord, GrantScope {
  readonly requestId: string;
  readonly subjectId: string;
  readonly subjectRevision: number;
  readonly matter: string;
  /** Who may use it: the applicant of the request. */
  readonly holderId: string;
  readonly approvedBy: string;
  readonly usedCents: number;
  readonly uses: number;
  readonly usages: readonly GrantUsage[];
  readonly supersedes: string | null;
  readonly supersededBy?: string | null;
  readonly revokedBy?: string | null;
  readonly revokedReason?: string | null;
  readonly status: BudgetGrantState;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
}

export interface BudgetGrantParameters {
  /** Who may revoke any grant, besides the approver who granted it. */
  revokeRole: string;
}

export interface BudgetGrantTypes {
  record: BudgetGrant;
  state: BudgetGrantState;
  parameters: BudgetGrantParameters;
  services: ScenarioServices;
}

type RequestContext = TransitionContext<AuthorizationRequestTypes>;
type GrantContext = TransitionContext<BudgetGrantTypes>;

function textOf(input: JsonObject, field: string): string {
  const value = input[field];
  return typeof value === 'string' ? value : '';
}

function asGrant(record: LifecycleRecord): BudgetGrant {
  return record as BudgetGrant;
}

/** Active grants on a subject, read through the transition's transaction. */
async function activeGrants(
  services: ScenarioServices,
  subjectId: string,
): Promise<BudgetGrant[]> {
  const rows = await services.records.list(
    SCENARIO_COLLECTIONS.budgetGrants,
    (row) => row.subjectId === subjectId && row.status === 'active',
  );
  return rows.map(asGrant);
}

function conflicting(
  matter: string,
  other: string,
  pairs: AuthorizationRequestParameters['conflictingMatters'],
): boolean {
  return pairs.some(
    ([a, b]) => (a === matter && b === other) || (a === other && b === matter),
  );
}

/**
 * What stands in the way of this request on its subject now: an active
 * grant for the same matter it does not say it replaces, or an active grant
 * for a conflicting matter. Asked at submission and again at approval,
 * because either may have appeared in between.
 */
async function standingGrantBlocker(
  context: RequestContext,
): Promise<GuardVerdict> {
  const { record, parameters, services } = context;
  for (const grant of await activeGrants(services, record.subjectId)) {
    if (grant.matter === record.matter && grant.id !== record.supersedes)
      return {
        code: 'activeGrant',
        message: `Grant "${String(grant.id)}" already covers ${record.matter}; ask to supersede it.`,
      };
    if (conflicting(record.matter, grant.matter, parameters.conflictingMatters))
      return {
        code: 'conflictingGrant',
        message: `Grant "${String(grant.id)}" for ${grant.matter} conflicts with ${record.matter}.`,
      };
  }
  return true;
}

function scopeProblems(scope: GrantScope): string[] {
  const problems: string[] = [];
  if (
    scope.limitCents !== null &&
    !(Number.isSafeInteger(scope.limitCents) && scope.limitCents > 0)
  )
    problems.push('The limit must be a positive amount.');
  if (
    scope.maxUses !== null &&
    !(Number.isSafeInteger(scope.maxUses) && scope.maxUses > 0)
  )
    problems.push('The number of uses must be positive.');
  if (!(scope.validFrom < scope.validUntil))
    problems.push('The validity window is empty.');
  return problems;
}

async function guardSubmission(context: RequestContext): Promise<GuardVerdict> {
  const { record, actor, parameters, services } = context;
  if (actor.id !== record.applicantId)
    return { code: 'applicantOnly', message: 'Only the applicant can submit.' };
  if (services.org.holderOf(parameters.approverRole) === undefined)
    return { code: 'noApprover', message: 'Nobody can approve this request.' };
  const duplicates = await services.records.list(
    AUTHORIZATION_REQUESTS,
    (row) =>
      row.id !== record.id &&
      row.subjectId === record.subjectId &&
      row.matter === record.matter &&
      row.status === 'pending',
  );
  if (duplicates.length)
    return {
      code: 'duplicateRequest',
      message: `Request "${String(duplicates[0].id)}" already asks for ${record.matter} on this subject.`,
    };
  if (record.supersedes) {
    const target = (await activeGrants(services, record.subjectId)).find(
      (grant) =>
        grant.id === record.supersedes && grant.matter === record.matter,
    );
    if (!target)
      return {
        code: 'nothingToSupersede',
        message: `No active ${record.matter} grant "${record.supersedes}" to supersede.`,
      };
  }
  return standingGrantBlocker(context);
}

async function guardApproval(context: RequestContext): Promise<GuardVerdict> {
  const { record, actor, services } = context;
  if (actor.id !== record.approverId)
    return {
      code: 'approverOnly',
      message: 'Only the assigned approver decides.',
    };
  if (actor.id === record.applicantId)
    return {
      code: 'selfApproval',
      message: 'Nobody approves their own request.',
    };
  if (!services.org.isActive(actor.id))
    return { code: 'inactive', message: 'An inactive person cannot decide.' };
  return standingGrantBlocker(context);
}

/** The approved scope: the request's, with the limit lowered if the approver says so. */
function approvedScope({ record, input }: RequestContext): GrantScope {
  const limit = input.limitCents;
  return {
    ...record.requested,
    limitCents: typeof limit === 'number' ? limit : record.requested.limitCents,
  };
}

function grantIdOf(request: AuthorizationRequest): string {
  return `grant-${String(request.id)}`;
}

/**
 * Marks the grant a new approval replaces as superseded. It runs after the
 * approval commits; until it does, the old grant's own guard already refuses
 * use, because it sees its successor.
 */
export const supersedePreviousGrant: EffectDefinition<AuthorizationRequestTypes> =
  defineEffect<AuthorizationRequestTypes>({
    name: 'authorizationRequests.supersedePreviousGrant',
    retry: { attempts: 3 },
    async run({ record, services }) {
      if (!record.supersedes) return { skipped: 'nothing to supersede' };
      try {
        await services.lifecycles.fire(
          'budgetGrants',
          record.supersedes,
          'supersede',
          {
            actor: SYSTEM_ACTOR,
            input: { successorId: grantIdOf(record) },
            requestId: `supersede:${grantIdOf(record)}`,
          },
        );
        return { superseded: record.supersedes };
      } catch (error) {
        // Expired, exhausted or revoked meanwhile: nothing left to replace.
        if (error instanceof LifecycleError && error.code === 'INVALID_STATE')
          return { skipped: error.message };
        throw error;
      }
    },
  });

/**
 * Scenario 28, the request. One request asks for one matter on one subject.
 * A second pending request for the same matter is refused; a different
 * matter on the same subject may be pending and granted alongside, unless
 * the two matters are declared conflicting. Approving writes the grant.
 */
export const authorizationRequestLifecycle: Lifecycle<AuthorizationRequestTypes> =
  defineLifecycle<AuthorizationRequestTypes>({
    name: 'authorizationRequests',
    collection: AUTHORIZATION_REQUESTS,
    initial: 'draft',
    states: [
      'draft',
      'pending',
      { name: 'approved', final: true },
      { name: 'rejected', final: true },
      { name: 'withdrawn', final: true },
    ],
    parameters: {
      approverRole: 'contractApprover',
      conflictingMatters: [],
    },
    transitions: {
      submit: {
        from: 'draft',
        to: 'pending',
        guard: guardSubmission,
        set: ({ record, parameters, services }) => {
          const problems = scopeProblems(record.requested);
          if (problems.length)
            throw new LifecycleError('INVALID_INPUT', problems.join(' '));
          return {
            approverId: services.org.holderOf(parameters.approverRole) ?? null,
          };
        },
      },
      approve: {
        from: 'pending',
        to: 'approved',
        guard: guardApproval,
        validate: (input) => {
          const limit = input.limitCents;
          return limit === undefined ||
            (typeof limit === 'number' &&
              Number.isSafeInteger(limit) &&
              limit > 0)
            ? null
            : [{ field: 'limitCents', message: 'Approve a positive limit.' }];
        },
        set: (context) => {
          const scope = approvedScope(context);
          const requested = context.record.requested.limitCents;
          if (
            requested !== null &&
            scope.limitCents !== null &&
            scope.limitCents > requested
          )
            throw new LifecycleError(
              'INVALID_INPUT',
              'An approval may lower the limit asked for, not raise it.',
            );
          return { grantId: grantIdOf(context.record), approved: { ...scope } };
        },
        // The grant commits with the approval, or neither does.
        onTransition: async ({ record, actor, services, now }) => {
          const request = record;
          const scope: GrantScope = request.approved ?? request.requested;
          await services.records.insert(SCENARIO_COLLECTIONS.budgetGrants, {
            id: grantIdOf(request),
            requestId: String(request.id),
            subjectId: request.subjectId,
            subjectRevision: request.subjectRevision,
            matter: request.matter,
            holderId: request.applicantId,
            approvedBy: actor.id,
            ...scope,
            usedCents: 0,
            uses: 0,
            usages: [],
            supersedes: request.supersedes ?? null,
            // The insert writes the lifecycle's fields itself: runtime.create()
            // cannot join this transaction.
            status: 'active',
            statusChangedAt: now.toISOString(),
            lifecycleVersion: 1,
          });
        },
        effects: [supersedePreviousGrant],
      },
      reject: {
        from: 'pending',
        to: 'rejected',
        guard: ({ record, actor }) =>
          actor.id === record.approverId || {
            code: 'approverOnly',
            message: 'Only the assigned approver decides.',
          },
        validate: (input) =>
          typeof input.reason === 'string' && input.reason.trim()
            ? null
            : [{ field: 'reason', message: 'Give a reason.' }],
        accept: ['reason'],
      },
      withdraw: {
        from: ['draft', 'pending'],
        to: 'withdrawn',
        guard: ({ record, actor }) =>
          actor.id === record.applicantId || {
            code: 'applicantOnly',
            message: 'Only the applicant can withdraw.',
          },
      },
    },
  });

interface Usage {
  readonly amountCents: number;
  readonly usageKey: string;
  readonly subjectId: string;
  readonly subjectRevision: number;
}

function usageOf(input: JsonObject): Usage | undefined {
  const { amountCents, usageKey, subjectId, subjectRevision } = input;
  if (
    typeof amountCents !== 'number' ||
    typeof usageKey !== 'string' ||
    typeof subjectId !== 'string' ||
    typeof subjectRevision !== 'number'
  )
    return undefined;
  return { amountCents, usageKey, subjectId, subjectRevision };
}

/**
 * Whether this use fits the grant now. Every bound is read from the grant
 * the transaction is deciding on, so two uses read at one version cannot
 * both pass: the second meets the version check and, read again, the bound.
 */
async function guardConsumption(context: GrantContext): Promise<GuardVerdict> {
  const { record, actor, input, services, now } = context;
  if (actor.id !== record.holderId)
    return {
      code: 'holderOnly',
      message: 'Only the holder can use this grant.',
    };
  if (!services.org.isActive(actor.id))
    return {
      code: 'inactive',
      message: 'An inactive person cannot use a grant.',
    };
  const at = now.toISOString();
  if (at < record.validFrom)
    return {
      code: 'notYetValid',
      message: `The grant holds from ${record.validFrom}.`,
    };
  if (at >= record.validUntil)
    return {
      code: 'expired',
      message: `The grant expired at ${record.validUntil}.`,
    };
  const successors = (await activeGrants(services, record.subjectId)).filter(
    (grant) => grant.supersedes === record.id,
  );
  if (successors.length)
    return {
      code: 'superseded',
      message: `Grant "${String(successors[0].id)}" replaces this one.`,
    };
  const usage = usageOf(input);
  // Without a use — as available() asks — whether any use could still fit.
  if (!usage) return true;
  if (usage.subjectId !== record.subjectId)
    return {
      code: 'otherSubject',
      message: 'The grant is for another subject.',
    };
  if (usage.subjectRevision !== record.subjectRevision)
    return {
      code: 'subjectChanged',
      message: `The subject changed since revision ${record.subjectRevision} was approved; ask again.`,
    };
  if (record.usages.some((used) => used.key === usage.usageKey))
    return {
      code: 'alreadyUsed',
      message: `"${usage.usageKey}" already used this grant.`,
    };
  if (record.maxUses !== null && record.uses >= record.maxUses)
    return { code: 'noUsesLeft', message: 'The grant has no uses left.' };
  if (
    record.limitCents !== null &&
    record.usedCents + usage.amountCents > record.limitCents
  )
    return {
      code: 'overLimit',
      message: `Only ${record.limitCents - record.usedCents} of ${record.limitCents} is left.`,
    };
  return true;
}

function systemOnly({ actor }: GrantContext): GuardVerdict {
  return actor.system === true || 'Only the system does this.';
}

/**
 * Scenario 28, the grant. It is used by `consume` until its amount or its
 * uses run out, its window closes, an authority revokes it, or a new
 * approval for the same matter supersedes it. Its window closes by the
 * grant's own date, which a trigger cannot express; {@link expireDueGrants}
 * sweeps for it, and `consume` refuses an expired grant even before the
 * sweep has come by.
 */
export const budgetGrantLifecycle: Lifecycle<BudgetGrantTypes> =
  defineLifecycle<BudgetGrantTypes>({
    name: 'budgetGrants',
    collection: SCENARIO_COLLECTIONS.budgetGrants,
    initial: 'active',
    states: [
      'active',
      { name: 'exhausted', final: true },
      { name: 'expired', final: true },
      { name: 'revoked', final: true },
      { name: 'superseded', final: true },
    ],
    parameters: { revokeRole: 'grantAuthority' },
    transitions: {
      consume: {
        from: 'active',
        to: ['active', 'exhausted'],
        guard: guardConsumption,
        validate: (input) => {
          const usage = usageOf(input);
          if (!usage)
            return 'Say how much, for which use, on which subject and revision.';
          return Number.isSafeInteger(usage.amountCents) &&
            usage.amountCents > 0
            ? null
            : [{ field: 'amountCents', message: 'Use a positive amount.' }];
        },
        route: ({ record, input }) => {
          const amount = Number(input.amountCents);
          const spent =
            record.limitCents !== null &&
            record.usedCents + amount >= record.limitCents;
          const used =
            record.maxUses !== null && record.uses + 1 >= record.maxUses;
          return spent || used ? 'exhausted' : 'active';
        },
        set: ({ record, input, actor, now }) => {
          const amount = Number(input.amountCents);
          const usage: GrantUsage = {
            key: textOf(input, 'usageKey'),
            amountCents: amount,
            by: actor.id,
            at: now.toISOString(),
          };
          return {
            usedCents: record.usedCents + amount,
            uses: record.uses + 1,
            usages: [...record.usages, usage],
          };
        },
      },
      expire: {
        from: 'active',
        to: 'expired',
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          return (
            context.now.toISOString() >= context.record.validUntil ||
            'The grant is still valid.'
          );
        },
      },
      revoke: {
        from: 'active',
        to: 'revoked',
        guard: ({ record, actor, parameters, services }) =>
          actor.id === record.approvedBy ||
          services.org.hasRole(actor.id, parameters.revokeRole) || {
            code: 'authorityOnly',
            message: 'Only the approver or a grant authority can revoke.',
          },
        validate: (input) =>
          typeof input.reason === 'string' && input.reason.trim()
            ? null
            : [{ field: 'reason', message: 'Give a reason.' }],
        set: ({ actor, input }) => ({
          revokedBy: actor.id,
          revokedReason: textOf(input, 'reason'),
        }),
      },
      supersede: {
        from: 'active',
        to: 'superseded',
        guard: async (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          const { record, input, services } = context;
          const successor = (
            await activeGrants(services, record.subjectId)
          ).find(
            (grant) =>
              grant.id === input.successorId && grant.supersedes === record.id,
          );
          return (
            successor !== undefined || 'No active grant replaces this one.'
          );
        },
        set: ({ input }) => ({ supersededBy: textOf(input, 'successorId') }),
      },
    },
  });

/** What one expiry sweep did. */
export interface ExpirySweep {
  readonly expired: readonly string[];
  /** Grants another sweep or a person moved first. */
  readonly skipped: readonly string[];
}

/**
 * Expires every active grant whose own `validUntil` has passed — recipe 8,
 * because a trigger's wait is read from parameters, not from the record. Run
 * it on a schedule. Each fire carries a request id, so a second sweep on
 * another instance replays rather than fails.
 */
export async function expireDueGrants(
  runtime: LifecycleFiring,
  services: ScenarioServices,
  now: Date,
): Promise<ExpirySweep> {
  const at = now.toISOString();
  const due = await services.records.list(
    SCENARIO_COLLECTIONS.budgetGrants,
    (row) => row.status === 'active' && String(row.validUntil) <= at,
  );
  const expired: string[] = [];
  const skipped: string[] = [];
  for (const grant of due) {
    try {
      await runtime.fire('budgetGrants', grant.id, 'expire', {
        actor: SYSTEM_ACTOR,
        requestId: `expire:${String(grant.id)}`,
      });
      expired.push(String(grant.id));
    } catch (error) {
      if (
        error instanceof LifecycleError &&
        (error.code === 'INVALID_STATE' ||
          error.code === 'GUARD_REJECTED' ||
          error.code === 'CONFLICT')
      ) {
        skipped.push(String(grant.id));
        continue;
      }
      throw error;
    }
  }
  return { expired, skipped };
}
