import type { ReactElement } from 'react';
import type { TaskRow } from '@nocobase/app-plugin-approval/server';
import { Check, ChevronRight, Circle, CircleDot, Minus } from 'lucide-react';

import type {
  Acknowledgement,
  BranchView,
  RunView,
  StageView,
} from '../../shared/types.js';
import { useText, type Tone } from '../lib/text.js';
import { cn } from '../lib/utils.js';
import { Pill, StatusBadge } from './common.js';
import { Person } from './persona.js';

const TASK_TONES: Readonly<Record<string, Tone>> = {
  pending: 'warning',
  claimed: 'warning',
  candidate: 'info',
  waiting: 'neutral',
  blocked: 'neutral',
  suspended: 'neutral',
  completed: 'success',
  voided: 'neutral',
  transferred: 'neutral',
};

const ANSWER_TONES: Readonly<Record<string, Tone>> = {
  approve: 'success',
  reject: 'danger',
  return: 'warning',
  abstain: 'neutral',
};

/** One person's part in a stage: who, how it came to them, and what they answered. */
function TaskLine({ task }: { readonly task: TaskRow }): ReactElement {
  const text = useText();
  const answered = task.status === 'completed' && task.answer;
  return (
    <li className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
      <Person id={task.assigneeId} />
      {task.kind !== 'decide' ? (
        <Pill tone='info'>{text.t(`taskKind.${task.kind}`)}</Pill>
      ) : null}
      {task.subject ? <Pill>{task.subject}</Pill> : null}
      {answered ? (
        <Pill tone={ANSWER_TONES[task.answer ?? ''] ?? 'success'}>
          {text.lookup([`answers.${task.answer ?? ''}`], task.answer ?? '')}
        </Pill>
      ) : (
        <Pill tone={TASK_TONES[task.status] ?? 'neutral'}>
          {text.t(`taskStatus.${task.status}`)}
        </Pill>
      )}
      {task.actorId && task.actorId !== task.assigneeId ? (
        <span className='text-xs text-muted-foreground'>
          {text.t('flow.answeredBy', { name: text.name(task.actorId) })}
        </span>
      ) : null}
      {task.via !== 'plan' ? (
        <span className='text-xs text-muted-foreground'>
          {text.t(`via.${task.via}`)}
        </span>
      ) : null}
      {task.comment ? (
        <span className='w-full pl-8 text-xs text-muted-foreground'>
          “{task.comment}”
        </span>
      ) : null}
      {task.closeReason && task.status !== 'completed' ? (
        <span className='w-full pl-8 text-xs text-muted-foreground'>
          {task.closeReason}
        </span>
      ) : null}
    </li>
  );
}

const STAGE_ICONS: Readonly<Record<StageView['state'], ReactElement>> = {
  done: <Check className='size-3.5' />,
  current: <CircleDot className='size-3.5' />,
  waiting: <Circle className='size-3.5' />,
  skipped: <Minus className='size-3.5' />,
};

/** One approval run: its stages in order, each with the people asked. */
function Run({
  view,
  latest,
}: {
  readonly view: RunView;
  readonly latest: boolean;
}): ReactElement {
  const text = useText();
  const { run } = view;
  // A stage entered again after a return keeps its earlier tasks as history.
  const current = (stage: string): TaskRow[] => {
    const tasks = view.tasks.filter((task) => task.stage === stage);
    const last = Math.max(...tasks.map((task) => task.enteredVersion));
    return tasks.filter((task) => task.enteredVersion === last);
  };
  return (
    <div className={cn('space-y-3', !latest && 'opacity-70')}>
      <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
        <span>{text.t('flow.run', { at: text.dateTime(run.startedAt) })}</span>
        <StatusBadge lifecycle='approvalRun' state={run.status} />
        {run.version > 1 ? (
          <span>{text.t('flow.ruleVersion', { version: run.version })}</span>
        ) : null}
      </div>
      <ol className='space-y-3 border-l'>
        {view.stages.map((stage) => {
          const tasks = current(stage.key);
          return (
            <li key={stage.key} className='relative pl-4'>
              {/* The positioning origin is inside the 1px timeline border. */}
              <span
                className={cn(
                  'absolute top-0.5 -left-[0.5px] inline-flex size-5 -translate-x-1/2 items-center justify-center rounded-full border bg-background',
                  stage.state === 'done' &&
                    'border-emerald-500 text-emerald-600',
                  stage.state === 'current' && 'border-primary text-primary',
                  stage.state === 'skipped' && 'text-muted-foreground',
                )}
              >
                {STAGE_ICONS[stage.state]}
              </span>
              <div className='flex flex-wrap items-center gap-2'>
                <span
                  className={cn(
                    'text-sm font-medium',
                    stage.state === 'skipped' &&
                      'text-muted-foreground line-through',
                  )}
                >
                  {text.stage(stage.key, stage.title)}
                </span>
                {stage.state !== 'skipped' ? (
                  <span className='text-xs text-muted-foreground'>
                    {text.lookup([`policies.${stage.policy}`], stage.policy)}
                  </span>
                ) : null}
              </div>
              {stage.because ? (
                <div className='text-xs text-muted-foreground'>
                  {stage.because}
                </div>
              ) : null}
              {tasks.length ? (
                <ul className='mt-2 space-y-1.5'>
                  {tasks.map((task) => (
                    <TaskLine key={task.id} task={task} />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      {run.changes.length ? (
        <div className='rounded-lg bg-muted/40 p-3 text-xs'>
          <div className='mb-1 font-medium'>{text.t('flow.changes')}</div>
          <ul className='space-y-1'>
            {run.changes.map((change) => (
              <li key={`${change.taskId}:${change.at}`}>
                {text.name(change.actorId)} ·{' '}
                {Object.entries(change.values)
                  .map(
                    ([field, value]) =>
                      `${text.t(`fields.${field}`)}: ${JSON.stringify(value)}`,
                  )
                  .join(', ')}
                {change.reason ? ` — ${change.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.tasks.some((task) => task.kind === 'copy') ? (
        <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          {text.t('flow.copies')}
          {view.tasks
            .filter((task) => task.kind === 'copy')
            .map((task) => (
              <span key={task.id} className='inline-flex items-center gap-1'>
                <Person id={task.assigneeId} />
                <Pill
                  tone={task.status === 'completed' ? 'success' : 'neutral'}
                >
                  {text.t(
                    task.status === 'completed' ? 'flow.read' : 'flow.unread',
                  )}
                </Pill>
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/** Where a request stands: its approvals, its branches, or its copies. */
export function RequestFlow({
  runs,
  branches,
  acknowledgements,
  onOpen,
}: {
  readonly runs: readonly RunView[];
  readonly branches: readonly BranchView[];
  readonly acknowledgements: readonly Acknowledgement[];
  readonly onOpen: (lifecycle: string, id: string) => void;
}): ReactElement {
  const text = useText();
  if (branches.length)
    return (
      <div className='grid gap-2 sm:grid-cols-2'>
        {branches.map((branch) => (
          <button
            key={`${branch.key}:${branch.revision}:${branch.childId}`}
            type='button'
            onClick={() => onOpen(branch.childLifecycle, branch.childId)}
            className={cn(
              'flex items-start justify-between gap-2 rounded-lg border p-3 text-left hover:bg-muted',
              branch.status === 'superseded' && 'opacity-60',
            )}
          >
            <div className='min-w-0 space-y-1'>
              <div className='text-sm font-medium'>
                {text.stage(branch.key, branch.title)}
              </div>
              <div className='text-xs text-muted-foreground'>
                {text.t(`branchKind.${branch.kind}`)}
                {branch.required ? '' : ` · ${text.t('preview.optional')}`}
                {branch.status === 'superseded'
                  ? ` · ${text.t('flow.superseded')}`
                  : ''}
              </div>
              {branch.because ? (
                <div className='text-xs text-muted-foreground'>
                  {branch.because}
                </div>
              ) : null}
            </div>
            <span className='flex items-center gap-1'>
              <StatusBadge
                lifecycle={branch.childLifecycle}
                state={branch.childStatus}
              />
              <ChevronRight className='size-4 text-muted-foreground' />
            </span>
          </button>
        ))}
      </div>
    );
  if (acknowledgements.length)
    return (
      <ul className='space-y-2'>
        {acknowledgements.map((ack) => (
          <li key={ack.id} className='flex flex-wrap items-center gap-2'>
            <Person id={ack.recipientId} />
            <Pill
              tone={
                ack.status === 'confirmed'
                  ? 'success'
                  : ack.status === 'revoked'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {text.t(`ackStatus.${ack.status}`)}
            </Pill>
            {ack.comments.map((comment) => (
              <span
                key={comment.at}
                className='w-full pl-8 text-xs text-muted-foreground'
              >
                {text.name(comment.authorId)}: “{comment.text}”
              </span>
            ))}
          </li>
        ))}
      </ul>
    );
  if (!runs.length)
    return (
      <p className='text-sm text-muted-foreground'>{text.t('flow.noRun')}</p>
    );
  const ordered = [...runs].reverse();
  return (
    <div className='space-y-6'>
      {ordered.map((view, index) => (
        <Run key={view.run.id} view={view} latest={index === 0} />
      ))}
    </div>
  );
}
