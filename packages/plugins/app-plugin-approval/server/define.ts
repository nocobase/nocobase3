import {
  defineLifecycle,
  SYSTEM_ACTOR,
  type JsonObject,
  type LifecycleTransaction,
  type LifecycleTypes,
  type ParametersOf,
  type ServicesOf,
  type SetContext,
  type StateDefinition,
  type StateHook,
  type StateHookContext,
  type TransitionContext,
  type TransitionDefinition,
} from '@nocobase/lifecycle';

import { ApprovalError } from './errors.js';
import {
  APPROVAL_COLLECTIONS,
  changedFields,
  freezeOf,
  hashOf,
  isOpenRun,
  toRun,
  toTask,
  type ContentChange,
  type PlanEntry,
  type RunEnd,
  type RunRow,
} from './model.js';
import {
  allPolicy,
  anyPolicy,
  claimablePolicy,
  firstPolicy,
  sequentialPolicy,
  thresholdPolicy,
  type AllOptions,
  type ClaimableOptions,
  type PlannedTask,
  type StagePolicy,
  type ThresholdOptions,
} from './policies.js';
import type {
  Approval,
  ApprovalDirectory,
  ApprovalOptions,
  AssigneeContext,
  Assignees,
  PlanContext,
  RunTypes,
  StageDefinition,
} from './types.js';
import { ApprovalWork } from './work.js';

// ------------------------------------------------------------ choosing people

/**
 * Walks up the management chain `levels` times, passing over a manager who
 * can no longer act and saying so.
 */
export function managerChain(
  directory: ApprovalDirectory,
  person: string,
  levels: number,
  notes: string[],
): string | undefined {
  let current: string | undefined = person;
  for (let level = 0; level < levels && current !== undefined; level += 1) {
    let next = directory.managerOf(current);
    while (next !== undefined && !directory.isActive(next)) {
      notes.push(`Manager ${next} is inactive; passed to the next level.`);
      next = directory.managerOf(next);
    }
    current = next;
  }
  return current;
}

/**
 * The people of a stage: each once, active, qualified, and never the
 * applicant — a stage left with nobody but the applicant passes to their
 * manager. Every reason is noted.
 */
export async function choosePeople<T extends LifecycleTypes>(
  definition: StageDefinition<T>,
  context: Omit<AssigneeContext<T>, 'notes'>,
): Promise<{ readonly people: string[]; readonly notes: string[] }> {
  const notes: string[] = [];
  const { directory, applicantId } = context;
  const raw = (await definition.assignees({ ...context, notes })).filter(
    (person): person is string => typeof person === 'string' && person !== '',
  );
  const unique = [...new Set(raw)];
  if (unique.length < raw.length)
    notes.push('A person chosen more than once is counted once.');
  const active = unique.filter((person) => {
    if (directory.isActive(person)) return true;
    notes.push(`${person} is inactive and was not assigned.`);
    return false;
  });
  const qualified = active.filter((person) => {
    if (
      definition.qualification === undefined ||
      directory.hasRole(person, definition.qualification)
    )
      return true;
    notes.push(`${person} does not hold "${definition.qualification}".`);
    return false;
  });
  let people = qualified.filter((person) => person !== applicantId);
  if (people.length < qualified.length) {
    notes.push(`${applicantId} may not decide their own request.`);
    if (!people.length) {
      const manager = managerChain(directory, applicantId, 1, notes);
      if (manager !== undefined) {
        people = [manager];
        notes.push(`Passed to ${manager}, the applicant's manager.`);
      }
    }
  }
  if (!people.length)
    notes.push(
      'No qualified person could be assigned; an administrator has to assign someone.',
    );
  return { people, notes };
}

// ------------------------------------------------------------ stage helpers

type StageBase<T extends LifecycleTypes> = Omit<
  StageDefinition<T>,
  'policy' | 'options' | 'assignees'
>;

type Choose<T extends LifecycleTypes> = (
  context: AssigneeContext<T>,
) => Assignees | Promise<Assignees>;

export interface StageHelpers<T extends LifecycleTypes> {
  single(
    definition: StageBase<T> & {
      readonly assignee: (
        context: AssigneeContext<T>,
      ) => string | null | undefined | Promise<string | null | undefined>;
    },
  ): StageDefinition<T>;
  all(
    definition: StageBase<T> & {
      assignees: Choose<T>;
      readonly onReject?: AllOptions['onReject'];
    },
  ): StageDefinition<T>;
  any(definition: StageBase<T> & { assignees: Choose<T> }): StageDefinition<T>;
  first(
    definition: StageBase<T> & { assignees: Choose<T> },
  ): StageDefinition<T>;
  threshold(
    definition: StageBase<T> & { assignees: Choose<T> } & ThresholdOptions,
  ): StageDefinition<T>;
  claimable(
    definition: StageBase<T> & {
      candidates: Choose<T>;
      readonly mustClaim?: boolean;
    },
  ): StageDefinition<T>;
  sequential(
    definition: StageBase<T> & { assignees: Choose<T> },
  ): StageDefinition<T>;
  custom<Options>(
    policy: StagePolicy<Options>,
    options: Options,
    definition: StageBase<T> & { assignees: Choose<T> },
  ): StageDefinition<T>;
}

function build<T extends LifecycleTypes, Options>(
  policy: StagePolicy<Options>,
  options: Options,
  definition: StageBase<T>,
  assignees: Choose<T>,
): StageDefinition<T> {
  return Object.freeze({
    ...definition,
    policy: policy,
    options,
    assignees,
  });
}

/** The stage constructors for one business's types. */
export function stagesFor<T extends LifecycleTypes>(): StageHelpers<T> {
  return {
    single: ({ assignee, ...definition }) =>
      build(
        allPolicy,
        { onReject: 'immediate' },
        definition,
        async (context) => [await assignee(context)],
      ),
    all: ({ assignees, onReject, ...definition }) =>
      build(
        allPolicy,
        { onReject: onReject ?? 'immediate' },
        definition,
        assignees,
      ),
    any: ({ assignees, ...definition }) =>
      build(anyPolicy, {}, definition, assignees),
    first: ({ assignees, ...definition }) =>
      build(firstPolicy, {}, definition, assignees),
    threshold: ({ assignees, min, vetoers, abstain, ...definition }) =>
      build(
        thresholdPolicy,
        {
          min,
          ...(vetoers === undefined ? {} : { vetoers }),
          ...(abstain === undefined ? {} : { abstain }),
        },
        definition,
        assignees,
      ),
    claimable: ({ candidates, mustClaim, ...definition }) =>
      build(
        claimablePolicy,
        { mustClaim: mustClaim ?? true } satisfies ClaimableOptions,
        definition,
        candidates,
      ),
    sequential: ({ assignees, ...definition }) =>
      build(sequentialPolicy, {}, definition, assignees),
    custom: (policy, options, { assignees, ...definition }) =>
      build(policy, options, definition, assignees),
  };
}

// ------------------------------------------------------------ the approval

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hours(value: number | undefined, from: Date): string | null {
  return value === undefined
    ? null
    : new Date(from.getTime() + value * 3_600_000).toISOString();
}

/** A run's ends double as its final states, so no stage may take their names. */
const RESERVED: readonly string[] = [
  'approved',
  'rejected',
  'returned',
  'concluded',
  'cancelled',
  'cancel',
];

type Outcome =
  'approve' | 'reject' | 'return' | 'revise' | 'migrate' | 'conclude';

/**
 * Turns an approval's stages into a lifecycle of its own: a run is a record
 * whose states are the stages, with system transitions between them and to
 * the run's ends, and hooks that open each stay's tasks on entering a stage
 * and end them on leaving it. The business record waits meanwhile in one
 * state of its own, which `state()` defines — entering it starts a run,
 * leaving it early cancels the run — and learns only the end: the run fires one of the
 * business's exit transitions, in the same transaction, with the changes
 * its stages proposed to the content.
 */
export function defineApproval<T extends LifecycleTypes, S extends string>(
  options: ApprovalOptions<T, S>,
): Approval<T> {
  const flow: readonly string[] = options.flow;
  const stages = options.stages as Readonly<Record<string, StageDefinition<T>>>;
  for (const stage of flow) {
    if (!stages[stage])
      throw new Error(`Approval "${options.name}": no stage "${stage}".`);
    if (RESERVED.includes(stage))
      throw new Error(
        `Approval "${options.name}": "${stage}" names how a run ends, not a stage.`,
      );
  }
  for (const stage of Object.keys(stages))
    if (!flow.includes(stage))
      throw new Error(
        `Approval "${options.name}": stage "${stage}" is not in the flow.`,
      );
  const exits = options.exits;
  const others = Object.keys(exits.others ?? {});
  const freeze = options.freeze ?? [];
  const runs = `approval:${options.name}`;
  const index = (stage: string): number => flow.indexOf(stage);
  const isStage = (state: string | null): state is string =>
    state !== null && flow.includes(state);
  const transition = (stage: string, outcome: Outcome): string =>
    `${stage}.${outcome}`;

  const keepOf = (previous: RunRow): 'none' | 'valid' => {
    const keep = options.resubmit?.keep ?? 'none';
    return typeof keep === 'function' ? keep(previous) : keep;
  };

  const versionOf = (context: Omit<PlanContext<T>, 'version'>): number =>
    typeof options.version === 'function'
      ? options.version(context)
      : (options.version ?? 1);

  const plan = (context: PlanContext<T>): PlanEntry[] =>
    flow.map((stage) => {
      const definition = stages[stage];
      const included = definition.when ? definition.when(context) : true;
      return {
        stage,
        included,
        because: definition.because
          ? definition.because({ ...context, included })
          : null,
        people: null,
      };
    });

  const next = (stage: string, run: RunRow): string => {
    if (run.resumeAt !== null && index(run.resumeAt) > index(stage))
      return run.resumeAt;
    const later = run.plan.find(
      (entry) => entry.included && index(entry.stage) > index(stage),
    );
    return later?.stage ?? 'approved';
  };

  /** Stages an approval from `stage` may reach: past conditional stages, or anywhere later when a return may come straight back. */
  const forward = (stage: string): string[] => {
    const targets: string[] = [];
    for (const later of flow.slice(index(stage) + 1)) {
      targets.push(later);
      if (!options.returns?.resume && !stages[later].when) return targets;
    }
    return [...targets, 'approved'];
  };

  const describe = (): JsonObject => ({
    name: options.name,
    lifecycle: runs,
    version: typeof options.version === 'number' ? options.version : 'dynamic',
    flow: [...flow],
    exits: {
      approved: exits.approved,
      rejected: exits.rejected,
      ...(exits.returned === undefined ? {} : { returned: exits.returned }),
      ...(others.length ? { others: { ...exits.others } } : {}),
    },
    stages: flow.map((stage) => ({
      stage,
      policy: stages[stage].policy.kind,
      options: (stages[stage].options ?? {}) as JsonObject,
      conditional: stages[stage].when !== undefined,
      covers: [...(stages[stage].covers ?? [])],
      canRevise: [...(stages[stage].canRevise ?? [])],
    })),
    returns: { ...(options.returns ?? {}) },
  });

  const work = (context: {
    readonly tx: LifecycleTransaction;
    readonly services: ServicesOf<T>;
    readonly now: Date;
  }): ApprovalWork<T> =>
    new ApprovalWork(approval, context.tx, context.services, context.now);

  const assigneeContext = (
    w: ApprovalWork<T>,
    run: Pick<RunRow, 'parameters' | 'version'>,
    record: T['record'],
  ): Omit<AssigneeContext<T>, 'notes'> => ({
    record,
    parameters: run.parameters as unknown as ParametersOf<T>,
    version: run.version,
    applicantId: options.applicant(record),
    directory: options.directory(w.services),
    services: w.services,
  });

  // -------------------------------------------------- the business side

  /**
   * Entering the approval's state starts a run, in the first stage its plan
   * includes — or approved at once under `noStages` — with the frozen
   * content and the parameters as they are now.
   */
  const startRun = async (context: StateHookContext<T>): Promise<void> => {
    const w = work(context);
    const recordId = String(context.record.id);
    const earlier = await w.runs(context.lifecycle, recordId);
    if (earlier.some(isOpenRun))
      throw new Error(
        `${context.lifecycle} record "${recordId}" already has an approval run in progress.`,
      );
    const previous = earlier.at(-1);
    const keepVersion = options.resubmit?.keepVersion !== false;
    const version =
      previous?.status === 'returned' && keepVersion
        ? previous.version
        : versionOf({
            record: context.record,
            parameters: context.parameters,
          });
    const planned = plan({
      record: context.record,
      parameters: context.parameters,
      version,
    });
    const first = planned.find((entry) => entry.included)?.stage;
    if (first === undefined && options.noStages === undefined)
      throw new ApprovalError(
        'NO_STAGE',
        'No stage applies to this request, and no rule approves it without one.',
      );
    const content = freezeOf(context.record, freeze);
    const parameters = { ...context.parameters } as unknown as JsonObject;
    // People chosen at submission are kept in the plan, so an organization
    // change later does not move them.
    const chosen: PlanEntry[] = [];
    for (const entry of planned) {
      const definition = stages[entry.stage];
      if (!entry.included || definition.chooseAt !== 'submit') {
        chosen.push(entry);
        continue;
      }
      const { people } = await choosePeople(
        definition,
        assigneeContext(w, { parameters, version }, context.record),
      );
      chosen.push({ ...entry, people });
    }
    await w.tx.create(
      runs,
      {
        source: options.name,
        lifecycle: context.lifecycle,
        recordId,
        applicantId: options.applicant(context.record),
        version,
        plan: chosen,
        settings:
          options.settings?.({
            record: context.record,
            parameters: context.parameters,
            version,
          }) ?? {},
        parameters,
        outcome: null,
        submitted: content,
        changes: [],
        content,
        contentHash: hashOf(content),
        previousRunId: previous?.id ?? null,
        resumeAt: null,
        returnedBy: null,
        startedAt: w.at,
        startedBy: context.actor.id,
        endedAt: null,
        endedBy: null,
        endedWith: null,
        note: null,
        sequence: 0,
        rowVersion: 0,
      },
      {
        actor: context.actor,
        state: first ?? 'approved',
        input: { transition: context.transition },
      },
    );
  };

  /** Leaving the approval's state before the run ends — a withdrawal — cancels the run. */
  const cancelRun = async (context: StateHookContext<T>): Promise<void> => {
    const w = work(context);
    const run = await w.openRun(context.lifecycle, String(context.record.id));
    if (!run) return;
    const reason = text(context.input.reason);
    await w.tx.fire(runs, run.id, 'cancel', {
      actor: context.actor,
      input: { transition: context.transition, ...(reason ? { reason } : {}) },
    });
  };

  const state = (
    name: T['state'],
    given: { readonly title?: string; readonly meta?: JsonObject } = {},
  ): StateDefinition<T['state'], T> => ({
    name,
    ...(given.title === undefined ? {} : { title: given.title }),
    meta: { ...(given.meta ?? {}), approval: options.name },
    onEnterState: startRun,
    onLeaveState: cancelRun,
  });

  const settle = (context: SetContext<T>): Record<string, unknown> => {
    const changes = context.input.changes;
    return changes !== null &&
      typeof changes === 'object' &&
      !Array.isArray(changes)
      ? { ...changes }
      : {};
  };

  // -------------------------------------------------- the run's stages

  const logStarted = (
    w: ApprovalWork<T>,
    run: RunRow,
    actorId: string,
  ): Promise<unknown> =>
    w.log(run, {
      kind: 'run.started',
      actorId,
      data: {
        version: run.version,
        plan: run.plan as unknown as JsonObject[],
        contentHash: run.contentHash,
        ...(run.previousRunId === null
          ? {}
          : { previousRunId: run.previousRunId }),
      },
    });

  /**
   * Why a stage needs nobody on its first visit of a resubmitted run, and
   * where it leads instead: straight back to the stage that returned the
   * request and asked for that, or past an approval of the previous round
   * whose covered fields did not change.
   */
  const skipReason = async (
    w: ApprovalWork<T>,
    stage: string,
    run: RunRow,
  ): Promise<{ readonly reason: string; readonly to: string } | null> => {
    if (run.previousRunId === null) return null;
    const previous = await w.run(run.previousRunId);
    if (previous.status !== 'returned') return null;
    if ((await w.events(run)).some((event) => event.stage === stage))
      return null;
    const returner = previous.returnedBy;
    if (returner?.resume === true && index(stage) < index(returner.stage))
      return {
        reason: `Returned by "${returner.stage}", which asked to come straight back.`,
        to: returner.stage,
      };
    if (keepOf(previous) !== 'valid') return null;
    if ((await w.concluded(previous, stage)) !== 'approved') return null;
    const covers = stages[stage].covers ?? freeze;
    const changed = covers.filter(
      (field) =>
        hashOf(previous.content, [field]) !== hashOf(run.content, [field]),
    );
    return changed.length
      ? null
      : {
          reason: `Approved in the previous round; ${covers.join(', ') || 'nothing it covers'} unchanged.`,
          to: next(stage, run),
        };
  };

  /**
   * A stage of subjects opens one task per subject. On a resubmission that
   * keeps what is still valid, a subject decided last round on the same
   * content keeps its answer; a returned or changed one is asked again.
   */
  const openSubjects = async (
    w: ApprovalWork<T>,
    stage: string,
    run: RunRow,
    record: T['record'],
  ): Promise<void> => {
    const definition = stages[stage];
    const base = assigneeContext(w, run, record);
    const subjects = await (
      definition.subjects as NonNullable<StageDefinition<T>['subjects']>
    )({
      ...base,
      notes: [],
    });
    const previous =
      run.previousRunId === null ? undefined : await w.run(run.previousRunId);
    const earlier =
      previous?.status === 'returned' && keepOf(previous) === 'valid'
        ? (
            await w.rows.find(APPROVAL_COLLECTIONS.tasks, {
              runId: previous.id,
              stage,
            })
          )
            .map(toTask)
            .filter(
              (task) => task.status === 'completed' && task.subject !== null,
            )
        : [];
    for (const each of subjects) {
      const hash = hashOf(each.data);
      const data: JsonObject = { ...each.data, hash };
      const kept = earlier
        .filter((task) => task.subject === each.subject)
        .at(-1);
      if (kept && kept.answer !== 'return' && kept.data?.hash === hash) {
        const copy = await w.addTask({
          lifecycle: run.lifecycle,
          recordId: run.recordId,
          runId: run.id,
          stage,
          enteredVersion: run.lifecycleVersion,
          assigneeId: kept.assigneeId,
          subject: each.subject,
          status: 'completed',
          answer: kept.answer,
          comment: kept.comment,
          data: kept.data,
          actorId: kept.actorId,
          contentHash: kept.contentHash,
          closedAt: w.at,
          seq: kept.seq,
          previousTaskId: kept.id,
          note: 'Kept from the previous round: the line did not change.',
        });
        await w.log(run, {
          kind: 'task.kept',
          stage,
          taskId: copy.id,
          actorId: SYSTEM_ACTOR.id,
          data: { subject: each.subject },
        });
        continue;
      }
      const assignee = each.assignee ?? null;
      if (
        assignee === null ||
        !base.directory.isActive(assignee) ||
        assignee === base.applicantId
      ) {
        if (definition.onEmpty === 'refuse')
          throw new ApprovalError(
            'NO_ASSIGNEE',
            `Nobody can decide "${each.subject}".`,
          );
        await w.log(run, {
          kind: 'stage.unassigned',
          stage,
          actorId: SYSTEM_ACTOR.id,
          message: `Nobody can decide "${each.subject}"; an administrator has to assign someone.`,
        });
        continue;
      }
      const task = await w.addTask({
        lifecycle: run.lifecycle,
        recordId: run.recordId,
        runId: run.id,
        stage,
        enteredVersion: run.lifecycleVersion,
        assigneeId: assignee,
        subject: each.subject,
        data,
        remindAt: hours(definition.remindAfterHours, w.now),
        dueAt: hours(definition.escalateAfterHours, w.now),
      });
      await w.log(run, {
        kind: 'task.assigned',
        stage,
        taskId: task.id,
        actorId: SYSTEM_ACTOR.id,
        data: { assigneeId: assignee, subject: each.subject },
      });
    }
    // Everything may already be decided: every line kept from the last round.
    await w.settle(
      run,
      stage,
      run.lifecycleVersion,
      { kind: 'changed' },
      SYSTEM_ACTOR,
    );
  };

  const enter =
    (stage: string): StateHook<RunTypes<T>> =>
    async (context) => {
      const w = work(context);
      let run = toRun(context.record);
      if (context.from === null) await logStarted(w, run, context.actor.id);
      if (run.resumeAt === stage)
        run = await w.changeRun(run, { resumeAt: null });
      const skipped = await skipReason(w, stage, run);
      if (skipped !== null) {
        await w.skip(run, stage, skipped.reason, skipped.to);
        return;
      }
      const record = w.reviewed(await w.record(run), run) as T['record'];
      const definition = stages[stage];
      if (definition.subjects) {
        await openSubjects(w, stage, run, record);
        return;
      }
      const entry = run.plan.find((each) => each.stage === stage);
      const chosen =
        entry?.people === null || entry?.people === undefined
          ? await choosePeople(definition, assigneeContext(w, run, record))
          : { people: [...entry.people], notes: [] };
      for (const message of chosen.notes)
        await w.log(run, {
          kind: 'stage.note',
          stage,
          actorId: SYSTEM_ACTOR.id,
          message,
        });
      if (
        options.skipRepeated &&
        chosen.people.length === 1 &&
        !(await w.stay(run, stage)).length
      ) {
        const covered = (
          await w.rows.find(APPROVAL_COLLECTIONS.tasks, {
            runId: run.id,
            assigneeId: chosen.people[0],
            status: 'completed',
            answer: 'approve',
          })
        ).find((task) => task.stage !== stage);
        if (covered) {
          await w.skip(
            run,
            stage,
            `${chosen.people[0]} approved "${String(covered.stage)}" this round; that approval covers this stage.`,
            next(stage, run),
          );
          return;
        }
      }
      if (!chosen.people.length) {
        if (definition.onEmpty === 'refuse')
          throw new ApprovalError(
            'NO_ASSIGNEE',
            `Nobody can decide "${stage}": ${chosen.notes.join(' ')}`,
          );
        await w.log(run, {
          kind: 'stage.unassigned',
          stage,
          actorId: SYSTEM_ACTOR.id,
          message: 'Waiting for an administrator to assign someone.',
        });
        return;
      }
      const planned = (
        definition.policy as unknown as {
          plan(context: {
            people: readonly string[];
            options: unknown;
          }): readonly PlannedTask[];
        }
      ).plan({ people: chosen.people, options: definition.options });
      for (const task of planned) {
        const created = await w.addTask({
          lifecycle: run.lifecycle,
          recordId: run.recordId,
          runId: run.id,
          stage,
          enteredVersion: run.lifecycleVersion,
          assigneeId: task.assigneeId,
          status: task.status,
          order: task.order ?? 0,
          subject: task.subject ?? null,
          remindAt: hours(definition.remindAfterHours, context.now),
          dueAt: hours(definition.escalateAfterHours, context.now),
        });
        await w.log(run, {
          kind: 'task.assigned',
          stage,
          taskId: created.id,
          actorId: SYSTEM_ACTOR.id,
          data: { assigneeId: created.assigneeId, via: 'plan' },
        });
      }
    };

  /** Reads `manager.approve` as `approve`; anything else — a cancellation — as null. */
  const outcomeOf = (stage: string, name: string): string | null =>
    name.startsWith(`${stage}.`) ? name.slice(stage.length + 1) : null;

  const leave =
    (stage: string): StateHook<RunTypes<T>> =>
    async (context) => {
      const w = work(context);
      const run = toRun(context.record);
      const reason =
        context.transition === 'cancel'
          ? (text(context.input.transition) ?? context.transition)
          : context.transition;
      await w.endStay(run, stage, reason, context.actor.id);
      const outcome = outcomeOf(stage, context.transition);
      const result =
        outcome === 'approve'
          ? 'approved'
          : outcome === 'reject'
            ? 'rejected'
            : outcome === 'return'
              ? 'returned'
              : outcome === 'conclude'
                ? (text(context.input.exit) ?? 'concluded')
                : null;
      if (result !== null)
        await w.log(run, {
          kind: 'stage.concluded',
          stage,
          actorId: context.actor.id,
          data: { result, to: context.to },
        });
      if (
        isStage(context.to) &&
        outcome === 'return' &&
        context.input.resume === true
      )
        await w.changeRun(run, { resumeAt: stage });
    };

  /** Which business transition a run's end fires. */
  const exitOf = (status: RunEnd, result: string): string => {
    const exit =
      status === 'approved'
        ? exits.approved
        : status === 'rejected'
          ? exits.rejected
          : status === 'returned'
            ? exits.returned
            : exits.others?.[result];
    if (exit === undefined)
      throw new Error(
        `Approval "${options.name}" has no exit for a run that ended ${result}.`,
      );
    return exit;
  };

  /**
   * A run's end: it is recorded on the run, an approval sends its copies,
   * and — unless the business record cancelled it — the business's exit
   * transition is fired in the same transaction with what the run settled.
   */
  const end =
    (status: RunEnd): StateHook<RunTypes<T>> =>
    async (context) => {
      const w = work(context);
      const run = toRun(context.record);
      // Created approved: the explicit rule needed no stage.
      const created = context.from === null;
      const stage = isStage(context.from) ? context.from : null;
      const result =
        status === 'concluded'
          ? (text(context.input.exit) ?? 'concluded')
          : status;
      const endedWith =
        created || status === 'cancelled'
          ? (text(context.input.transition) ?? context.transition)
          : context.transition;
      const actorId = created ? SYSTEM_ACTOR.id : context.actor.id;
      const ended = await w.changeRun(run, {
        outcome: status === 'cancelled' ? endedWith : result,
        endedAt: w.at,
        endedBy: actorId,
        endedWith,
        note: created
          ? (options.noStages?.because ?? null)
          : (text(context.input.reason) ?? text(context.input.comment)),
        returnedBy:
          status === 'returned' && stage !== null
            ? { stage, resume: context.input.resume === true }
            : null,
      });
      await w.log(ended, {
        kind: 'run.ended',
        stage,
        actorId,
        message: created ? (options.noStages?.because ?? null) : null,
        data: { status, transition: endedWith },
      });
      if (status === 'approved' && options.copies) {
        const record = (await w.record(ended)) as T['record'];
        for (const person of options.copies(record)) {
          const copy = await w.addTask({
            lifecycle: ended.lifecycle,
            recordId: ended.recordId,
            runId: ended.id,
            stage: status,
            enteredVersion: ended.lifecycleVersion,
            assigneeId: person,
            kind: 'copy',
            via: 'copy',
          });
          await w.log(ended, {
            kind: 'task.assigned',
            stage: status,
            taskId: copy.id,
            actorId: SYSTEM_ACTOR.id,
            data: { assigneeId: person, via: 'copy' },
          });
        }
      }
      if (status === 'cancelled') return;
      const exit = exitOf(status, result);
      // Approved or returned, what the stages changed reaches the record;
      // rejected, it never does.
      const changes =
        status === 'approved' || status === 'returned'
          ? changedFields(ended.submitted, ended.content)
          : {};
      const { to: _to, transition: _transition, ...input } = context.input;
      await w.tx.fire(ended.lifecycle, ended.recordId, exit, {
        actor: context.actor,
        input: {
          ...input,
          runId: ended.id,
          ...(stage === null ? {} : { stage }),
          outcome: result,
          changes,
        },
      });
      const fields = Object.keys(changes);
      if (fields.length) {
        const settled = await w.record(ended);
        const dropped = fields.filter(
          (field) =>
            hashOf(changes, [field]) !==
            hashOf(freezeOf(settled, [field]), [field]),
        );
        if (dropped.length)
          throw new Error(
            `Approval "${options.name}": "${exit}" did not write the changed ${dropped.join(', ')}; give it \`set: approval.settle\`.`,
          );
      }
    };

  // -------------------------------------------------- the run's lifecycle

  const routeByInput = ({ input }: TransitionContext<RunTypes<T>>): string =>
    typeof input.to === 'string' ? input.to : '';

  const transitions: Record<string, TransitionDefinition<RunTypes<T>>> = {};
  const onEnterState: Record<string, StateHook<RunTypes<T>>> = {};
  const onLeaveState: Record<string, StateHook<RunTypes<T>>> = {};
  for (const stage of flow) {
    const definition = stages[stage];
    const title = definition.title ?? stage;
    const at = index(stage);
    transitions[transition(stage, 'approve')] = {
      title: `${title}: approved`,
      from: stage,
      to: forward(stage),
      manual: false,
      route: routeByInput,
    };
    transitions[transition(stage, 'reject')] = {
      title: `${title}: rejected`,
      from: stage,
      to: 'rejected',
      manual: false,
    };
    const back = [
      ...(options.returns?.earlier ? flow.slice(0, at) : []),
      ...(exits.returned === undefined ? [] : ['returned']),
    ];
    if (back.length)
      transitions[transition(stage, 'return')] = {
        title: `${title}: returned`,
        from: stage,
        to: back,
        manual: false,
        route: routeByInput,
      };
    if (definition.canRevise?.length) {
      const revisable = definition.canRevise;
      transitions[transition(stage, 'revise')] = {
        title: `${title}: revised`,
        from: stage,
        to: [
          stage,
          ...flow
            .slice(0, at)
            .filter((earlier) =>
              (stages[earlier].covers ?? freeze).some((field) =>
                revisable.includes(field),
              ),
            ),
        ],
        manual: false,
        route: routeByInput,
        // The change is the run's, applied after those before it; the
        // business record keeps what was submitted until the run ends.
        set: ({ record, input, actor, now }) => {
          const run = toRun(record);
          const values: JsonObject = Object.fromEntries(
            Object.entries((input.values ?? {}) as JsonObject).filter(
              ([field]) => revisable.includes(field),
            ),
          );
          const change: ContentChange = {
            stage,
            taskId: text(input.taskId) ?? '',
            actorId: actor.id,
            values,
            reason: text(input.reason),
            at: now.toISOString(),
          };
          const content: JsonObject = { ...run.content, ...values };
          return {
            content,
            contentHash: hashOf(content),
            changes: [...run.changes, change],
          };
        },
        onTransition: async (context) => {
          const w = work(context);
          const revised = toRun(context.record);
          await w.log(revised, {
            kind: 'content.revised',
            stage,
            actorId: context.actor.id,
            message: text(context.input.reason),
            data: {
              fields: Object.keys((context.input.values ?? {}) as JsonObject),
              contentHash: revised.contentHash,
            },
          });
        },
      };
    }
    if (others.length)
      transitions[transition(stage, 'conclude')] = {
        title: `${title}: concluded`,
        from: stage,
        to: 'concluded',
        manual: false,
      };
    if (options.migrations && flow.length > 1)
      transitions[transition(stage, 'migrate')] = {
        title: `${title}: moved to another rule version`,
        from: stage,
        to: flow.filter((other) => other !== stage),
        manual: false,
        route: routeByInput,
      };
    onEnterState[stage] = enter(stage);
    onLeaveState[stage] = leave(stage);
  }
  transitions.cancel = {
    title: 'Cancelled',
    from: '*',
    to: 'cancelled',
    manual: false,
  };
  const ends: RunEnd[] = [
    'approved',
    'rejected',
    ...(exits.returned === undefined ? [] : (['returned'] as const)),
    ...(others.length ? (['concluded'] as const) : []),
    'cancelled',
  ];
  for (const status of ends) onEnterState[status] = end(status);

  const states: StateDefinition<string>[] = [
    ...flow.map((stage) => ({
      name: stage,
      ...(stages[stage].title ? { title: stages[stage].title } : {}),
      meta: { approval: options.name, policy: stages[stage].policy.kind },
    })),
    ...ends.map((status) => ({ name: status, final: true })),
  ];

  const lifecycle = defineLifecycle<RunTypes<T>>({
    name: runs,
    collection: APPROVAL_COLLECTIONS.runs,
    initial: [...flow, ...(options.noStages ? ['approved'] : [])],
    states,
    transitions,
    onEnterState,
    onLeaveState,
  });

  const approval: Approval<T> = {
    name: options.name,
    kind: options.kind ?? options.name,
    options: options,
    flow,
    lifecycle,
    state,
    settle,
    isStage,
    stage: (state) => {
      const definition = stages[state];
      if (!definition)
        throw new Error(`Approval "${options.name}" has no stage "${state}".`);
      return definition;
    },
    transition,
    next,
    plan,
    version: versionOf,
    describe,
  };
  return approval;
}
