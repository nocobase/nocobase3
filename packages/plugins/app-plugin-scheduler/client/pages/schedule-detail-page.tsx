import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, CalendarClock, CircleAlert } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { DateTimeValue } from './date-time-value.js';
import { formatClientDateTime, formatClientDuration } from './date-time.js';
import { formatCronDescription } from './cron-description.js';
import { ScheduleSwitch } from './schedule-switch.js';

const SCHEDULER_NS = '@nocobase/app-plugin-scheduler';
type TargetState = 'ready' | 'disabled' | 'missing' | 'invalid';
type ViewStatus = 'active' | 'paused' | 'inactive' | 'targetIssue';
type Translate = (
  key: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

interface ScheduleItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: TargetState;
  readonly runCount: number;
  readonly lastRunAt?: string;
  readonly nextRunAt?: string;
  readonly targetType: string;
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
    readonly state?: TargetState;
  };
}

interface OccurrenceItem {
  readonly id: string;
  readonly status: string;
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly target?: { readonly href?: string };
}

function viewStatus(item: ScheduleItem): ViewStatus {
  if (!item.enabled) return 'paused';
  if (item.lifecycleState === 'inactive') return 'inactive';
  if (item.targetState !== 'ready') return 'targetIssue';
  return 'active';
}

function Card({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <section
      className={`rounded-xl border border-border bg-card text-card-foreground shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

function EmptyState({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex flex-col items-center gap-3 px-6 py-14 text-center text-sm text-muted-foreground'>
      <span className='grid size-11 place-items-center rounded-full bg-muted'>
        <CalendarClock className='size-5' />
      </span>
      {children}
    </div>
  );
}

function StatusBadge({
  label,
  status,
}: {
  readonly label: string;
  readonly status: string;
}): ReactElement {
  const tone =
    status === 'active' || status === 'succeeded'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'failed' || status === 'targetIssue'
        ? 'bg-destructive/10 text-destructive'
        : status === 'running' || status === 'waiting'
          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
          : status === 'inactive' ||
              status === 'triggered' ||
              status === 'timed_out'
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function DefinitionRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}): ReactElement {
  return (
    <div className='grid gap-1 border-b border-border/60 py-3 last:border-0 sm:grid-cols-[10rem_1fr]'>
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 break-words text-sm font-medium'>{value}</dd>
    </div>
  );
}

export default function ScheduleDetailPage(): ReactElement {
  const api = useService(apiClientToken);
  const { i18n, t } = useTranslation(SCHEDULER_NS);
  const { scheduleId = '' } = useParams();
  const [item, setItem] = useState<ScheduleItem>();
  const [occurrences, setOccurrences] = useState<readonly OccurrenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [occurrencesLoading, setOccurrencesLoading] = useState(true);
  const [loadedScheduleId, setLoadedScheduleId] = useState<string>();
  const [loadedOccurrencesId, setLoadedOccurrencesId] = useState<string>();
  const [error, setError] = useState<string>();
  const [occurrencesError, setOccurrencesError] = useState<string>();
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let occurrenceTimer: ReturnType<typeof setTimeout> | undefined;
    void api
      .request<{ data: readonly ScheduleItem[] }>({
        path: 'schedules',
        signal: controller.signal,
      })
      .then((response) => {
        setError(undefined);
        setItem(response.data.find(({ id }) => id === scheduleId));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : t('errors.loadSchedules'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadedScheduleId(scheduleId);
          setLoading(false);
        }
      });
    const loadOccurrences = async (): Promise<void> => {
      try {
        const response = await api.request<{
          data: readonly OccurrenceItem[];
        }>({
          path: `schedules/${encodeURIComponent(scheduleId)}/occurrences`,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setOccurrencesError(undefined);
        setOccurrences(response.data);
        if (
          response.data.some(({ status }) =>
            ['pending', 'running', 'waiting'].includes(status),
          )
        )
          occurrenceTimer = setTimeout(() => void loadOccurrences(), 2_000);
      } catch (cause) {
        if (!controller.signal.aborted)
          setOccurrencesError(
            cause instanceof Error
              ? cause.message
              : t('errors.loadOccurrences'),
          );
      } finally {
        if (!controller.signal.aborted) {
          setLoadedOccurrencesId(scheduleId);
          setOccurrencesLoading(false);
        }
      }
    };
    void loadOccurrences();
    return () => {
      controller.abort();
      if (occurrenceTimer) clearTimeout(occurrenceTimer);
    };
  }, [api, scheduleId, t]);

  const scheduleLoading = loading || loadedScheduleId !== scheduleId;
  const triggersLoading =
    occurrencesLoading || loadedOccurrencesId !== scheduleId;
  const currentError = loadedScheduleId === scheduleId ? error : undefined;
  const currentOccurrencesError =
    loadedOccurrencesId === scheduleId ? occurrencesError : undefined;

  return (
    <PageContainer
      header={
        <PageHeader
          eyebrow={t('nav.automation')}
          title={item?.title ?? t('page.title')}
          description={item?.description}
          back={
            <Link
              className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
              to='/settings/schedules'
            >
              <ArrowLeft className='size-4' />
              {t('page.details.back')}
            </Link>
          }
          actions={
            item && !scheduleLoading ? (
              <ScheduleSwitch
                checked={item.enabled}
                disabled={updating || item.lifecycleState === 'inactive'}
                label={
                  item.enabled
                    ? t('page.actions.disable')
                    : t('page.actions.enable')
                }
                onChange={(enabled) => {
                  setItem({ ...item, enabled });
                  setUpdating(true);
                  void api
                    .request<{ data: ScheduleItem }>({
                      method: 'POST',
                      path: `schedules/${encodeURIComponent(item.id)}/${enabled ? 'enable' : 'disable'}`,
                    })
                    .then((response) => setItem(response.data))
                    .catch(() => setItem(item))
                    .finally(() => setUpdating(false));
                }}
              />
            ) : null
          }
        />
      }
    >
      {currentError ? (
        <div className='flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive'>
          <CircleAlert className='size-5 shrink-0' />
          {currentError}
        </div>
      ) : scheduleLoading ? (
        <Card>
          <EmptyState>{t('page.details.loading')}</EmptyState>
        </Card>
      ) : !item ? (
        <Card>
          <EmptyState>{t('page.details.notFound')}</EmptyState>
        </Card>
      ) : (
        <Details
          item={item}
          occurrences={occurrences}
          occurrencesError={currentOccurrencesError}
          occurrencesLoading={triggersLoading}
          language={i18n.resolvedLanguage ?? i18n.language}
          t={t}
        />
      )}
    </PageContainer>
  );
}

function Details({
  item,
  occurrences,
  occurrencesError,
  occurrencesLoading,
  language,
  t,
}: {
  readonly item: ScheduleItem;
  readonly occurrences: readonly OccurrenceItem[];
  readonly occurrencesError?: string;
  readonly occurrencesLoading: boolean;
  readonly language: string;
  readonly t: Translate;
}): ReactElement {
  const status = viewStatus(item);
  return (
    <>
      {status === 'targetIssue' ? (
        <div className='flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm'>
          <CircleAlert className='mt-0.5 size-5 shrink-0 text-amber-600' />
          <div>
            <p className='font-medium'>{t('page.details.targetIssueTitle')}</p>
            <p className='mt-1 text-muted-foreground'>
              {t('page.details.targetIssueBody')}
            </p>
          </div>
        </div>
      ) : null}
      <Overview item={item} language={language} t={t} />
      <Triggers
        error={occurrencesError}
        items={occurrences}
        loading={occurrencesLoading}
        t={t}
      />
    </>
  );
}

function Overview({
  item,
  language,
  t,
}: {
  readonly item: ScheduleItem;
  readonly language: string;
  readonly t: Translate;
}): ReactElement {
  return (
    <div className='grid gap-5 lg:grid-cols-2'>
      <Card className='p-5'>
        <h2 className='mb-2 font-semibold'>{t('page.details.schedule')}</h2>
        <dl>
          <DefinitionRow
            label={t('page.details.frequency')}
            value={
              formatCronDescription(item.cron, language) ??
              t('page.invalidSchedule')
            }
          />
          <DefinitionRow
            label={t('page.details.timezone')}
            value={item.timezone}
          />
          <DefinitionRow
            label={t('page.details.nextRun')}
            value={
              item.nextRunAt ? (
                <DateTimeValue value={item.nextRunAt} />
              ) : (
                t('page.unavailable')
              )
            }
          />
          <DefinitionRow
            label={t('page.details.lastTrigger')}
            value={
              item.lastRunAt ? (
                <DateTimeValue value={item.lastRunAt} />
              ) : (
                t('page.unavailable')
              )
            }
          />
          <DefinitionRow
            label={t('page.details.triggerCount')}
            value={item.runCount}
          />
          {item.inactiveReason ? (
            <DefinitionRow
              label={t('page.details.inactiveReason')}
              value={t(`page.reasons.${item.inactiveReason}`, {
                defaultValue: item.inactiveReason,
              })}
            />
          ) : null}
        </dl>
      </Card>
      <Card className='p-5'>
        <h2 className='mb-2 font-semibold'>{t('page.details.target')}</h2>
        <dl>
          <DefinitionRow
            label={t('page.details.targetName')}
            value={item.targetSummary.targetLabel}
          />
          <DefinitionRow
            label={t('page.details.targetType')}
            value={t(`page.targets.${item.targetType}`, {
              defaultValue: item.targetType,
            })}
          />
          {item.targetSummary.description ? (
            <DefinitionRow
              label={t('page.details.description')}
              value={item.targetSummary.description}
            />
          ) : null}
        </dl>
      </Card>
    </div>
  );
}

function Triggers({
  error,
  items,
  loading,
  t,
}: {
  readonly error?: string;
  readonly items: readonly OccurrenceItem[];
  readonly loading: boolean;
  readonly t: Translate;
}): ReactElement {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = items.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  return (
    <Card>
      <h2 className='border-b border-border p-4 font-semibold'>
        {t('page.details.triggers')}
      </h2>
      {error ? (
        <p className='p-4 text-sm text-destructive'>{error}</p>
      ) : loading ? (
        <EmptyState>{t('page.triggersLoading')}</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{t('page.triggersEmpty')}</EmptyState>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-4xl text-left text-sm'>
            <thead className='bg-muted/40 text-xs text-muted-foreground'>
              <tr>
                {(['startedAt', 'duration', 'status', 'target'] as const).map(
                  (column) => (
                    <th className='px-4 py-3 font-medium' key={column}>
                      {t(`page.triggerColumns.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {pageItems.map((item) => (
                <tr key={item.id}>
                  <td className='px-4 py-4'>
                    {formatClientDateTime(item.startedAt)}
                  </td>
                  <td className='px-4 py-4'>
                    {formatClientDuration(item.startedAt, item.finishedAt) ??
                      t('page.inProgress')}
                  </td>
                  <td className='px-4 py-4'>
                    <StatusBadge
                      label={t(`page.triggerStatuses.${item.status}`, {
                        defaultValue: item.status,
                      })}
                      status={item.status}
                    />
                    {item.reason ? (
                      <p className='mt-1 max-w-xs text-xs text-muted-foreground'>
                        {t(`page.reasons.${item.reason}`, {
                          defaultValue: item.reason,
                        })}
                      </p>
                    ) : null}
                  </td>
                  <td className='px-4 py-4'>
                    {item.target?.href ? (
                      <Link
                        className='mt-1 block text-xs text-primary hover:underline'
                        to={item.target.href}
                      >
                        {t('page.viewTarget')}
                      </Link>
                    ) : (
                      t('page.unavailable')
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 ? (
            <div className='flex items-center justify-between border-t border-border px-4 py-3 text-sm'>
              <span className='text-muted-foreground'>
                {t('page.pagination.summary', {
                  page: currentPage,
                  total: pageCount,
                })}
              </span>
              <div className='flex gap-2'>
                <button
                  className='rounded-md border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50'
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  type='button'
                >
                  {t('page.pagination.previous')}
                </button>
                <button
                  className='rounded-md border border-border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50'
                  disabled={currentPage === pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                  type='button'
                >
                  {t('page.pagination.next')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
