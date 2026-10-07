import type {
  JsonObject,
  Lifecycle,
  LifecycleRecord,
  LifecycleTypes,
  ParametersOf,
  ServicesOf,
  SetContext,
  StateDefinition,
} from '@nocobase/lifecycle';

import type { AddMode, RunRow, TaskRow } from './model.js';
import type { StagePolicy } from './policies.js';

/** What the approval layer asks of the organization. */
export interface ApprovalDirectory {
  isActive(person: string): boolean;
  managerOf(person: string): string | undefined;
  hasRole(person: string, role: string): boolean;
  /**
   * Whom `principal` has delegated decisions of `kind` to at `at`, for work
   * they took on at `assignedAt`. A delegation is not passed on.
   */
  delegateOf?(
    principal: string,
    kind: string,
    at: string,
    assignedAt: string,
  ): { readonly to: string } | undefined;
}

/**
 * The types of a run's own lifecycle: a run record whose state is the stage
 * it waits in, with the business's services.
 */
export interface RunTypes<T extends LifecycleTypes> {
  record: LifecycleRecord;
  state: string;
  services: ServicesOf<T>;
}

/** What `when` and a version function read: the record as it is submitted. */
export interface PlanContext<T extends LifecycleTypes> {
  readonly record: T['record'];
  readonly parameters: ParametersOf<T>;
  /** The rule version the run is planned under. */
  readonly version: number;
}

/**
 * What a stage's people are chosen from: the record as it is under review —
 * with the changes proposed so far applied — and the parameters it was
 * submitted under.
 */
export interface AssigneeContext<
  T extends LifecycleTypes,
> extends PlanContext<T> {
  readonly applicantId: string;
  readonly directory: ApprovalDirectory;
  readonly services: ServicesOf<T>;
  /** Push why the people are who they are; the stage keeps it. */
  readonly notes: string[];
}

export type Assignees = readonly (string | null | undefined)[];

export interface StageSubject {
  readonly subject: string;
  readonly assignee: string | null | undefined;
  readonly data: JsonObject;
}

/**
 * One stage: who is asked, how their answers add up (a policy), and what
 * the stage may do. A stage is a state of the run, never of the business
 * record, which waits in one state for the whole run.
 */
export interface StageDefinition<T extends LifecycleTypes> {
  readonly title?: string;
  readonly policy: StagePolicy<never>;
  readonly options: unknown;
  assignees(context: AssigneeContext<T>): Assignees | Promise<Assignees>;
  /**
   * One task per subject instead of one per person — the lines of a claim,
   * each with whoever decides it and what it says. A person may hold
   * several. `data` is kept on the task and its hash binds the answer.
   */
  subjects?(
    context: AssigneeContext<T>,
  ): readonly StageSubject[] | Promise<readonly StageSubject[]>;
  /** Whether the stage applies, read once at submission and kept in the plan. */
  when?(context: PlanContext<T>): boolean;
  /** Why the stage applies or not, kept in the plan. */
  because?(context: PlanContext<T> & { readonly included: boolean }): string;
  /** The frozen fields this stage's approval covers. Absent covers them all. */
  readonly covers?: readonly string[];
  /**
   * Fields the stage's people may propose changes to. A change is applied to
   * the run's content, never to the record, and settled onto the record when
   * the run ends approved or returned.
   */
  readonly canRevise?: readonly string[];
  /** Choose the people at submission rather than on entering the stage. */
  readonly chooseAt?: 'enter' | 'submit';
  /**
   * When nobody qualifies: refuse the transition entering the stage, or
   * hold it for an administrator to assign someone. Defaults to `hold`.
   */
  readonly onEmpty?: 'refuse' | 'hold';
  /** A role a person must hold to be assigned or to take over here. */
  readonly qualification?: string;
  /** An idle answer is reminded after this many hours. */
  readonly remindAfterHours?: number;
  /** An idle answer is passed to the assignee's manager after this many hours. */
  readonly escalateAfterHours?: number;
  /** A claim nobody acts on goes back to the pool after this many hours. */
  readonly claimTimeoutHours?: number;
  /** Whether an assignee may hand the task to someone else. Defaults to true. */
  readonly transfer?: boolean;
}

/** A task that has become someone's to act on, or a reminder of one, told after the commit. */
export interface TaskNotice<T extends LifecycleTypes> {
  readonly task: TaskRow;
  readonly services: ServicesOf<T>;
  readonly reason: 'assigned' | 'reminder';
}

/**
 * The business transitions a run's end fires on the record, all leaving the
 * approval's state. The business declares them, with where
 * they lead and what they check; their input carries the run's id, the
 * stage, the outcome, the concluding answer and the changes to settle.
 */
export interface ApprovalExits {
  readonly approved: string;
  readonly rejected: string;
  /** Fired when a stage returns the request to the applicant; absent, there is no such return. */
  readonly returned?: string;
  /** Other ends a policy may name, such as a partial approval, by the transition each fires. */
  readonly others?: Readonly<Record<string, string>>;
}

export interface ApprovalOptions<T extends LifecycleTypes, S extends string> {
  /** Unique among approvals; the task rows carry it. */
  readonly name: string;
  /** What a delegation names to cover these decisions. Defaults to the name. */
  readonly kind?: string;
  /** The rule version a new run is planned under. Defaults to 1. */
  readonly version?:
    number | ((context: Omit<PlanContext<T>, 'version'>) => number);
  /** Whom the request is for: nobody decides their own. */
  applicant(record: T['record']): string;
  directory(services: ServicesOf<T>): ApprovalDirectory;
  /** The record's fields every decision is bound to. */
  readonly freeze?: readonly string[];
  readonly stages: Readonly<Record<S, StageDefinition<T>>>;
  /** The stages in order. */
  readonly flow: readonly S[];
  readonly exits: ApprovalExits;
  /** The rules a run is submitted under, kept with it for its policies to read. */
  settings?(context: PlanContext<T>): JsonObject;
  /**
   * Returns to an earlier stage, and whether the person returning may ask
   * to come straight back to them once it is decided again.
   */
  readonly returns?: { readonly earlier?: boolean; readonly resume?: boolean };
  /**
   * On a resubmission after a return to the applicant: keep the version of
   * the first submission (default), and keep the approvals whose covered
   * fields did not change (`keep: 'valid'`) or decide everything again.
   */
  readonly resubmit?: {
    /** Or decided by the returned run, such as by a setting it was submitted under. */
    readonly keep?: 'none' | 'valid' | ((previous: RunRow) => 'none' | 'valid');
    readonly keepVersion?: boolean;
  };
  /**
   * Whether an administrator may move a run in flight to another rule
   * version: generates a system transition from each stage to the others.
   */
  readonly migrations?: boolean;
  /** The explicit rule that approves a request no stage applies to. Without it, such a submission is refused. */
  readonly noStages?: { readonly because: string };
  /** Answers that need a reason. Defaults to rejecting and returning. */
  readonly reasons?: readonly ('reject' | 'return')[];
  /** Added signers: which modes, and how deep an added signer may add again. */
  readonly signers?: {
    readonly modes: readonly AddMode[];
    readonly maxDepth?: number;
  };
  /** Questions to someone whose opinion decides nothing; `blocking` holds the asker until answered. */
  readonly consultations?: { readonly blocking: boolean };
  /** Asking the applicant for material without returning the request. */
  readonly materials?: boolean;
  /** A lone approver who approved an earlier stage of the run passes their later one. */
  readonly skipRepeated?: boolean;
  /** Who gets a copy once the run is approved. */
  copies?(record: T['record']): readonly string[];
  /** The role that reassigns and migrates, but never decides. */
  readonly adminRole?: string;
  /** The role that assigns a pool to one of its candidates. */
  readonly supervisorRole?: string;
  readonly notify?: (notice: TaskNotice<T>) => void | Promise<void>;
}

/** What an approval generates, and what its services read. */
export interface Approval<T extends LifecycleTypes> {
  readonly name: string;
  readonly kind: string;
  readonly options: ApprovalOptions<T, string>;
  readonly flow: readonly string[];
  /** The run's own lifecycle: register it with the business lifecycle. */
  readonly lifecycle: Lifecycle<RunTypes<T>>;
  /**
   * The business state a record waits in while a run decides, ready to list
   * in the business lifecycle's `states`: entering it starts a run, leaving
   * it before the run ends cancels the run. Its meta names the approval.
   */
  state(
    name: T['state'],
    options?: { readonly title?: string; readonly meta?: JsonObject },
  ): StateDefinition<T['state'], T>;
  /**
   * The `set` of an exit transition: the changes the run settled, for the
   * business to write with its own fields. An exit that drops them fails
   * the run's end rather than losing them.
   */
  readonly settle: (context: SetContext<T>) => Record<string, unknown>;
  isStage(state: string): boolean;
  stage(state: string): StageDefinition<T>;
  /** The run transition a stage's conclusion fires. */
  transition(
    stage: string,
    outcome:
      'approve' | 'reject' | 'return' | 'revise' | 'migrate' | 'conclude',
  ): string;
  /** Where an approved stage leads under the run's plan: a later stage, or `approved`. */
  next(stage: string, run: RunRow): string;
  /** The plan a run would get for this record. */
  plan(context: PlanContext<T>): readonly {
    readonly stage: string;
    readonly included: boolean;
    readonly because: string | null;
  }[];
  version(context: Omit<PlanContext<T>, 'version'>): number;
  /** The structure, for a lock file that makes a structural change bump the version. */
  describe(): JsonObject;
}
