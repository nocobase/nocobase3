import {
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleRuntime,
  type LifecycleTransaction,
  type RecordId,
  type SetContext,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  ApprovalError,
  defineApproval,
  rowsOf,
  stagesFor,
  type Approval,
  type Row,
} from '@nocobase/app-plugin-approval/server';
import { directoryOf, text, type ScenarioServices } from './services.js';

// Scenario 28. An authorization request asks for one matter
// on one subject and waits in `approving` while the approval layer's run
// decides; the approval creates the grant — through the grant's lifecycle, in the same
// transaction — and supersedes the grant it replaces there too. The grant
// is a lifecycle of its own: active until it is exhausted, expires, is
// revoked or superseded. Using it is its second layer: a balance row that
// every use updates conditionally, and a usage row per use, so uses never
// move the grant until the last one exhausts it.

export interface GrantScope {
  readonly limitCents: number | null;
  readonly maxUses: number | null;
  readonly validFrom: string;
  readonly validUntil: string;
}

export type RequestState =
  'draft' | 'approving' | 'approved' | 'rejected' | 'withdrawn';

export interface GrantRequest extends LifecycleRecord {
  readonly subjectId: string;
  readonly subjectRevision: number;
  readonly matter: string;
  readonly applicantId: string;
  readonly requested: GrantScope;
  readonly supersedes: string | null;
  readonly approved: GrantScope | null;
  readonly grantId: string | null;
  readonly status: RequestState;
}

export interface RequestParameters {
  approverRole: string;
  conflictingMatters: readonly (readonly [string, string])[];
}

export interface RequestTypes {
  record: GrantRequest;
  state: RequestState;
  parameters: RequestParameters;
  services: ScenarioServices;
}

export type GrantState =
  'active' | 'exhausted' | 'expired' | 'revoked' | 'superseded';

export interface Grant extends LifecycleRecord, GrantScope {
  readonly requestId: string;
  readonly subjectId: string;
  readonly subjectRevision: number;
  readonly matter: string;
  readonly holderId: string;
  readonly approvedBy: string;
  readonly supersedes: string | null;
  readonly supersededBy: string | null;
  readonly revokedBy: string | null;
  readonly revokedReason: string | null;
  readonly status: GrantState;
}

export interface GrantTypes {
  record: Grant;
  state: GrantState;
  parameters: { revokeRole: string };
  services: ScenarioServices;
}

export const GRANT_REQUESTS = 'scenarioGrantRequests';
export const GRANTS = 'scenarioGrants';
export const GRANT_BALANCES = 'scenarioGrantBalances';
export const GRANT_USAGES = 'scenarioGrantUsages';

type RequestContext = TransitionContext<RequestTypes>;

async function activeGrants(
  services: ScenarioServices,
  subjectId: string,
): Promise<Grant[]> {
  return (await services.records.list(
    GRANTS,
    (row) => row.subjectId === subjectId && row.status === 'active',
  )) as Grant[];
}

function conflicting(
  matter: string,
  other: string,
  pairs: RequestParameters['conflictingMatters'],
): boolean {
  return pairs.some(
    ([a, b]) => (a === matter && b === other) || (a === other && b === matter),
  );
}

/** An active grant for the same matter it does not replace, or for a conflicting one. */
async function standingGrantBlocker(
  context: RequestContext,
): Promise<GuardVerdict> {
  const { record, parameters, services } = context;
  for (const grant of await activeGrants(services, record.subjectId)) {
    if (
      grant.matter === record.matter &&
      String(grant.id) !== record.supersedes
    )
      return {
        kind: 'precondition',
        code: 'activeGrant',
        message: `Grant "${String(grant.id)}" already covers ${record.matter}; ask to supersede it.`,
      };
    if (conflicting(record.matter, grant.matter, parameters.conflictingMatters))
      return {
        kind: 'precondition',
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

export const grantApproval: Approval<RequestTypes> = defineApproval<
  RequestTypes,
  'approval'
>({
  name: 'grantRequest',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['subjectId', 'subjectRevision', 'matter', 'requested', 'supersedes'],
  flow: ['approval'],
  stages: {
    approval: stagesFor<RequestTypes>().single({
      title: 'Approval',
      onEmpty: 'refuse',
      assignee: ({ services, parameters }) =>
        services.org.holderOf(parameters.approverRole),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

/** The approved scope: the request's, with a limit the approver lowered. */
function approvedScope({
  record,
  input,
}: SetContext<RequestTypes>): Record<string, unknown> {
  const limit = (input.data as JsonObject | undefined)?.limitCents;
  const requested = record.requested.limitCents;
  if (
    limit !== undefined &&
    (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0)
  )
    throw new LifecycleError('INVALID_INPUT', 'Approve a positive limit.');
  if (typeof limit === 'number' && requested !== null && limit > requested)
    throw new LifecycleError(
      'INVALID_STATE',
      'An approval may lower the limit asked for, not raise it.',
    );
  return {
    approved: {
      ...record.requested,
      limitCents: typeof limit === 'number' ? limit : requested,
    },
  };
}

export const grantRequestLifecycle: Lifecycle<RequestTypes> = defineLifecycle({
  name: GRANT_REQUESTS,
  initial: 'draft',
  states: [
    'draft',
    grantApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
    { name: 'withdrawn', final: true },
  ],
  parameters: { approverRole: 'contractApprover', conflictingMatters: [] },
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: async (context) => {
        const { record, actor, services } = context;
        if (actor.id !== record.applicantId)
          return {
            code: 'applicantOnly',
            message: 'Only the applicant can submit.',
          };
        const problems = scopeProblems(record.requested);
        if (problems.length)
          return {
            kind: 'precondition',
            code: 'invalidScope',
            message: problems.join(' '),
          };
        const duplicates = await services.records.list(
          GRANT_REQUESTS,
          (row) =>
            row.id !== record.id &&
            row.subjectId === record.subjectId &&
            row.matter === record.matter &&
            row.status === 'approving',
        );
        if (duplicates.length)
          return {
            kind: 'precondition',
            code: 'duplicateRequest',
            message: `Request "${String(duplicates[0].id)}" already asks for ${record.matter} on this subject.`,
          };
        if (
          record.supersedes &&
          !(await activeGrants(services, record.subjectId)).some(
            (grant) =>
              String(grant.id) === record.supersedes &&
              grant.matter === record.matter,
          )
        )
          return {
            kind: 'precondition',
            code: 'nothingToSupersede',
            message: `No active ${record.matter} grant "${record.supersedes}" to supersede.`,
          };
        return standingGrantBlocker(context);
      },
    },
    // A grant may have appeared since the submission: asked again when
    // the approval ends approved, and a refusal rolls the answer back.
    approve: {
      from: 'approving',
      to: 'approved',
      manual: false,
      guard: standingGrantBlocker,
      set: approvedScope,
    },
    reject: { from: 'approving', to: 'rejected', manual: false },
    withdraw: {
      from: ['draft', 'approving'],
      to: 'withdrawn',
      guard: ({ record, actor }) =>
        actor.id === record.applicantId || {
          code: 'applicantOnly',
          message: 'Only the applicant can withdraw.',
        },
    },
  },
  onEnterState: {
    // The grant is created with the approval, through its own lifecycle,
    // and the grant it replaces is superseded in the same transaction.
    approved: async ({ record, actor, tx }) => {
      const scope = record.approved ?? record.requested;
      const { record: grant } = await tx.create(
        GRANTS,
        {
          requestId: String(record.id),
          subjectId: record.subjectId,
          subjectRevision: record.subjectRevision,
          matter: record.matter,
          holderId: record.applicantId,
          approvedBy: actor.id,
          ...scope,
          supersedes: record.supersedes,
          supersededBy: null,
          revokedBy: null,
          revokedReason: null,
        },
        { actor, input: { requestId: String(record.id) } },
      );
      if (record.supersedes)
        await tx.fire(GRANTS, record.supersedes, 'supersede', {
          actor: SYSTEM_ACTOR,
          input: { successorId: String(grant.id) },
        });
    },
  },
});

export const grantLifecycle: Lifecycle<GrantTypes> =
  defineLifecycle<GrantTypes>({
    name: GRANTS,
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
      // Fired by the usage layer alone, with the use that spent the last of it.
      exhaust: { from: 'active', to: 'exhausted', manual: false },
      expire: {
        from: 'active',
        to: 'expired',
        manual: false,
        guard: ({ now, record }) =>
          now.toISOString() >= record.validUntil || 'The grant is still valid.',
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
          text(input.reason)
            ? null
            : [{ field: 'reason', message: 'Give a reason.' }],
        set: ({ actor, input }) => ({
          revokedBy: actor.id,
          revokedReason: text(input.reason),
        }),
      },
      supersede: {
        from: 'active',
        to: 'superseded',
        manual: false,
        set: ({ input }) => ({ supersededBy: text(input.successorId) }),
      },
    },
    onEnterState: {
      active: async ({ record, tx }) => {
        await rowsOf(tx.handle).insert(GRANT_BALANCES, {
          grantId: String(record.id),
          usedCents: 0,
          uses: 0,
          rowVersion: 0,
        });
      },
    },
  });

export interface Balance {
  readonly id: string;
  readonly grantId: string;
  readonly usedCents: number;
  readonly uses: number;
  readonly rowVersion: number;
}

function toBalance(row: Row): Balance {
  return {
    id: String(row.id),
    grantId: String(row.grantId),
    usedCents: Number(row.usedCents),
    uses: Number(row.uses),
    rowVersion: Number(row.rowVersion),
  };
}

async function balanceOf(
  tx: LifecycleTransaction,
  grantId: string,
): Promise<Balance> {
  const [row] = await rowsOf(tx.handle).find(GRANT_BALANCES, { grantId });
  if (!row)
    throw new ApprovalError(
      'TASK_NOT_FOUND',
      `No balance for grant "${grantId}".`,
    );
  return toBalance(row);
}

export interface Use {
  readonly grantId: RecordId;
  readonly actor: LifecycleActor;
  readonly amountCents: number;
  readonly usageKey: string;
  readonly subjectId: string;
  readonly subjectRevision: number;
  /** The same request sent again is answered from its first use. */
  readonly requestId?: string;
  /** The balance version the page read; a use decided on an older one is refused. */
  readonly expectBalance?: number;
}

export type UseResult = {
  readonly outcome: 'used' | 'replayed';
  readonly balance: Balance;
  readonly state: GrantState;
};

/**
 * One use of a grant, in one transaction: checked against the grant and its
 * balance, written as a usage row and a conditional update of the balance —
 * the serialization point of two uses — and, when it spends the last of the
 * grant, exhausting it in the same transaction.
 */
export function consumeGrant(
  runtime: LifecycleRuntime,
  use: Use,
): Promise<UseResult> {
  return runtime.transaction(async (tx) => {
    const grant = (await tx.read(GRANTS, use.grantId)) as Grant | undefined;
    if (!grant) throw new ApprovalError('TASK_NOT_FOUND', 'No such grant.');
    const rows = rowsOf(tx.handle);
    const usages = await rows.find(GRANT_USAGES, { grantId: String(grant.id) });
    if (
      use.requestId !== undefined &&
      usages.some((row) => row.requestId === use.requestId)
    )
      return {
        outcome: 'replayed',
        balance: await balanceOf(tx, String(grant.id)),
        state: grant.status,
      };
    const refuse = (code: string, message: string): never => {
      throw Object.assign(new ApprovalError('NOT_ALLOWED', message), {
        reason: code,
      });
    };
    if (grant.status !== 'active')
      refuse('notActive', `The grant is ${grant.status}.`);
    if (use.actor.id !== grant.holderId)
      refuse('holderOnly', 'Only the holder can use this grant.');
    const at = tx.now.toISOString();
    if (at < grant.validFrom)
      refuse('notYetValid', `The grant holds from ${grant.validFrom}.`);
    if (at >= grant.validUntil)
      refuse('expired', `The grant expired at ${grant.validUntil}.`);
    if (use.subjectId !== grant.subjectId)
      refuse('otherSubject', 'The grant is for another subject.');
    if (use.subjectRevision !== grant.subjectRevision)
      refuse(
        'subjectChanged',
        `The subject changed since revision ${grant.subjectRevision} was approved; ask again.`,
      );
    if (usages.some((row) => row.usageKey === use.usageKey))
      refuse('alreadyUsed', `"${use.usageKey}" already used this grant.`);
    if (!(Number.isSafeInteger(use.amountCents) && use.amountCents > 0))
      refuse('invalidAmount', 'Use a positive amount.');
    const balance = await balanceOf(tx, String(grant.id));
    if (
      use.expectBalance !== undefined &&
      use.expectBalance !== balance.rowVersion
    )
      throw new ApprovalError(
        'CONFLICT',
        'The grant was used meanwhile; read it again.',
      );
    if (grant.maxUses !== null && balance.uses >= grant.maxUses)
      refuse('noUsesLeft', 'The grant has no uses left.');
    if (
      grant.limitCents !== null &&
      balance.usedCents + use.amountCents > grant.limitCents
    )
      refuse(
        'overLimit',
        `Only ${grant.limitCents - balance.usedCents} of ${grant.limitCents} is left.`,
      );
    const next = {
      usedCents: balance.usedCents + use.amountCents,
      uses: balance.uses + 1,
    };
    const written = await rows.update(
      GRANT_BALANCES,
      balance.id,
      { rowVersion: balance.rowVersion },
      { ...next, rowVersion: balance.rowVersion + 1 },
    );
    if (!written)
      throw new ApprovalError(
        'CONFLICT',
        'The grant was used meanwhile; read it again.',
      );
    await rows.insert(GRANT_USAGES, {
      grantId: String(grant.id),
      usageKey: use.usageKey,
      amountCents: use.amountCents,
      by: use.actor.id,
      at,
      requestId: use.requestId ?? null,
    });
    const spent =
      grant.limitCents !== null && next.usedCents >= grant.limitCents;
    const used = grant.maxUses !== null && next.uses >= grant.maxUses;
    if (spent || used)
      await tx.fire(GRANTS, grant.id, 'exhaust', {
        actor: use.actor,
        input: { usageKey: use.usageKey },
      });
    const now = (await tx.read(GRANTS, grant.id)) as Grant;
    return {
      outcome: 'used',
      balance: { ...balance, ...next, rowVersion: balance.rowVersion + 1 },
      state: now.status,
    };
  });
}

export function balance(
  runtime: LifecycleRuntime,
  grantId: RecordId,
): Promise<Balance> {
  return runtime.transaction((tx) => balanceOf(tx, String(grantId)));
}

/** Expires every active grant whose own `validUntil` has passed. */
export async function expireDueGrants(
  runtime: LifecycleRuntime,
  grants: readonly Grant[],
  now: Date,
): Promise<string[]> {
  const expired: string[] = [];
  for (const grant of grants.filter(
    (each) => each.status === 'active' && each.validUntil <= now.toISOString(),
  ))
    try {
      await runtime.fire(GRANTS, grant.id, 'expire', {
        actor: SYSTEM_ACTOR,
        requestId: `expire:${String(grant.id)}`,
      });
      expired.push(String(grant.id));
    } catch (error) {
      if (!(error instanceof LifecycleError)) throw error;
    }
  return expired;
}
