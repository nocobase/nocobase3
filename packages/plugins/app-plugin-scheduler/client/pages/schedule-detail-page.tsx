import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, CalendarClock, CircleAlert } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { DateTimeValue } from './date-time-value.js';
import { formatClientDateTime } from './date-time.js';
import { formatCronDescription } from './cron-description.js';

const SCHEDULER_NS = '@nocobase/app-plugin-scheduler';
type TargetState = 'ready' | 'disabled' | 'missing' | 'invalid';
type ViewStatus = 'active' | 'paused' | 'inactive' | 'targetIssue';
type DetailTab = 'overview' | 'triggers';
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
  readonly scheduledFor: string;
  readonly status: string;
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

function viewStatus(item: ScheduleItem): ViewStatus {
  if (item.targetSummary.state && item.targetSummary.state !== 'ready')
    return 'targetIssue';
  if (item.lifecycleState === 'inactive') return 'inactive';
  if (!item.enabled || item.scheduleStatus === 'paused') return 'paused';
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
    status === 'active' || status === 'triggered'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'failed' || status === 'targetIssue'
        ? 'bg-destructive/10 text-destructive'
        : status === 'running'
          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
          : status === 'inactive'
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
  const api = useService(appApiClientToken);
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
  const [tab, setTab] = useState<DetailTab>('overview');

  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: readonly ScheduleItem[] }>('schedules', {
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
    void api
      .request<{ data: readonly OccurrenceItem[] }>(
        `schedules/${encodeURIComponent(scheduleId)}/occurrences`,
        { signal: controller.signal },
      )
      .then((response) => {
        setOccurrencesError(undefined);
        setOccurrences(response.data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setOccurrencesError(
            cause instanceof Error
              ? cause.message
              : t('errors.loadOccurrences'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadedOccurrencesId(scheduleId);
          setOccurrencesLoading(false);
        }
      });
    return () => controller.abort();
  }, [api, scheduleId, t]);

  const scheduleLoading = loading || loadedScheduleId !== scheduleId;
  const triggersLoading =
    occurrencesLoading || loadedOccurrencesId !== scheduleId;
  const currentError = loadedScheduleId === scheduleId ? error : undefined;
  const currentOccurrencesError =
    loadedOccurrencesId === scheduleId ? occurrencesError : undefined;

  return (
    <main className='mx-auto w-full max-w-7xl space-y-6 p-5 md:p-8'>
      <Link
        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        to='/settings/automation/schedules'
      >
        <ArrowLeft className='size-4' />
        {t('page.details.back')}
      </Link>
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
          setTab={setTab}
          t={t}
          tab={tab}
        />
      )}
    </main>
  );
}

function Details({
  item,
  occurrences,
  occurrencesError,
  occurrencesLoading,
  language,
  setTab,
  t,
  tab,
}: {
  readonly item: ScheduleItem;
  readonly occurrences: readonly OccurrenceItem[];
  readonly occurrencesError?: string;
  readonly occurrencesLoading: boolean;
  readonly language: string;
  readonly setTab: (tab: DetailTab) => void;
  readonly t: Translate;
  readonly tab: DetailTab;
}): ReactElement {
  const status = viewStatus(item);
  return (
    <>
      <header className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {item.title}
          </h1>
          {item.description ? (
            <p className='mt-1 text-sm text-muted-foreground'>
              {item.description}
            </p>
          ) : null}
        </div>
        <StatusBadge label={t(`page.statuses.${status}`)} status={status} />
      </header>
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
      <div className='border-b border-border' role='tablist'>
        <Tab
          active={tab === 'overview'}
          label={t('page.details.overview')}
          onClick={() => setTab('overview')}
        />
        <Tab
          active={tab === 'triggers'}
          label={`${t('page.details.triggers')} (${occurrences.length})`}
          onClick={() => setTab('triggers')}
        />
      </div>
      {tab === 'overview' ? (
        <Overview item={item} language={language} t={t} />
      ) : (
        <Triggers
          error={occurrencesError}
          items={occurrences}
          loading={occurrencesLoading}
          t={t}
        />
      )}
    </>
  );
}

function Tab({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-selected={active}
      className={`border-b-2 px-4 py-3 text-sm font-medium ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
      onClick={onClick}
      role='tab'
      type='button'
    >
      {label}
    </button>
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
              value={item.inactiveReason}
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
            value={item.targetType}
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
  return (
    <Card>
      <div className='border-b border-border p-4 text-sm text-muted-foreground'>
        <p>{t('page.triggersHelp')}</p>
      </div>
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
                {(['scheduledFor', 'timing', 'status'] as const).map(
                  (column) => (
                    <th className='px-4 py-3 font-medium' key={column}>
                      {t(`page.triggerColumns.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className='px-4 py-4'>
                    {formatClientDateTime(item.scheduledFor)}
                  </td>
                  <td className='px-4 py-4'>
                    <p>{formatClientDateTime(item.startedAt)}</p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {item.finishedAt
                        ? formatClientDateTime(item.finishedAt)
                        : t('page.inProgress')}
                    </p>
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
                        {item.reason}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
