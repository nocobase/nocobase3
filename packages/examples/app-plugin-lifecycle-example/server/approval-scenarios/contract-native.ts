import {
  defineEffect,
  defineLifecycle,
  type EffectDefinition,
  type GuardVerdict,
  type InputProblem,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type SetContext,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';

// A contract approval written as one plain lifecycle, without the generic
// staged approval in `approval/`: every stage is a state of its own, and the
// operations of a stage are transitions on that state. It puts the hard
// parts of an approval into one definition to see how far states carry them.
//
//   manager (single; transfer; add a signer before or after)
//   → legal + finance countersign (all must approve; add one more alongside)
//   → procurement pool (the first answer decides, or someone claims it first)
//   → CEO (only above a threshold; transfer; add a signer before or after)
//
// Any reviewer may return the request to the applicant or to an earlier
// stage, and may ask that once it is decided again it comes straight back to
// them rather than walking every stage in between.

export type ContractState =
  | 'draft'
  | 'managerReview'
  | 'managerPreSign'
  | 'managerPostSign'
  | 'countersign'
  | 'procurementPool'
  | 'procurementClaimed'
  | 'ceoReview'
  | 'ceoPreSign'
  | 'ceoPostSign'
  | 'approved'
  | 'rejected';

/** The stages in order: what "earlier" means for a return. */
export type ContractStage = 'manager' | 'countersign' | 'procurement' | 'ceo';

export type ContractDecision = 'approve' | 'reject';

/** One decision, kept for the history across returns and rounds. */
export interface ContractVote {
  readonly state: ContractState;
  readonly userId: string;
  readonly decision: ContractDecision;
  readonly comment: string;
  readonly round: number;
  readonly at: string;
}

/** A signer an approver invited, before or after their own decision. */
export interface AddedSigner {
  readonly userId: string;
  readonly mode: 'before' | 'after';
  readonly by: string;
}

export interface ContractApproval extends LifecycleRecord {
  readonly applicantId: string;
  readonly title: string;
  readonly amount: number;
  /** Incremented by every submission. */
  readonly round: number;
  /** Incremented whenever a state is entered, not by a self-transition. */
  readonly stageEntry: number;
  /** The responsible person of the manager or CEO stage. */
  readonly approverId: string | null;
  /** One signer at a time: a second one would need a list, which is a plan. */
  readonly addedSigner: AddedSigner | null;
  readonly countersigners: readonly string[];
  /** The decisions of the countersign stage since it was last entered. */
  readonly countersignVotes: readonly ContractVote[];
  readonly pool: readonly string[];
  readonly claimedBy: string | null;
  /** Where a decided request goes next instead of the following stage. */
  readonly resumeAt: ContractStage | null;
  readonly votes: readonly ContractVote[];
  readonly status: ContractState;
  readonly statusChangedAt: string;
}

export interface ContractTypes {
  record: ContractApproval;
  state: ContractState;
  parameters: {
    ceoThreshold: number;
    escalateAfterHours: number;
    claimTimeoutHours: number;
  };
  services: ScenarioServices;
}

type Context = TransitionContext<ContractTypes>;
type Entering = SetContext<ContractTypes>;

const STAGES: readonly ContractStage[] = [
  'manager',
  'countersign',
  'procurement',
  'ceo',
];

/** The state a stage is entered in. */
const ENTRY: Readonly<Record<ContractStage, ContractState>> = {
  manager: 'managerReview',
  countersign: 'countersign',
  procurement: 'procurementPool',
  ceo: 'ceoReview',
};

const REVIEWING: readonly ContractState[] = [
  'managerReview',
  'managerPreSign',
  'managerPostSign',
  'countersign',
  'procurementPool',
  'procurementClaimed',
  'ceoReview',
  'ceoPreSign',
  'ceoPostSign',
];

const SINGLE: readonly ContractState[] = [
  'managerReview',
  'managerPreSign',
  'managerPostSign',
  'ceoReview',
  'ceoPreSign',
  'ceoPostSign',
];

/** The stage a state belongs to. */
export function stageOf(state: ContractState): ContractStage | null {
  if (state.startsWith('manager')) return 'manager';
  if (state === 'countersign') return 'countersign';
  if (state.startsWith('procurement')) return 'procurement';
  if (state.startsWith('ceo')) return 'ceo';
  return null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The people a state is waiting for. */
export function responsibleFor(record: ContractApproval): string[] {
  switch (record.status) {
    case 'managerReview':
    case 'ceoReview':
      return record.approverId ? [record.approverId] : [];
    case 'managerPreSign':
    case 'managerPostSign':
    case 'ceoPreSign':
    case 'ceoPostSign':
      return record.addedSigner ? [record.addedSigner.userId] : [];
    case 'countersign': {
      const voted = new Set(record.countersignVotes.map((vote) => vote.userId));
      return record.countersigners.filter((person) => !voted.has(person));
    }
    case 'procurementPool':
      return [...record.pool];
    case 'procurementClaimed':
      return record.claimedBy ? [record.claimedBy] : [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- guards

function isApplicant({ record, actor }: Context): GuardVerdict {
  return (
    actor.id === record.applicantId || {
      code: 'applicantOnly',
      message: 'Only the applicant can do this.',
    }
  );
}

function isActive({ actor, services }: Context): GuardVerdict {
  return (
    actor.system === true ||
    services.org.isActive(actor.id) || {
      code: 'inactive',
      message: `${actor.id} can no longer act.`,
    }
  );
}

/** Whether the actor is one of the people the current state waits for. */
function isResponsible(context: Context): GuardVerdict {
  const active = isActive(context);
  if (active !== true) return active;
  return (
    responsibleFor(context.record).includes(context.actor.id) || {
      code: 'notResponsible',
      message: 'This stage is not waiting for you.',
    }
  );
}

/** The owner of a single stage, not a signer they invited. */
function isStageOwner(context: Context): GuardVerdict {
  const active = isActive(context);
  if (active !== true) return active;
  return (
    context.record.approverId === context.actor.id || {
      code: 'notOwner',
      message: 'Only the approver of this stage can do this.',
    }
  );
}

const systemOnly = ({ actor }: Context): GuardVerdict =>
  actor.system === true || {
    code: 'systemOnly',
    message: 'Only the system does this.',
  };

function both(...verdicts: readonly GuardVerdict[]): GuardVerdict {
  return verdicts.find((verdict) => verdict !== true) ?? true;
}

/** Someone the request may be handed to: active, and not the applicant. */
function eligible(context: Context, person: string): GuardVerdict {
  if (!person) return true; // `available()` asks with no input.
  if (person === context.record.applicantId)
    return {
      code: 'applicantNotEligible',
      message: 'The applicant cannot review their own request.',
    };
  if (responsibleFor(context.record).includes(person))
    return {
      code: 'alreadyResponsible',
      message: `${person} is already reviewing this stage.`,
    };
  return (
    context.services.org.isActive(person) || {
      code: 'inactive',
      message: `${person} can no longer act.`,
    }
  );
}

// ----------------------------------------------------------- validation

function decision(input: JsonObject): InputProblem[] {
  const value = text(input.decision);
  if (value !== 'approve' && value !== 'reject')
    return [{ field: 'decision', message: 'Approve or reject.' }];
  if (value === 'reject' && !text(input.comment))
    return [{ field: 'comment', message: 'Give a reason for rejecting.' }];
  return [];
}

function required(...fields: string[]): (input: JsonObject) => InputProblem[] {
  return (input) =>
    fields
      .filter((field) => !text(input[field]))
      .map((field) => ({ field, message: `"${field}" is required.` }));
}

// --------------------------------------------------------- the path

/** Where the path goes after `stage` is approved, before any resume. */
function naturalNext(
  stage: ContractStage,
  record: ContractApproval,
  threshold: number,
): ContractState {
  switch (stage) {
    case 'manager':
      return 'countersign';
    case 'countersign':
      return 'procurementPool';
    case 'procurement':
      return record.amount > threshold ? 'ceoReview' : 'approved';
    case 'ceo':
      return 'approved';
  }
}

/**
 * Where an approved stage leads: back to whoever returned the request when
 * they asked for that, otherwise to the next stage. Every forward route
 * goes through here, which is how a return's memory reaches them.
 */
function forward(context: Context, stage: ContractStage): ContractState {
  const { record, parameters } = context;
  if (
    record.resumeAt !== null &&
    STAGES.indexOf(record.resumeAt) > STAGES.indexOf(stage)
  )
    return ENTRY[record.resumeAt];
  return naturalNext(stage, record, parameters.ceoThreshold);
}

function vote(
  context: Context,
  state: ContractState,
  decision: ContractDecision = text(context.input.decision) as ContractDecision,
): ContractVote {
  return {
    state,
    userId: context.actor.id,
    decision,
    comment: text(context.input.comment),
    round: context.record.round,
    at: context.now.toISOString(),
  };
}

/**
 * What leaving a stage clears. The library has no exit hook either, and a
 * field a stage left behind is read by the next one: a request returned out
 * of a claim kept its `claimedBy` until this existed.
 */
const EXIT: Readonly<Record<ContractStage, Record<string, unknown>>> = {
  manager: { approverId: null, addedSigner: null },
  countersign: { countersignVotes: [] },
  procurement: { claimedBy: null },
  ceo: { approverId: null, addedSigner: null },
};

/**
 * What moving from `from` to `to` writes. The library runs `onEnter`
 * effects after commit but has no hook that writes fields on entry or exit,
 * so every `set` that changes the state merges this in. A self-transition
 * writes none of it.
 */
function entering(context: Entering): Record<string, unknown> {
  const { record, services, from, to } = context;
  if (from === to) return {};
  const leaving = stageOf(from);
  const stage = stageOf(to);
  const values: Record<string, unknown> = {
    ...(leaving !== null && leaving !== stage ? EXIT[leaving] : {}),
    stageEntry: record.stageEntry + 1,
  };
  if (stage !== null && record.resumeAt === stage) values.resumeAt = null;
  // Back from an invited signer, a stage keeps its approver, who may have
  // been transferred; entered afresh, it chooses again.
  if (to === 'managerReview' && leaving !== 'manager')
    values.approverId = services.org.managerOf(record.applicantId) ?? null;
  if (to === 'ceoReview' && leaving !== 'ceo')
    values.approverId = services.org.holderOf('ceo') ?? null;
  if (from === 'managerPreSign' || from === 'ceoPreSign')
    values.addedSigner = null;
  if (to === 'countersign') {
    values.countersigners = [
      ...new Set([
        ...services.org.holders('legal'),
        ...services.org.holders('finance'),
      ]),
    ].filter(
      (person) =>
        services.org.isActive(person) && person !== record.applicantId,
    );
    values.countersignVotes = [];
  }
  // Released back to the pool, the pool stays as it was.
  if (to === 'procurementPool' && from !== 'procurementClaimed')
    values.pool = services.org
      .holders('procurement')
      .filter(
        (person) =>
          services.org.isActive(person) && person !== record.applicantId,
      );
  if (to === 'procurementPool') values.claimedBy = null;
  if (to === 'procurementClaimed') values.claimedBy = context.actor.id;
  return values;
}

/** A `set` that also writes the entry values of the state it moves into. */
function moving(
  set: (context: Entering) => Record<string, unknown> = () => ({}),
): (context: Entering) => Record<string, unknown> {
  return (context) => ({ ...set(context), ...entering(context) });
}

// --------------------------------------------------------------- effects

/**
 * Tells the people a state waits for. It runs on every transition into a
 * reviewing state, a self-transition too, because the library re-runs
 * `onEnter` then; the key carries the state entry and the person, so a vote
 * on a countersign does not tell everyone again, while a transferred stage
 * reaches its new approver.
 */
const notifyResponsible: EffectDefinition<ContractTypes> =
  defineEffect<ContractTypes>({
    name: 'contractApprovals.notifyResponsible',
    retry: { attempts: 3 },
    async run({ record, services }) {
      for (const person of responsibleFor(record))
        await services.outbox.send(
          person,
          `Contract ${String(record.id)} awaits you (${record.status})`,
          `contract:${String(record.id)}:${record.stageEntry}:${person}`,
        );
    },
  });

const notifyApplicant: EffectDefinition<ContractTypes> =
  defineEffect<ContractTypes>({
    name: 'contractApprovals.notifyApplicant',
    retry: { attempts: 3 },
    async run({ record, to, services }) {
      // Returned to a draft, not created as one.
      if (to === 'draft' && record.round === 0) return;
      await services.outbox.send(
        record.applicantId,
        `Contract ${String(record.id)}: ${record.status}`,
        `contract:${String(record.id)}:${record.stageEntry}:applicant`,
      );
    },
  });

// ------------------------------------------------------------ lifecycle

/** Where a single-person state goes on approval. */
function afterSingleApproval(context: Context): ContractState {
  const { record } = context;
  switch (record.status) {
    case 'managerPreSign':
      return 'managerReview';
    case 'ceoPreSign':
      return 'ceoReview';
    case 'managerReview':
      return record.addedSigner?.mode === 'after'
        ? 'managerPostSign'
        : forward(context, 'manager');
    case 'ceoReview':
      return record.addedSigner?.mode === 'after'
        ? 'ceoPostSign'
        : forward(context, 'ceo');
    case 'managerPostSign':
      return forward(context, 'manager');
    case 'ceoPostSign':
      return forward(context, 'ceo');
    default:
      return record.status;
  }
}

/** The returner's target, if it is the applicant or a stage before theirs. */
function returnTarget(context: Context): ContractStage | 'applicant' | null {
  const target = text(context.input.target);
  if (target === 'applicant') return 'applicant';
  const current = stageOf(context.record.status);
  if (
    current === null ||
    !STAGES.includes(target as ContractStage) ||
    STAGES.indexOf(target as ContractStage) >= STAGES.indexOf(current)
  )
    return null;
  return target as ContractStage;
}

export const contractNativeLifecycle: Lifecycle<ContractTypes> =
  defineLifecycle<ContractTypes>({
    name: 'contractApprovals',
    collection: SCENARIO_COLLECTIONS.contractApprovals,
    initial: 'draft',
    states: [
      'draft',
      'managerReview',
      'managerPreSign',
      'managerPostSign',
      'countersign',
      'procurementPool',
      'procurementClaimed',
      'ceoReview',
      'ceoPreSign',
      'ceoPostSign',
      { name: 'approved', final: true },
      { name: 'rejected', final: true },
    ],
    parameters: {
      ceoThreshold: 100_000,
      escalateAfterHours: 48,
      claimTimeoutHours: 24,
    },
    transitions: {
      submit: {
        from: 'draft',
        to: ['managerReview', 'countersign', 'procurementPool', 'ceoReview'],
        guard: (context) =>
          both(
            isApplicant(context),
            isActive(context),
            // The stage the request resumes at has its people; the manager
            // stage, where a fresh request starts, has to have one too.
            context.record.resumeAt !== null ||
              context.services.org.managerOf(context.record.applicantId) !==
                undefined || {
                code: 'noApprover',
                message: 'The applicant has no manager to approve.',
              },
          ),
        // Returned with "come back to me", the request skips what was decided.
        route: ({ record }) => ENTRY[record.resumeAt ?? 'manager'],
        set: moving(({ record }) => ({ round: record.round + 1 })),
      },

      // The manager, the CEO and the signers they invite: one person decides.
      approve: {
        from: [...SINGLE],
        to: [
          'managerReview',
          'managerPostSign',
          'countersign',
          'procurementPool',
          'ceoReview',
          'ceoPostSign',
          'approved',
        ],
        guard: isResponsible,
        route: afterSingleApproval,
        set: moving((context) => ({
          votes: [
            ...context.record.votes,
            vote(context, context.from, 'approve'),
          ],
        })),
      },
      reject: {
        from: [...SINGLE],
        to: 'rejected',
        guard: isResponsible,
        validate: required('comment'),
        set: moving((context) => ({
          votes: [
            ...context.record.votes,
            vote(context, context.from, 'reject'),
          ],
        })),
      },

      // Legal and finance: every one approves, and the first rejection rejects.
      countersign: {
        from: 'countersign',
        to: ['countersign', 'procurementPool', 'ceoReview', 'rejected'],
        guard: isResponsible,
        validate: decision,
        route: (context) => {
          const { record, actor, input } = context;
          if (text(input.decision) === 'reject') return 'rejected';
          const voted = new Set([
            ...record.countersignVotes.map((entry) => entry.userId),
            actor.id,
          ]);
          return record.countersigners.every((person) => voted.has(person))
            ? forward(context, 'countersign')
            : 'countersign';
        },
        set: (context) => {
          const cast = vote(context, 'countersign');
          return {
            votes: [...context.record.votes, cast],
            // Leaving the stage clears them; staying, this vote is counted.
            countersignVotes: [...context.record.countersignVotes, cast],
            ...entering(context),
          };
        },
      },
      addCountersigner: {
        title: 'Add a countersigner',
        from: 'countersign',
        to: 'countersign',
        guard: (context) =>
          both(
            isResponsible(context),
            eligible(context, text(context.input.userId)),
          ),
        validate: required('userId'),
        set: ({ record, input }) => ({
          countersigners: [...record.countersigners, text(input.userId)],
        }),
      },

      // Procurement: anyone in the pool may answer, and the first answer
      // decides; or one of them claims it, and then only they answer.
      claim: {
        from: 'procurementPool',
        to: 'procurementClaimed',
        guard: isResponsible,
        set: moving(),
      },
      release: {
        from: 'procurementClaimed',
        to: 'procurementPool',
        guard: (context) =>
          context.actor.system === true || isResponsible(context),
        set: moving(),
      },
      procure: {
        title: 'Decide (procurement)',
        from: ['procurementPool', 'procurementClaimed'],
        to: ['ceoReview', 'approved', 'rejected'],
        guard: isResponsible,
        validate: decision,
        route: (context) =>
          text(context.input.decision) === 'reject'
            ? 'rejected'
            : forward(context, 'procurement'),
        set: moving((context) => ({
          votes: [...context.record.votes, vote(context, context.from)],
        })),
      },

      // Responsibility moves; the state does not.
      transfer: {
        from: ['managerReview', 'ceoReview'],
        to: ['managerReview', 'ceoReview'],
        guard: (context) =>
          both(
            isStageOwner(context),
            eligible(context, text(context.input.userId)),
          ),
        validate: required('userId', 'reason'),
        route: ({ record }) => record.status,
        set: ({ input }) => ({ approverId: text(input.userId) }),
      },
      escalate: {
        from: ['managerReview', 'ceoReview'],
        to: ['managerReview', 'ceoReview'],
        guard: (context) =>
          both(
            systemOnly(context),
            (context.record.approverId !== null &&
              context.services.org.managerOf(context.record.approverId) !==
                undefined) ||
              'Nobody above the approver to escalate to.',
          ),
        route: ({ record }) => record.status,
        set: ({ record, services }) => ({
          approverId: services.org.managerOf(record.approverId ?? '') ?? null,
        }),
      },

      // Add a signer before (they decide first, then the stage comes back)
      // or after (they decide once the owner has approved). An invited
      // signer has no addSigner of their own: the states leave it out.
      addSigner: {
        title: 'Add a signer',
        from: ['managerReview', 'ceoReview'],
        to: ['managerReview', 'managerPreSign', 'ceoReview', 'ceoPreSign'],
        guard: (context) =>
          both(
            isStageOwner(context),
            eligible(context, text(context.input.userId)),
            context.record.addedSigner === null || {
              code: 'signerAlreadyAdded',
              message: 'This stage already has an added signer.',
            },
          ),
        validate: (input) => [
          ...required('userId')(input),
          ...(['before', 'after'].includes(text(input.mode))
            ? []
            : [{ field: 'mode', message: 'Add a signer before or after.' }]),
        ],
        route: ({ record, input }) =>
          text(input.mode) === 'before'
            ? record.status === 'managerReview'
              ? 'managerPreSign'
              : 'ceoPreSign'
            : record.status,
        set: moving(({ input, actor }) => ({
          addedSigner: {
            userId: text(input.userId),
            mode: text(input.mode) as 'before' | 'after',
            by: actor.id,
          },
        })),
      },

      // Back to the applicant, or to any stage before the current one.
      returnTo: {
        title: 'Return',
        from: [...REVIEWING],
        to: ['draft', 'managerReview', 'countersign', 'procurementPool'],
        guard: (context) =>
          both(
            isResponsible(context),
            // `available()` asks with no input: the button is there, the
            // target is checked when it is pressed.
            !text(context.input.target) ||
              returnTarget(context) !== null || {
                code: 'badTarget',
                message: 'Return to the applicant or to an earlier stage.',
              },
          ),
        validate: required('target', 'reason'),
        route: (context) => {
          const target = returnTarget(context);
          return target === 'applicant' || target === null
            ? 'draft'
            : ENTRY[target];
        },
        set: moving((context) => ({
          resumeAt:
            context.input.resumeToMe === true
              ? stageOf(context.record.status)
              : null,
        })),
      },

      withdraw: {
        from: [...REVIEWING],
        to: 'draft',
        guard: isApplicant,
        set: moving(() => ({ resumeAt: null })),
      },
    },
    onEnter: {
      managerReview: [notifyResponsible],
      managerPreSign: [notifyResponsible],
      managerPostSign: [notifyResponsible],
      countersign: [notifyResponsible],
      procurementPool: [notifyResponsible],
      procurementClaimed: [notifyResponsible],
      ceoReview: [notifyResponsible],
      ceoPreSign: [notifyResponsible],
      ceoPostSign: [notifyResponsible],
      draft: [notifyApplicant],
      approved: [notifyApplicant],
      rejected: [notifyApplicant],
    },
    triggers: {
      escalateManager: {
        transition: 'escalate',
        when: ['managerReview', 'ceoReview'],
        after: ({ escalateAfterHours }) => escalateAfterHours * 3_600_000,
      },
      releaseStaleClaim: {
        transition: 'release',
        when: 'procurementClaimed',
        after: ({ claimTimeoutHours }) => claimTimeoutHours * 3_600_000,
      },
    },
  });

/** The fields `runtime.create()` needs besides applicant, title and amount. */
export function contractDraft(values: {
  readonly applicantId: string;
  readonly title: string;
  readonly amount: number;
}): Record<string, unknown> {
  return {
    ...values,
    round: 0,
    stageEntry: 0,
    approverId: null,
    addedSigner: null,
    countersigners: [],
    countersignVotes: [],
    pool: [],
    claimedBy: null,
    resumeAt: null,
    votes: [],
  };
}
