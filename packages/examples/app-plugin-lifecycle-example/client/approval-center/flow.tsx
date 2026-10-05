import { text as str } from '../../shared/text.js';
import type { ReactElement, ReactNode } from 'react';
import type { LifecycleRecord } from '@nocobase/lifecycle';
import {
  Check,
  ChevronRight,
  CircleDashed,
  Clock,
  GitFork,
  Minus,
  X,
} from 'lucide-react';

import type { CenterRecord } from '../../shared/approval-center.js';
import {
  assigneeTasks,
  candidatesOf,
  claimantOf,
  type ApprovalStageView,
  type ApprovalTaskRow,
  type ApprovalTrail,
  type StageStatus,
} from '../../shared/approval-trail.js';
import { cn } from '../lib/utils.js';
import { StatusBadge } from './content.js';
import { useCenterText, type CenterText } from './format.js';
import { Avatar, Person } from './persona.js';

export type StepStatus = 'done' | 'active' | 'rejected' | 'pending' | 'skipped';

const STEP_ICONS: Readonly<Record<StepStatus, ReactElement>> = {
  done: <Check className='size-3.5' />,
  active: <Clock className='size-3.5' />,
  rejected: <X className='size-3.5' />,
  pending: <CircleDashed className='size-3.5' />,
  skipped: <Minus className='size-3.5' />,
};

const STEP_COLORS: Readonly<Record<StepStatus, string>> = {
  done: 'bg-emerald-500 text-white',
  active: 'bg-amber-500 text-white ring-4 ring-amber-500/20',
  rejected: 'bg-destructive text-white',
  pending: 'bg-muted text-muted-foreground',
  skipped: 'bg-muted text-muted-foreground',
};

/** One node of a vertical flow: an icon on the rail and what happens there. */
export function Step({
  status,
  title,
  aside,
  children,
  last = false,
}: {
  readonly status: StepStatus;
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly children?: ReactNode;
  readonly last?: boolean;
}): ReactElement {
  return (
    <li className='relative flex gap-3 pb-5 last:pb-0'>
      {!last ? (
        <span
          aria-hidden='true'
          className={cn(
            'absolute top-7 bottom-1 left-3 w-px',
            status === 'done' ? 'bg-emerald-500/50' : 'bg-border',
          )}
        />
      ) : null}
      <span
        className={cn(
          'relative z-10 mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full',
          STEP_COLORS[status],
        )}
      >
        {STEP_ICONS[status]}
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
          <div
            className={cn(
              'text-sm font-medium',
              status === 'pending' && 'text-muted-foreground',
              status === 'skipped' && 'text-muted-foreground line-through',
            )}
          >
            {title}
          </div>
          {aside ? (
            <div className='text-xs text-muted-foreground'>{aside}</div>
          ) : null}
        </div>
        {children ? <div className='mt-1.5 space-y-1.5'>{children}</div> : null}
      </div>
    </li>
  );
}

/** A person's part in a step: who, what they decided and what they said. */
export function Decision({
  person,
  result,
  comment,
  at,
  note,
}: {
  readonly person: string;
  readonly result:
    'approve' | 'reject' | 'abstain' | 'waiting' | 'claimed' | null;
  readonly comment?: string | null;
  readonly at?: string | null;
  readonly note?: ReactNode;
}): ReactElement {
  const text = useCenterText();
  const tone =
    result === 'approve'
      ? 'text-emerald-700 dark:text-emerald-400'
      : result === 'reject'
        ? 'text-destructive'
        : result === 'waiting'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-muted-foreground';
  return (
    <div className='rounded-lg bg-muted/40 px-2.5 py-1.5'>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <Person id={person} />
        {result ? (
          <span className={cn('text-xs font-medium', tone)}>
            {text.t(`center.decision.${result}`)}
          </span>
        ) : null}
        {note ? (
          <span className='text-xs text-muted-foreground'>{note}</span>
        ) : null}
        {at ? (
          <span className='ml-auto text-xs text-muted-foreground'>
            {text.dateTime(at)}
          </span>
        ) : null}
      </div>
      {comment ? (
        <p className='mt-1 border-l-2 pl-2 text-xs whitespace-pre-wrap text-muted-foreground'>
          {comment}
        </p>
      ) : null}
    </div>
  );
}

function ruleLabel(
  text: CenterText,
  stage: ApprovalStageView,
  people: number,
): string {
  const { rule } = stage;
  if (rule.kind === 'all')
    return people > 1
      ? text.t(
          rule.onReject === 'collect'
            ? 'center.rules.allCollect'
            : 'center.rules.all',
        )
      : '';
  if (rule.kind === 'threshold')
    return text.t('center.rules.thresholdVeto', {
      min: rule.min,
      vetoers: text.names(rule.vetoers),
    });
  return text.t(`center.rules.${rule.kind}`);
}

const STAGE_STATUS: Readonly<Record<StageStatus, StepStatus>> = {
  pending: 'pending',
  active: 'active',
  approved: 'done',
  rejected: 'rejected',
  skipped: 'skipped',
  cancelled: 'skipped',
  superseded: 'skipped',
};

/** What a person's task says about their part in the stage. */
function taskResult(
  task: ApprovalTaskRow,
  stage: ApprovalStageView,
): 'approve' | 'reject' | 'abstain' | 'waiting' | null {
  if (task.status === 'completed' && task.decision) return task.decision;
  return stage.status === 'active' &&
    (task.status === 'pending' || task.status === 'claimed')
    ? 'waiting'
    : null;
}

function ApprovalFlow({
  record,
  state,
  trail,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
  readonly trail: ApprovalTrail | null;
}): ReactElement {
  const text = useCenterText();
  const stages = trail?.stages ?? [];
  const submission = trail?.submission ?? null;
  const materials = trail?.materials ?? [];
  const outcomeAt =
    typeof record.outcomeAt === 'string' ? record.outcomeAt : null;
  const applicant = str(record.applicantId);
  const submittedBy =
    typeof record.submittedBy === 'string' ? record.submittedBy : null;
  const endStatus: StepStatus =
    state === 'approved'
      ? 'done'
      : state === 'rejected' || state === 'cancelled'
        ? 'rejected'
        : 'pending';
  return (
    <ol>
      <Step
        status={state === 'draft' ? 'active' : 'done'}
        title={text.t(
          state === 'draft' ? 'center.flow.drafting' : 'center.flow.submitted',
        )}
        aside={submission?.at ? text.dateTime(submission.at) : undefined}
      >
        <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <Person id={applicant} withTitle />
          {submittedBy && submittedBy !== applicant ? (
            <span>
              {text.t('center.flow.submittedBy', {
                name: text.name(submittedBy),
              })}
            </span>
          ) : null}
          {Number(record.round ?? 0) > 1 ? (
            <span>{text.t('center.flow.round', { round: record.round })}</span>
          ) : null}
        </div>
      </Step>
      {stages.map((stage) => {
        const pooled = stage.rule.kind === 'claim';
        const claimant = claimantOf(stage);
        const holders = assigneeTasks(stage);
        const rule = ruleLabel(
          text,
          stage,
          pooled ? candidatesOf(stage).length : holders.length,
        );
        return (
          <Step
            key={stage.id}
            status={STAGE_STATUS[stage.status]}
            title={text.stage(stage.key, stage.title)}
            aside={
              stage.status === 'skipped'
                ? text.t('center.flow.skipped')
                : rule || undefined
            }
          >
            {pooled && stage.status === 'active' && !claimant ? (
              <p className='text-xs text-muted-foreground'>
                {text.t('center.flow.pool', {
                  names: text.names(candidatesOf(stage)),
                })}
              </p>
            ) : null}
            {stage.status !== 'pending' || holders.length ? (
              holders.map((task) => (
                <Decision
                  key={task.id}
                  person={task.assigneeId}
                  result={taskResult(task, stage)}
                  comment={task.comment}
                  at={task.status === 'completed' ? task.closedAt : null}
                  note={
                    task.actorId !== null && task.actorId !== task.assigneeId
                      ? text.t('center.flow.onBehalf', {
                          name: text.name(task.actorId),
                        })
                      : task.via !== 'plan'
                        ? text.t(`center.flow.via.${task.via}`)
                        : pooled && task.claimedAt !== null
                          ? text.t('center.flow.via.claimed')
                          : undefined
                  }
                />
              ))
            ) : (
              <p className='text-xs text-muted-foreground'>
                {text.t('center.flow.decidedLater')}
              </p>
            )}
            {stage.consultations.map((item) => (
              <div
                key={item.id}
                className='rounded-lg border border-dashed px-2.5 py-1.5 text-xs'
              >
                <div className='text-muted-foreground'>
                  {text.t('center.flow.consulted', {
                    asker: text.name(item.requestedBy ?? ''),
                    expert: text.name(item.assigneeId),
                  })}
                </div>
                <p className='mt-0.5'>“{item.prompt}”</p>
                <p
                  className={cn(
                    'mt-1',
                    item.status !== 'completed' &&
                      'text-amber-700 dark:text-amber-400',
                  )}
                >
                  {item.status === 'completed'
                    ? `${text.name(item.assigneeId)}：${item.comment ?? ''}`
                    : item.status === 'voided'
                      ? (item.closeReason ?? '')
                      : text.t('center.flow.awaitingOpinion')}
                </p>
              </div>
            ))}
          </Step>
        );
      })}
      {materials.length ? (
        <Step
          status={
            materials.every((item) => item.status !== 'pending')
              ? 'done'
              : 'active'
          }
          title={text.t('center.flow.materials')}
        >
          {materials.map((item) => (
            <div
              key={item.id}
              className='rounded-lg border border-dashed px-2.5 py-1.5 text-xs'
            >
              <div className='text-muted-foreground'>
                {text.t('center.flow.materialsAsked', {
                  name: text.name(item.requestedBy ?? ''),
                })}
              </div>
              <p className='mt-0.5'>“{item.prompt}”</p>
              <p
                className={cn(
                  'mt-1',
                  item.status === 'pending' &&
                    'text-amber-700 dark:text-amber-400',
                )}
              >
                {item.status === 'completed'
                  ? item.comment
                  : item.status === 'voided'
                    ? item.closeReason
                    : text.t('center.flow.awaitingMaterials')}
              </p>
            </div>
          ))}
        </Step>
      ) : null}
      <Step
        last
        status={endStatus}
        title={
          outcomeAt
            ? text.t(`center.flow.outcome.${state}`)
            : text.t('center.flow.end')
        }
        aside={outcomeAt ? text.dateTime(outcomeAt) : undefined}
      />
    </ol>
  );
}

function LeaveFlow({
  record,
  state,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
}): ReactElement {
  const text = useCenterText();
  const decided = state !== 'draft' && state !== 'pending';
  return (
    <ol>
      <Step
        status={state === 'draft' ? 'active' : 'done'}
        title={text.t('center.flow.submitted')}
      >
        <Person id={str(record.applicantId)} withTitle />
      </Step>
      <Step
        status={
          state === 'pending'
            ? 'active'
            : state === 'rejected'
              ? 'rejected'
              : decided
                ? 'done'
                : 'pending'
        }
        title={text.stage('manager')}
      >
        {record.approverId ? (
          <Decision
            person={str(record.approverId)}
            result={
              state === 'pending'
                ? 'waiting'
                : state === 'rejected'
                  ? 'reject'
                  : decided
                    ? 'approve'
                    : null
            }
            comment={
              typeof record.decisionComment === 'string'
                ? record.decisionComment
                : null
            }
          />
        ) : null}
      </Step>
      <Step
        last
        status={
          state === 'registered'
            ? 'done'
            : state === 'registrationFailed'
              ? 'rejected'
              : state === 'approved'
                ? 'active'
                : 'pending'
        }
        title={text.t('center.flowSteps.registration')}
      />
    </ol>
  );
}

/** A child record a coordinated request waits for, opened in place. */
function BranchCard({
  title,
  required,
  child,
  lifecycle,
  state,
  onOpen,
}: {
  readonly title: string;
  readonly required: boolean;
  readonly child: CenterRecord | undefined;
  readonly lifecycle: string;
  readonly state: string | null;
  readonly onOpen: () => void;
}): ReactElement {
  const text = useCenterText();
  return (
    <button
      type='button'
      onClick={onOpen}
      className='group flex w-full flex-col gap-2 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40'
    >
      <div className='flex w-full items-center justify-between gap-2'>
        <span className='text-sm font-medium'>{title}</span>
        <ChevronRight className='size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5' />
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {state ? <StatusBadge lifecycle={lifecycle} state={state} /> : null}
        {!required ? (
          <span className='text-xs text-muted-foreground'>
            {text.t('center.flow.optional')}
          </span>
        ) : null}
      </div>
      {child?.handlers.length ? (
        <div className='flex items-center gap-1 text-xs text-muted-foreground'>
          {child.handlers.slice(0, 3).map((id) => (
            <Avatar key={id} id={id} size='sm' />
          ))}
          <span>
            {text.t('center.flow.waitingFor', {
              names: text.names(child.handlers),
            })}
          </span>
        </div>
      ) : null}
      {typeof child?.facts.stepsTotal === 'number' ? (
        <Progress
          done={Number(child.facts.stepsDone)}
          total={child.facts.stepsTotal}
        />
      ) : typeof child?.facts.stagesTotal === 'number' &&
        child.facts.stagesTotal > 0 ? (
        <Progress
          done={Number(child.facts.stagesDone)}
          total={child.facts.stagesTotal}
        />
      ) : null}
    </button>
  );
}

export function Progress({
  done,
  total,
}: {
  readonly done: number;
  readonly total: number;
}): ReactElement {
  const percent =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className='flex w-full items-center gap-2'>
      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-muted'>
        <div
          className='h-full rounded-full bg-emerald-500'
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className='text-xs text-muted-foreground tabular-nums'>
        {done}/{total}
      </span>
    </div>
  );
}

function CoordinationFlow({
  record,
  state,
  records,
  onOpen,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
  readonly records: readonly CenterRecord[];
  readonly onOpen: (lifecycle: string, id: string) => void;
}): ReactElement {
  const text = useCenterText();
  const branches = (record.branches ?? []) as readonly {
    key: string;
    title: string;
    required: boolean;
    lifecycle: string;
    id: string;
    state: string | null;
  }[];
  const outcome = record.outcome as { result: string; at: string } | null;
  return (
    <ol>
      <Step
        status={state === 'draft' ? 'active' : 'done'}
        title={text.t('center.flow.submitted')}
      >
        <Person id={str(record.applicantId)} withTitle />
      </Step>
      <Step
        status={
          state === 'draft'
            ? 'pending'
            : state === 'running'
              ? 'active'
              : state === 'completed'
                ? 'done'
                : 'rejected'
        }
        title={
          <span className='inline-flex items-center gap-1.5'>
            <GitFork className='size-4' />
            {text.t('center.flow.parallelBranches', { count: branches.length })}
          </span>
        }
      >
        {branches.length ? (
          <div className='grid gap-2 sm:grid-cols-2'>
            {branches.map((branch) => {
              const child = records.find(
                (item) =>
                  item.lifecycle === branch.lifecycle && item.id === branch.id,
              );
              return (
                <BranchCard
                  key={branch.key}
                  title={text.stage(branch.key, branch.title)}
                  required={branch.required}
                  child={child}
                  lifecycle={branch.lifecycle}
                  state={child?.status ?? branch.state}
                  onOpen={() => onOpen(branch.lifecycle, branch.id)}
                />
              );
            })}
          </div>
        ) : (
          <p className='text-xs text-muted-foreground'>
            {text.t('center.flow.branchesOnStart')}
          </p>
        )}
      </Step>
      <Step
        last
        status={
          state === 'completed'
            ? 'done'
            : state === 'failed' || state === 'cancelled'
              ? 'rejected'
              : 'pending'
        }
        title={
          outcome
            ? text.t(`center.flow.outcome.${outcome.result}`)
            : text.t('center.flow.end')
        }
        aside={outcome ? text.dateTime(outcome.at) : undefined}
      />
    </ol>
  );
}

function WorkItemFlow({
  record,
}: {
  readonly record: LifecycleRecord;
}): ReactElement {
  const text = useCenterText();
  const steps = (record.steps ?? []) as readonly {
    key: string;
    title: string;
    status: string;
    at: string | null;
    error: string | null;
  }[];
  const map: Readonly<Record<string, StepStatus>> = {
    done: 'done',
    running: 'active',
    failed: 'rejected',
    pending: 'pending',
    rolledBack: 'skipped',
  };
  return (
    <ol>
      {steps.map((step, index) => (
        <Step
          key={step.key}
          last={index === steps.length - 1}
          status={map[step.status] ?? 'pending'}
          title={text.stage(step.key, step.title)}
          aside={
            step.at
              ? text.dateTime(step.at)
              : text.t(`center.flow.stepStatus.${step.status}`)
          }
        >
          {step.error ? (
            <p className='rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive'>
              {text.t('center.flow.stepFailed')}
            </p>
          ) : null}
        </Step>
      ))}
    </ol>
  );
}

function ReimbursementFlow({
  record,
  state,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
}): ReactElement {
  const text = useCenterText();
  const lines = (record.lines ?? []) as readonly {
    id: string;
    category: string;
    description: string;
    amountCents: number;
    approverId: string | null;
    decision: {
      outcome: string;
      by: string;
      at: string;
      approvedCents?: number;
      comment?: string;
    } | null;
  }[];
  const submitted = state !== 'draft';
  const reviewing = state === 'inReview' || state === 'returned';
  const paid = state === 'paid';
  return (
    <ol>
      <Step
        status={submitted ? 'done' : 'active'}
        title={text.t('center.flow.submitted')}
      >
        <Person id={str(record.applicantId)} withTitle />
      </Step>
      <Step
        status={
          state === 'rejected'
            ? 'rejected'
            : reviewing
              ? 'active'
              : submitted
                ? 'done'
                : 'pending'
        }
        title={text.t('center.flowSteps.lineReview')}
        aside={text.t('center.rules.byLine')}
      >
        <div className='overflow-hidden rounded-lg border'>
          <table className='w-full text-xs'>
            <thead className='bg-muted/50 text-muted-foreground'>
              <tr>
                <th className='px-2 py-1.5 text-left font-normal'>
                  {text.t('center.fields.description')}
                </th>
                <th className='px-2 py-1.5 text-right font-normal'>
                  {text.t('center.fields.amountCents')}
                </th>
                <th className='px-2 py-1.5 text-left font-normal'>
                  {text.t('center.fields.approver')}
                </th>
                <th className='px-2 py-1.5 text-left font-normal'>
                  {text.t('center.fields.result')}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className='border-t align-top'>
                  <td className='px-2 py-1.5'>
                    <div>{line.description || '—'}</div>
                    <div className='text-muted-foreground'>
                      {text.option('expenseCategory', line.category)}
                    </div>
                  </td>
                  <td className='px-2 py-1.5 text-right tabular-nums'>
                    {text.cents(line.amountCents)}
                  </td>
                  <td className='px-2 py-1.5'>
                    {line.approverId ? text.name(line.approverId) : '—'}
                  </td>
                  <td className='px-2 py-1.5'>
                    {line.decision ? (
                      <span
                        className={cn(
                          line.decision.outcome === 'approved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-destructive',
                        )}
                      >
                        {text.t(`center.lineOutcome.${line.decision.outcome}`)}
                        {line.decision.outcome === 'approved' &&
                        typeof line.decision.approvedCents === 'number' &&
                        line.decision.approvedCents !== line.amountCents
                          ? ` · ${text.cents(line.decision.approvedCents)}`
                          : ''}
                        {line.decision.comment ? (
                          <span className='block text-muted-foreground'>
                            {line.decision.comment}
                          </span>
                        ) : null}
                      </span>
                    ) : submitted ? (
                      <span className='text-amber-700 dark:text-amber-400'>
                        {text.t('center.decision.waiting')}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Step>
      <Step
        last
        status={
          paid
            ? 'done'
            : state === 'paymentFailed'
              ? 'rejected'
              : state === 'approved' || state === 'partiallyApproved'
                ? 'active'
                : 'pending'
        }
        title={text.t('center.flowSteps.payment')}
        aside={
          typeof record.approvedTotalCents === 'number'
            ? text.t('center.flow.approvedTotal', {
                amount: text.cents(record.approvedTotalCents),
              })
            : undefined
        }
      />
    </ol>
  );
}

function PaymentFlow({
  record,
  state,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
}): ReactElement {
  const text = useCenterText();
  const approved = typeof record.approvedAt === 'string';
  const installments = Math.max(1, Number(record.installments ?? 1));
  const paidCount = Number(record.installmentsPaid ?? 0);
  return (
    <ol>
      <Step
        status={state === 'draft' ? 'active' : 'done'}
        title={text.t('center.flow.submitted')}
      >
        <Person id={str(record.applicantId)} withTitle />
      </Step>
      <Step
        status={
          state === 'pendingApproval'
            ? 'active'
            : state === 'rejected'
              ? 'rejected'
              : approved
                ? 'done'
                : 'pending'
        }
        title={text.t('center.flowSteps.financeApproval')}
        aside={approved ? text.dateTime(record.approvedAt) : undefined}
      >
        {record.approverId ? (
          <Decision
            person={str(record.approvedBy ?? record.approverId)}
            result={
              approved
                ? 'approve'
                : state === 'rejected'
                  ? 'reject'
                  : state === 'pendingApproval'
                    ? 'waiting'
                    : null
            }
          />
        ) : null}
      </Step>
      <Step
        last
        status={
          state === 'executed'
            ? 'done'
            : state === 'executionFailed' || state === 'terminated'
              ? 'rejected'
              : ['approved', 'executing', 'reconciling'].includes(state)
                ? 'active'
                : 'pending'
        }
        title={text.t('center.flowSteps.treasurerPayment')}
        aside={
          record.executeAt
            ? text.t('center.flow.scheduledAt', {
                at: text.dateTime(record.executeAt),
              })
            : undefined
        }
      >
        {approved ? (
          <>
            <Progress done={paidCount} total={installments} />
            <p className='text-xs text-muted-foreground'>
              {text.t('center.flow.paidOf', {
                paid: text.cents(Number(record.paidCents ?? 0)),
                total: text.cents(Number(record.amountCents ?? 0)),
              })}
            </p>
          </>
        ) : null}
        {state === 'executionFailed' && record.failureKind ? (
          <p className='rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive'>
            {text.t(`center.flow.failure.${str(record.failureKind)}`)}
          </p>
        ) : null}
        {state === 'reconciling' ? (
          <p className='text-xs text-muted-foreground'>
            {text.t('center.flow.reconciling')}
          </p>
        ) : null}
      </Step>
    </ol>
  );
}

function AuthorizationFlow({
  record,
  state,
  onOpen,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
  readonly onOpen: (lifecycle: string, id: string) => void;
}): ReactElement {
  const text = useCenterText();
  const approved = record.approved as { limitCents?: number } | null;
  return (
    <ol>
      <Step
        status={state === 'draft' ? 'active' : 'done'}
        title={text.t('center.flow.submitted')}
      >
        <Person id={str(record.applicantId)} withTitle />
      </Step>
      <Step
        status={
          state === 'pending'
            ? 'active'
            : state === 'rejected'
              ? 'rejected'
              : state === 'approved'
                ? 'done'
                : 'pending'
        }
        title={text.t('center.flowSteps.contractApproval')}
      >
        {record.approverId ? (
          <Decision
            person={str(record.approverId)}
            result={
              state === 'approved'
                ? 'approve'
                : state === 'rejected'
                  ? 'reject'
                  : state === 'pending'
                    ? 'waiting'
                    : null
            }
            note={
              approved?.limitCents !== undefined
                ? text.t('center.flow.approvedLimit', {
                    amount: text.cents(approved.limitCents),
                  })
                : undefined
            }
          />
        ) : null}
      </Step>
      <Step
        last
        status={record.grantId ? 'done' : 'pending'}
        title={text.t('center.flowSteps.grantActive')}
      >
        {record.grantId ? (
          <button
            type='button'
            className='inline-flex items-center gap-1 text-xs text-primary hover:underline'
            onClick={() => onOpen('budgetGrants', str(record.grantId))}
          >
            {text.t('center.flow.openGrant')}
            <ChevronRight className='size-3' />
          </button>
        ) : null}
      </Step>
    </ol>
  );
}

function GrantFlow({
  record,
}: {
  readonly record: LifecycleRecord;
}): ReactElement {
  const text = useCenterText();
  const usages = (record.usages ?? []) as readonly {
    key: string;
    amountCents: number;
    by: string;
    at: string;
  }[];
  const limit =
    typeof record.limitCents === 'number' ? record.limitCents : null;
  return (
    <div className='space-y-4'>
      {limit !== null ? (
        <div className='space-y-1.5'>
          <div className='flex justify-between text-xs text-muted-foreground'>
            <span>
              {text.t('center.flow.used', {
                amount: text.cents(Number(record.usedCents ?? 0)),
              })}
            </span>
            <span>
              {text.t('center.flow.limit', { amount: text.cents(limit) })}
            </span>
          </div>
          <Progress done={Number(record.usedCents ?? 0)} total={limit} />
        </div>
      ) : null}
      <p className='text-xs text-muted-foreground'>
        {text.t('center.flow.uses', {
          uses: record.uses ?? 0,
          max: record.maxUses ?? '∞',
          until: text.date(record.validUntil),
        })}
      </p>
      <ol>
        {usages.map((usage, index) => (
          <Step
            key={usage.key}
            last={index === usages.length - 1}
            status='done'
            title={text.cents(usage.amountCents)}
            aside={text.dateTime(usage.at)}
          >
            <Person id={usage.by} />
          </Step>
        ))}
      </ol>
    </div>
  );
}

const SUPPLIER_STEPS = [
  'legalReview',
  'registryCheck',
  'riskReview',
  'deposit',
  'account',
] as const;

function supplierStep(state: string): number {
  switch (state) {
    case 'legalReview':
      return 0;
    case 'verifying':
    case 'manualVerification':
      return 1;
    case 'riskReview':
    case 'riskReviewOverdue':
      return 2;
    case 'awaitingDeposit':
      return 3;
    case 'creatingAccount':
    case 'accountFailed':
      return 4;
    case 'active':
      return 5;
    default:
      return -1;
  }
}

function SupplierFlow({
  record,
  state,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
}): ReactElement {
  const text = useCenterText();
  const current = supplierStep(state);
  const highRisk = record.riskLevel === 'high';
  const ended = ['rejected', 'withdrawn', 'cancelled'].includes(state);
  // Where an ended onboarding stopped: the last step with a recorded fact.
  const stoppedAt = record.legalApprovedAt ? (record.riskLevel ? 2 : 1) : 0;
  return (
    <ol>
      <Step status='done' title={text.t('center.flowSteps.submit')}>
        <Person id={str(record.applicantId)} withTitle />
      </Step>
      {SUPPLIER_STEPS.map((step, index) => {
        const skipped =
          (step === 'riskReview' && record.riskLevel === 'low') ||
          (step === 'deposit' && record.riskLevel === 'low' && current > 3);
        let status: StepStatus =
          index < current ? 'done' : index === current ? 'active' : 'pending';
        if (skipped) status = 'skipped';
        if (state === 'accountFailed' && index === 4) status = 'rejected';
        if (ended)
          status =
            index < stoppedAt
              ? 'done'
              : index === stoppedAt
                ? 'rejected'
                : 'pending';
        if (state === 'active') status = skipped ? 'skipped' : 'done';
        let detail: ReactNode = null;
        if (step === 'legalReview' && record.legalApprovedBy)
          detail = (
            <Decision
              person={str(record.legalApprovedBy)}
              result='approve'
              at={record.legalApprovedAt as string}
            />
          );
        if (step === 'registryCheck' && record.riskLevel)
          detail = (
            <p className='text-xs text-muted-foreground'>
              {text.t('center.flow.riskResult', {
                level: text.option('risk', record.riskLevel),
              })}
            </p>
          );
        if (step === 'registryCheck' && state === 'manualVerification')
          detail = (
            <p className='text-xs text-amber-700 dark:text-amber-400'>
              {text.t('center.flow.registryDown')}
            </p>
          );
        if (step === 'riskReview' && record.riskReviewerId && highRisk)
          detail = (
            <Decision
              person={str(record.riskReviewerId)}
              result={
                current > 2
                  ? 'approve'
                  : state === 'rejected'
                    ? 'reject'
                    : current === 2
                      ? 'waiting'
                      : null
              }
            />
          );
        if (step === 'deposit' && record.depositRef)
          detail = (
            <p className='text-xs text-muted-foreground'>
              {text.t('center.flow.depositPaid', {
                amount: text.cents(Number(record.depositCents ?? 0)),
              })}
            </p>
          );
        if (step === 'account' && record.account)
          detail = (
            <p className='text-xs text-muted-foreground'>
              {text.t('center.flow.accountNo', {
                account: str(record.account),
              })}
            </p>
          );
        return (
          <Step
            key={step}
            status={status}
            title={text.t(`center.flowSteps.${step}`)}
            aside={skipped ? text.t('center.flow.notNeeded') : undefined}
          >
            {detail}
          </Step>
        );
      })}
      <Step
        last
        status={state === 'active' ? 'done' : ended ? 'rejected' : 'pending'}
        title={text.t(
          ended ? `center.flow.outcome.${state}` : 'center.flowSteps.admitted',
        )}
      />
    </ol>
  );
}

function NoticeFlow({
  record,
  state,
  records,
  onOpen,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
  readonly records: readonly CenterRecord[];
  readonly onOpen: (lifecycle: string, id: string) => void;
}): ReactElement {
  const text = useCenterText();
  const copies = records.filter(
    (item) =>
      item.lifecycle === 'acknowledgements' &&
      item.parent?.lifecycle === 'notices' &&
      item.parent.id === str(record.id),
  );
  const recipients = (record.recipientIds ?? []) as readonly string[];
  return (
    <ol>
      <Step
        status={state === 'draft' ? 'active' : 'done'}
        title={text.t(
          state === 'draft'
            ? 'center.flow.drafting'
            : 'center.flowSteps.publish',
        )}
        aside={
          record.publishedAt ? text.dateTime(record.publishedAt) : undefined
        }
      >
        <Person id={str(record.publisherId)} withTitle />
      </Step>
      <Step
        status={
          state === 'collecting'
            ? 'active'
            : state === 'effective'
              ? 'done'
              : state === 'withdrawn'
                ? 'rejected'
                : 'pending'
        }
        title={text.t(
          record.mode === 'confirmAll'
            ? 'center.flowSteps.confirmation'
            : 'center.flowSteps.delivery',
        )}
        aside={text.t(`center.options.noticeMode.${str(record.mode)}`)}
      >
        <div className='grid gap-1.5 sm:grid-cols-2'>
          {recipients.map((person) => {
            const copy = copies.find((item) => item.applicantId === person);
            return (
              <button
                type='button'
                key={person}
                disabled={!copy}
                onClick={() => copy && onOpen(copy.lifecycle, copy.id)}
                className='flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-left hover:bg-muted disabled:hover:bg-muted/40'
              >
                <Person id={person} />
                {copy ? (
                  <StatusBadge
                    lifecycle='acknowledgements'
                    state={copy.status}
                  />
                ) : (
                  <span className='text-xs text-muted-foreground'>
                    {text.t('center.flow.delivering')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Step>
      <Step
        last
        status={
          state === 'effective'
            ? 'done'
            : state === 'withdrawn'
              ? 'rejected'
              : 'pending'
        }
        title={text.t(
          state === 'withdrawn'
            ? 'center.flow.outcome.withdrawn'
            : 'center.flowSteps.effective',
        )}
        aside={
          record.effectiveAt ? text.dateTime(record.effectiveAt) : undefined
        }
      />
    </ol>
  );
}

function AcknowledgementFlow({
  record,
  state,
}: {
  readonly record: LifecycleRecord;
  readonly state: string;
}): ReactElement {
  const text = useCenterText();
  const comments = (record.comments ?? []) as readonly {
    authorId: string;
    text: string;
    at: string;
  }[];
  const read = ['read', 'confirmed'].includes(state);
  return (
    <ol>
      <Step
        status='done'
        title={text.t('center.flow.delivered')}
        aside={
          record.deliveredAt ? text.dateTime(record.deliveredAt) : undefined
        }
      >
        <Person id={str(record.recipientId)} withTitle />
      </Step>
      <Step
        status={read ? 'done' : state === 'revoked' ? 'skipped' : 'active'}
        title={text.t('center.flow.read')}
        aside={record.readAt ? text.dateTime(record.readAt) : undefined}
      />
      <Step
        last
        status={
          state === 'confirmed'
            ? 'done'
            : state === 'revoked'
              ? 'rejected'
              : 'pending'
        }
        title={text.t(
          state === 'revoked'
            ? 'center.flow.outcome.revoked'
            : 'center.flow.confirmed',
        )}
        aside={
          record.confirmedAt ? text.dateTime(record.confirmedAt) : undefined
        }
      >
        {comments.map((comment) => (
          <Decision
            key={`${comment.authorId}:${comment.at}`}
            person={comment.authorId}
            result={null}
            comment={comment.text}
            at={comment.at}
          />
        ))}
      </Step>
    </ol>
  );
}

/** The flow of any request the center shows, drawn for its kind. */
export function RequestFlow({
  lifecycle,
  record,
  state,
  records,
  trail = null,
  onOpen,
}: {
  readonly lifecycle: string;
  readonly record: LifecycleRecord;
  readonly state: string;
  readonly records: readonly CenterRecord[];
  /** A staged approval's stages and to-dos. */
  readonly trail?: ApprovalTrail | null;
  readonly onOpen: (lifecycle: string, id: string) => void;
}): ReactElement | null {
  switch (lifecycle) {
    case 'approvalRequests':
      return <ApprovalFlow record={record} state={state} trail={trail} />;
    case 'leaveRequests':
      return <LeaveFlow record={record} state={state} />;
    case 'coordinations':
      return (
        <CoordinationFlow
          record={record}
          state={state}
          records={records}
          onOpen={onOpen}
        />
      );
    case 'workItems':
      return <WorkItemFlow record={record} />;
    case 'reimbursements':
      return <ReimbursementFlow record={record} state={state} />;
    case 'paymentRequests':
      return <PaymentFlow record={record} state={state} />;
    case 'authorizationRequests':
      return (
        <AuthorizationFlow record={record} state={state} onOpen={onOpen} />
      );
    case 'budgetGrants':
      return <GrantFlow record={record} />;
    case 'supplierOnboardings':
      return <SupplierFlow record={record} state={state} />;
    case 'notices':
      return (
        <NoticeFlow
          record={record}
          state={state}
          records={records}
          onOpen={onOpen}
        />
      );
    case 'acknowledgements':
      return <AcknowledgementFlow record={record} state={state} />;
    default:
      return null;
  }
}
