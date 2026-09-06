import { appApiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClock,
  CircleAlert,
  ListChecks,
  Search,
  TimerReset,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';

import { DateTimeValue } from './date-time-value.js';
import { formatCronDescription } from './cron-description.js';

const SCHEDULER_NS = '@nocobase/app-plugin-scheduler';
type TargetState = 'ready' | 'disabled' | 'missing' | 'invalid';
type ViewStatus = 'active' | 'paused' | 'inactive' | 'targetIssue';

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

function SummaryCard({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
}): ReactElement {
  return (
    <Card className='p-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <p className='text-xs font-medium text-muted-foreground'>{label}</p>
          <p className='mt-2 text-2xl font-semibold'>{value}</p>
        </div>
        <span className='grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground'>
          {icon}
        </span>
      </div>
    </Card>
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

export default function SchedulesPage(): ReactElement {
  const api = useService(appApiClientToken);
  const { i18n, t } = useTranslation(SCHEDULER_NS);
  const [items, setItems] = useState<readonly ScheduleItem[]>([]);
  const [listError, setListError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ViewStatus>('all');
  const [targetFilter, setTargetFilter] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: readonly ScheduleItem[] }>('schedules', {
        signal: controller.signal,
      })
      .then((response) => setItems(response.data))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setListError(
            cause instanceof Error ? cause.message : t('errors.loadSchedules'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, t]);

  const targetTypes = useMemo(
    () => [...new Set(items.map(({ targetType }) => targetType))].sort(),
    [items],
  );
  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const scheduleDescription = formatCronDescription(
        item.cron,
        i18n.resolvedLanguage ?? i18n.language,
      );
      const matchesText =
        !term ||
        [
          item.title,
          item.description,
          item.cron,
          scheduleDescription,
          item.targetSummary.targetLabel,
          item.targetType,
        ].some((value) => value?.toLocaleLowerCase().includes(term));
      return (
        matchesText &&
        (statusFilter === 'all' || viewStatus(item) === statusFilter) &&
        (targetFilter === 'all' || item.targetType === targetFilter)
      );
    });
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    items,
    search,
    statusFilter,
    targetFilter,
  ]);

  const statusLabel = (status: ViewStatus): string =>
    t(`page.statuses.${status}`);
  const controlClassName =
    'h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30';
  const totalTriggers = items.reduce((total, item) => total + item.runCount, 0);
  const activeCount = items.filter(
    (item) => viewStatus(item) === 'active',
  ).length;

  return (
    <main className='mx-auto w-full max-w-7xl space-y-6 p-5 md:p-8'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('page.title')}
          </h1>
          <p className='max-w-3xl text-sm text-muted-foreground'>
            {t('page.description')}
          </p>
        </div>
        <span className='inline-flex w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground'>
          {t('page.readOnly')}
        </span>
      </header>

      <div className='grid gap-4 sm:grid-cols-3'>
        <SummaryCard
          icon={<CalendarClock className='size-5' />}
          label={t('page.summary.total')}
          value={items.length}
        />
        <SummaryCard
          icon={<ListChecks className='size-5' />}
          label={t('page.summary.active')}
          value={activeCount}
        />
        <SummaryCard
          icon={<TimerReset className='size-5' />}
          label={t('page.summary.triggers')}
          value={totalTriggers}
        />
      </div>

      {listError ? (
        <div className='flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive'>
          <CircleAlert className='size-5 shrink-0' />
          {listError}
        </div>
      ) : null}

      <Card>
        <div className='flex flex-col gap-3 border-b border-border p-4 md:flex-row'>
          <label className='relative flex-1'>
            <span className='sr-only'>{t('page.filters.searchLabel')}</span>
            <Search className='pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground' />
            <input
              aria-label={t('page.filters.searchLabel')}
              className={`${controlClassName} w-full pl-9`}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('page.filters.searchPlaceholder')}
              type='search'
              value={search}
            />
          </label>
          <select
            aria-label={t('page.filters.statusLabel')}
            className={`${controlClassName} w-full md:w-44`}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | ViewStatus)
            }
            value={statusFilter}
          >
            <option value='all'>{t('page.filters.allStatuses')}</option>
            {(['active', 'paused', 'inactive', 'targetIssue'] as const).map(
              (status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ),
            )}
          </select>
          <select
            aria-label={t('page.filters.targetLabel')}
            className={`${controlClassName} w-full md:w-48`}
            onChange={(event) => setTargetFilter(event.target.value)}
            value={targetFilter}
          >
            <option value='all'>{t('page.filters.allTargets')}</option>
            {targetTypes.map((targetType) => (
              <option key={targetType} value={targetType}>
                {targetType}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <EmptyState>{t('page.loading')}</EmptyState>
        ) : visibleItems.length === 0 ? (
          <EmptyState>
            {items.length === 0 ? t('page.empty') : t('page.noMatches')}
          </EmptyState>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-5xl text-left text-sm'>
              <thead className='bg-muted/40 text-xs text-muted-foreground'>
                <tr>
                  {(
                    [
                      'name',
                      'target',
                      'scheduleTimezone',
                      'triggers',
                      'lastTrigger',
                      'nextRun',
                      'status',
                    ] as const
                  ).map((column) => (
                    <th className='px-4 py-3 font-medium' key={column}>
                      {t(`page.columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {visibleItems.map((item) => {
                  const status = viewStatus(item);
                  return (
                    <tr className='hover:bg-muted/25' key={item.id}>
                      <td className='px-4 py-4'>
                        <Link
                          className='font-medium hover:text-primary hover:underline'
                          to={`/settings/automation/schedules/${encodeURIComponent(item.id)}`}
                        >
                          {item.title}
                        </Link>
                        {item.description ? (
                          <p className='mt-1 max-w-64 truncate text-xs text-muted-foreground'>
                            {item.description}
                          </p>
                        ) : null}
                      </td>
                      <td className='px-4 py-4'>
                        <span className='font-medium'>
                          {item.targetSummary.targetLabel}
                        </span>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {item.targetType}
                        </p>
                      </td>
                      <td className='px-4 py-4'>
                        <span className='font-medium'>
                          {formatCronDescription(
                            item.cron,
                            i18n.resolvedLanguage ?? i18n.language,
                          ) ?? t('page.invalidSchedule')}
                        </span>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {item.timezone}
                        </p>
                      </td>
                      <td className='px-4 py-4'>{item.runCount}</td>
                      <td className='px-4 py-4'>
                        {item.lastRunAt ? (
                          <DateTimeValue value={item.lastRunAt} />
                        ) : (
                          t('page.unavailable')
                        )}
                      </td>
                      <td className='px-4 py-4'>
                        {item.nextRunAt ? (
                          <DateTimeValue value={item.nextRunAt} />
                        ) : (
                          t('page.unavailable')
                        )}
                      </td>
                      <td className='px-4 py-4'>
                        <StatusBadge
                          label={statusLabel(status)}
                          status={status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
