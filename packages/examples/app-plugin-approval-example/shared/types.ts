import type {
  EventRow,
  RunRow,
  TaskActions,
  TaskRow,
} from '@nocobase/app-plugin-approval/server';
import type {
  AvailableTransition,
  EffectRun,
  JsonObject,
  LifecycleDescription,
  LifecycleRecord,
  TransitionEntry,
} from '@nocobase/lifecycle';

import type { BusinessKey, DemoKey } from './catalog.js';

/**
 * What the example's routes answer, shared by the server that builds it and
 * the client that shows it.
 */

/** One person of the example's organization as it is configured now. */
export interface PersonView {
  readonly id: string;
  readonly active: boolean;
  readonly manager: string | null;
  readonly roles: readonly string[];
}

/** One record as the lists and the to-do center show it. */
export interface RecordSummary {
  readonly lifecycle: string;
  readonly id: string;
  /** The demo it was started as, or its parent's for a child. */
  readonly demo: DemoKey | null;
  readonly business: BusinessKey | null;
  readonly title: string | null;
  readonly status: string;
  /** Whom it is for: an applicant, a customer, a publisher, a holder. */
  readonly applicantId: string | null;
  /** The record it is part of: a coordinated request, a grant's request. */
  readonly parent: { readonly lifecycle: string; readonly id: string } | null;
  readonly createdAt: string | null;
  readonly changedAt: string | null;
  /** Who it waits for now. */
  readonly handlers: readonly string[];
  /** The stage it waits in while an approval decides, otherwise null. */
  readonly stage: string | null;
  /** The fields a list row and the detail show. */
  readonly facts: JsonObject;
}

export type InboxBox = 'toDo' | 'done' | 'mine' | 'copiedToMe';

/** One entry of a person's to-do center. */
export interface InboxItem {
  readonly box: InboxBox;
  readonly lifecycle: string;
  readonly recordId: string;
  /** A task of the approval layer, a notice's copy, or a business transition. */
  readonly source: 'task' | 'acknowledgement' | 'transition' | 'record';
  readonly taskId: string | null;
  /** What the person would do: an action, a transition, or null to look. */
  readonly action: string | null;
  /** The stage, the copy's kind or the record's state. */
  readonly detail: string | null;
  readonly since: string | null;
  /** Whom the person acts for under a delegation. */
  readonly onBehalfOf: string | null;
}

export interface Message {
  readonly id: string;
  readonly recipientId: string;
  readonly subject: string;
  readonly createdAt: string;
}

export interface Operation {
  readonly id: string;
  readonly kind: string;
  readonly key: string;
  readonly input: JsonObject;
  readonly result: JsonObject;
  readonly createdAt: string;
}

/** What the administrator changes about the organization and the simulations. */
export interface LabSettings {
  /** Overrides of who manages whom. */
  readonly managers?: Readonly<Record<string, string>>;
  /** Overrides of who holds a role. */
  readonly roles?: Readonly<Record<string, readonly string[]>>;
  /** People who left. */
  readonly inactive?: readonly string[];
  readonly delegations?: readonly {
    readonly from: string;
    readonly to: string;
    readonly start: string;
    readonly end: string;
    readonly kinds: readonly string[];
    readonly coversExisting: boolean;
  }[];
  /** The rule version new versioned leave requests are planned under. */
  readonly ruleVersion?: number;
  /** A simulated provider that is down. */
  readonly failOperation?: string;
  /** Whether a payment outage is a refusal rather than a transient error. */
  readonly declinePayment?: boolean;
  /** Whether the company registry rates new suppliers high risk. */
  readonly highRisk?: boolean;
}

export interface Overview {
  readonly people: readonly PersonView[];
  readonly records: readonly RecordSummary[];
  readonly inbox: readonly InboxItem[];
  readonly messages: readonly Message[];
  readonly operations: readonly Operation[];
  readonly settings: LabSettings;
}

/** One step a new request would go through, before it is submitted. */
export interface PreviewStep {
  readonly key: string;
  readonly title: string | null;
  readonly kind: 'stage' | 'branch';
  /** The stage's policy, or the branch's kind. */
  readonly rule: string;
  readonly people: readonly string[];
  readonly included: boolean;
  readonly required: boolean;
  readonly because: string | null;
}

export interface Preview {
  readonly mode: 'stages' | 'branches' | 'none';
  readonly steps: readonly PreviewStep[];
  readonly problems: readonly string[];
  readonly notes: readonly string[];
}

/** One stage of a run as its plan and its tasks show it. */
export interface StageView {
  readonly key: string;
  readonly title: string | null;
  readonly policy: string;
  readonly included: boolean;
  readonly because: string | null;
  readonly state: 'done' | 'current' | 'waiting' | 'skipped';
  /** The fields its people may propose changes to. */
  readonly canRevise: readonly string[];
  /** The answers its policy takes besides approve and reject. */
  readonly answers: readonly string[];
}

/** One approval run of a record: its plan, every task, its log and its moves. */
export interface RunView {
  readonly run: RunRow;
  readonly stages: readonly StageView[];
  readonly tasks: readonly TaskRow[];
  readonly events: readonly EventRow[];
  readonly history: readonly TransitionEntry[];
  /** Where the current stage may return the request: earlier stages, or `applicant`. */
  readonly returnTargets: readonly string[];
}

/** One branch of a coordinated request and where its child record stands. */
export interface BranchView {
  readonly key: string;
  readonly title: string;
  readonly kind: string;
  readonly required: boolean;
  readonly status: 'active' | 'superseded';
  readonly revision: number;
  readonly because: string | null;
  readonly childLifecycle: string;
  readonly childId: string;
  readonly childStatus: string;
}

/** What an administrator or a supervisor may do on a task or a record. */
export interface AdminAction {
  readonly action: 'assign' | 'reassign' | 'appoint' | 'migrate';
  readonly taskId: string | null;
  readonly approval: string;
  readonly assigneeId: string | null;
  /** Who it may go to. */
  readonly candidates: readonly string[];
}

export interface Acknowledgement {
  readonly id: string;
  readonly recipientId: string;
  readonly kind: string;
  readonly status: string;
  readonly readAt: string | null;
  readonly confirmedAt: string | null;
  readonly comments: readonly {
    readonly authorId: string;
    readonly text: string;
    readonly at: string;
  }[];
}

/** One record as its detail shows it to the person acting. */
export interface RecordDetail {
  readonly summary: RecordSummary;
  readonly record: LifecycleRecord;
  readonly state: string;
  readonly version: number | null;
  /** The business transitions offered to the person, allowed or not. */
  readonly available: readonly AvailableTransition[];
  readonly history: readonly TransitionEntry[];
  readonly runs: readonly RunView[];
  /** The tasks the person may act on now, with the actions each takes. */
  readonly actions: readonly TaskActions[];
  readonly admin: readonly AdminAction[];
  readonly branches: readonly BranchView[];
  readonly acknowledgements: readonly Acknowledgement[];
  /** What a few businesses keep beside the record: payments, balances, notes. */
  readonly extras: JsonObject;
  readonly effects: readonly EffectRun[];
  readonly description: LifecycleDescription;
  readonly diagram: string;
}

/** What happened when a request was created: the record, and whether it was sent on its way. */
export interface Created {
  readonly lifecycle: string;
  readonly id: string;
  readonly status: string;
}
