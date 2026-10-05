import {
  defineEffect,
  defineLifecycle,
  type EffectDefinition,
  type GuardVerdict,
  type InputProblem,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';

// Scenario 1: the smallest bespoke approval. 张三 asks for leave, his direct
// manager decides once, and an approved request is then registered with HR,
// which is a separate fact from the approval.

export type LeaveState =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'registrationFailed'
  | 'registered'
  | 'rejected';

export interface LeaveRequest extends LifecycleRecord {
  readonly applicantId: string;
  readonly days: number;
  readonly reason: string;
  /** Resolved from the organization at submission and kept: the responsibility does not move silently. */
  readonly approverId: string | null;
  readonly decidedBy: string | null;
  readonly decisionComment: string | null;
  readonly registrationRef: string | null;
  readonly status: LeaveState;
}

export interface LeaveTypes {
  record: LeaveRequest;
  state: LeaveState;
  services: ScenarioServices;
}

type Context = TransitionContext<LeaveTypes>;

/** The role allowed to retry a failed HR registration. */
export const HR_ROLE: string = 'hr';

function isActiveApplicant({ record, actor, services }: Context): GuardVerdict {
  if (actor.id !== record.applicantId)
    return {
      code: 'applicantOnly',
      message: 'Only the applicant can submit this request.',
    };
  return (
    services.org.isActive(actor.id) || 'The applicant is no longer active.'
  );
}

function isActiveApprover({ record, actor, services }: Context): GuardVerdict {
  if (actor.id !== record.approverId)
    return {
      code: 'approverOnly',
      message: 'Only the assigned approver can decide.',
    };
  return (
    services.org.isActive(actor.id) || {
      code: 'approverInactive',
      message: 'The assigned approver is no longer active.',
    }
  );
}

const systemOnly = ({ actor }: Context): GuardVerdict =>
  actor.system === true || {
    code: 'systemOnly',
    message: 'Only the system does this.',
  };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function reasonRequired(input: JsonObject): InputProblem[] {
  return text(input.comment)
    ? []
    : [{ field: 'comment', message: 'Give a reason for rejecting.' }];
}

/** Tells the applicant the decision; keyed per run so a retried run sends it once. */
const notifyApplicant: EffectDefinition<LeaveTypes> = defineEffect<LeaveTypes>({
  name: 'leaveRequests.notifyApplicant',
  retry: { attempts: 3 },
  async run({ record, to, idempotencyKey, services }) {
    await services.outbox.send(
      record.applicantId,
      `Leave request ${String(record.id)}: ${to}`,
      idempotencyKey,
    );
  },
});

const notifyApprover: EffectDefinition<LeaveTypes> = defineEffect<LeaveTypes>({
  name: 'leaveRequests.notifyApprover',
  retry: { attempts: 3 },
  async run({ record, idempotencyKey, services }) {
    if (record.approverId)
      await services.outbox.send(
        record.approverId,
        `Leave request ${String(record.id)} awaits you`,
        idempotencyKey,
      );
  },
});

/**
 * Registers the approved leave with HR. The key is per request rather than
 * per run: `retryRegistration` re-enters `approved` and creates a new run.
 */
const registerLeave: EffectDefinition<LeaveTypes> = defineEffect<LeaveTypes>({
  name: 'leaveRequests.registerLeave',
  retry: { attempts: 2 },
  onSuccess: 'registrationSucceeded',
  onFailure: 'registrationFailed',
  async run({ record, services }) {
    const key = `leave-registration:${String(record.id)}`;
    await services.external.runOnboardingStep(key, 'registerLeave');
    return { registrationRef: key };
  },
});

export const leaveLifecycle: Lifecycle<LeaveTypes> =
  defineLifecycle<LeaveTypes>({
    name: 'leaveRequests',
    collection: SCENARIO_COLLECTIONS.leaveRequests,
    initial: 'draft',
    states: [
      'draft',
      'pending',
      'approved',
      'registrationFailed',
      { name: 'registered', final: true },
      // A rejection is kept as it is; asking again is a new request.
      { name: 'rejected', final: true },
    ],
    transitions: {
      submit: {
        from: 'draft',
        to: 'pending',
        guard: (context) => {
          const verdict = isActiveApplicant(context);
          if (verdict !== true) return verdict;
          const manager = context.services.org.managerOf(
            context.record.applicantId,
          );
          // No approver never means approved.
          if (!manager || !context.services.org.isActive(manager))
            return {
              code: 'noApprover',
              message: 'The applicant has no active manager to approve.',
            };
          return (
            manager !== context.record.applicantId ||
            'Nobody approves their own leave.'
          );
        },
        set: ({ record, services }) => ({
          approverId: services.org.managerOf(record.applicantId) ?? null,
        }),
      },
      approve: {
        from: 'pending',
        to: 'approved',
        guard: isActiveApprover,
        set: ({ actor, input }) => ({
          decidedBy: actor.id,
          decisionComment: text(input.comment),
        }),
        effects: [notifyApplicant],
      },
      reject: {
        from: 'pending',
        to: 'rejected',
        guard: isActiveApprover,
        validate: reasonRequired,
        set: ({ actor, input }) => ({
          decidedBy: actor.id,
          decisionComment: text(input.comment),
        }),
        effects: [notifyApplicant],
      },
      registrationSucceeded: {
        from: 'approved',
        to: 'registered',
        guard: systemOnly,
        accept: ['registrationRef'],
      },
      registrationFailed: {
        from: 'approved',
        to: 'registrationFailed',
        guard: systemOnly,
      },
      retryRegistration: {
        from: 'registrationFailed',
        to: 'approved',
        guard: ({ actor, services }) =>
          services.org.hasRole(actor.id, HR_ROLE) || {
            code: 'hrOnly',
            message: 'Only HR retries a registration.',
          },
      },
    },
    // On onEnter rather than on approve, so retryRegistration runs it again.
    // The decision notice is on the transitions instead: re-entering approved
    // must not tell the applicant a second time.
    onEnter: {
      pending: [notifyApprover],
      approved: [registerLeave],
    },
  });
