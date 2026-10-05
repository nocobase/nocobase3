import { text as str } from '../../shared/text.js';
import { useState, type ReactElement } from 'react';
import type { TransitionEntry } from '@nocobase/lifecycle/react';

import type {
  ApprovalLogRow,
  ApprovalStageView,
} from '../../shared/approval-trail.js';
import { Button } from '../components/ui/button.js';
import { StatusBadge } from './content.js';
import { useCenterText, type CenterText } from './format.js';
import { Avatar } from './persona.js';

/** Transitions nobody needs to read about: bookkeeping between system steps. */
const QUIET: ReadonlySet<string> = new Set([
  'markDelivered',
  'branchSettled',
  'remind',
  'remindApprovers',
]);

function verb(
  text: CenterText,
  lifecycle: string,
  entry: TransitionEntry,
): string {
  if (entry.transition === '$create') return text.t('center.timeline.created');
  if (entry.transition === 'decide' && typeof entry.input.decision === 'string')
    return text.t(`center.timeline.decide.${entry.input.decision}`);
  if (
    entry.transition === 'decideLine' &&
    typeof entry.input.outcome === 'string'
  )
    return text.t(`center.timeline.decideLine.${entry.input.outcome}`, {
      line: str(entry.input.lineId),
    });
  const own = text.t(`center.timeline.${lifecycle}.${entry.transition}`, {
    defaultValue: '',
  });
  if (own && own !== `center.timeline.${lifecycle}.${entry.transition}`)
    return own;
  const common = text.t(`center.timeline.common.${entry.transition}`, {
    defaultValue: '',
  });
  if (common && common !== `center.timeline.common.${entry.transition}`)
    return common;
  return text.action(lifecycle, entry.transition);
}

/** The parts of an input a reader cares about, labelled. */
function details(text: CenterText, entry: TransitionEntry): string[] {
  const input = entry.input;
  const lines: string[] = [];
  const say = (key: string, value: unknown): void => {
    if (typeof value === 'string' && value.trim())
      lines.push(
        text.t(`center.timeline.detail.${key}`, { value: value.trim() }),
      );
  };
  for (const person of ['to', 'userId', 'expertId'] as const)
    if (typeof input[person] === 'string' && input[person])
      lines.push(
        text.t(`center.timeline.detail.${person}`, {
          value: text.name(String(input[person])),
        }),
      );
  if (typeof input.target === 'string' && input.target)
    lines.push(
      text.t('center.timeline.detail.target', {
        value:
          input.target === 'applicant'
            ? text.t('center.actions.form.applicant')
            : text.stage(input.target),
      }),
    );
  say('question', input.question);
  say('request', input.request);
  say('answer', input.answer);
  say('opinion', input.opinion);
  say('reason', input.reason);
  say('comment', input.comment);
  say('text', input.text);
  if (typeof input.amountCents === 'number' && entry.transition === 'consume')
    lines.push(
      text.t('center.timeline.detail.amount', {
        value: text.cents(input.amountCents),
      }),
    );
  if (typeof input.executeAt === 'string')
    lines.push(
      text.t('center.timeline.detail.executeAt', {
        value: text.dateTime(input.executeAt),
      }),
    );
  return lines;
}

/** Approval log kinds a reader learns nothing new from under their transition. */
const QUIET_STEPS: ReadonlySet<string> = new Set([
  'submitted',
  'revised',
  'stage.planned',
  'stage.note',
  'task.answered',
  'outcome',
]);

/**
 * What a transition did inside a staged approval, one line per step of its
 * handling log: who was given a to-do, whose to-do ended and why, which
 * stage concluded or started.
 */
function approvalSteps(
  text: CenterText,
  logs: readonly ApprovalLogRow[],
  stages: ReadonlyMap<string, ApprovalStageView>,
): { readonly id: string; readonly line: string }[] {
  const lines: { id: string; line: string }[] = [];
  for (const log of logs) {
    if (QUIET_STEPS.has(log.kind)) continue;
    // A decision is the transition itself, unless a delegate made it.
    if (log.kind === 'task.decided' && log.data?.onBehalf !== true) continue;
    const stage = log.stageId ? stages.get(log.stageId) : undefined;
    lines.push({
      id: log.id,
      line: text.t(`center.timeline.approval.${log.kind}`, {
        stage: stage ? text.stage(stage.key, stage.title) : '',
        name: text.name(log.userId ?? ''),
        actor: text.name(log.actorId ?? ''),
        from: text.name(str(log.data?.from)),
        reason: str(log.data?.reason) || (log.message ?? ''),
        message: log.message ?? '',
      }),
    });
  }
  return lines;
}

/** Who did what to a request, and when, oldest first. */
export function Timeline({
  lifecycle,
  entries,
  logs = [],
  stages = [],
}: {
  readonly lifecycle: string;
  readonly entries: readonly TransitionEntry[];
  /** A staged approval's handling log, joined to the transitions by id. */
  readonly logs?: readonly ApprovalLogRow[];
  readonly stages?: readonly ApprovalStageView[];
}): ReactElement {
  const text = useCenterText();
  const byStage = new Map(stages.map((stage) => [stage.id, stage]));
  const byTransition = new Map<string, ApprovalLogRow[]>();
  for (const log of logs)
    if (log.transitionId !== null)
      byTransition.set(log.transitionId, [
        ...(byTransition.get(log.transitionId) ?? []),
        log,
      ]);
  const [all, setAll] = useState(false);
  const visible = entries.filter((entry) => !QUIET.has(entry.transition));
  const shown = all ? visible : visible.slice(-8);
  if (!visible.length)
    return (
      <p className='text-sm text-muted-foreground'>
        {text.t('center.timeline.empty')}
      </p>
    );
  return (
    <div className='space-y-3'>
      {visible.length > shown.length ? (
        <Button variant='ghost' size='sm' onClick={() => setAll(true)}>
          {text.t('center.timeline.showAll', { count: visible.length })}
        </Button>
      ) : null}
      <ol className='space-y-4'>
        {shown.map((entry) => {
          const notes = details(text, entry);
          const steps = approvalSteps(
            text,
            byTransition.get(entry.id) ?? [],
            byStage,
          );
          return (
            <li key={entry.id} className='flex gap-3'>
              <Avatar id={entry.actorId} size='md' />
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
                  <span className='font-medium'>
                    {text.name(entry.actorId)}
                  </span>
                  <span>{verb(text, lifecycle, entry)}</span>
                  {entry.from !== entry.to ? (
                    <StatusBadge lifecycle={lifecycle} state={entry.to} />
                  ) : null}
                  <span
                    className='ml-auto text-xs text-muted-foreground'
                    title={text.dateTime(entry.at)}
                  >
                    {text.dateTime(entry.at)}
                  </span>
                </div>
                {notes.length ? (
                  <div className='mt-1 space-y-0.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground'>
                    {notes.map((note) => (
                      <p key={note} className='whitespace-pre-wrap'>
                        {note}
                      </p>
                    ))}
                  </div>
                ) : null}
                {steps.length ? (
                  <ul className='mt-1 space-y-0.5 border-l-2 pl-2.5 text-xs text-muted-foreground'>
                    {steps.map((step) => (
                      <li key={step.id}>{step.line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
