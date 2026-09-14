import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClock, CircleAlert, Search } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';

import { DateTimeValue } from './date-time-value.js';
import { formatClientRelativeTime } from './date-time.js';
import { formatCronDescription } from './cron-description.js';
import { ScheduleSwitch } from './schedule-switch.js';

const SCHEDULER_NS = '@nocobase/app-plugin-scheduler';

/** Rows per page. The pager stays hidden while every row fits on one page. */
const PAGE_SIZE = 10;
type TargetState = 'ready' | 'disabled' | 'missing' | 'invalid';
type ViewStatus = 'active' | 'paused' | 'inactive' | 'targetIssue';

interface ScheduleItem {
  readonly id: string;
  readonly title: string;
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

/** The list names an execution target by kind; its own name belongs on the detail page. */
function TypeTag({ label }: { readonly label: string }): ReactElement {
  return (
    <span className='inline-flex max-w-full whitespace-normal break-words rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground'>
      {label}
    </span>
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
  const api = useService(apiClientToken);
  const { i18n, t } = useTranslation(SCHEDULER_NS);
  const [items, setItems] = useState<readonly ScheduleItem[]>([]);
  const [listError, setListError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ViewStatus>('all');
  const [targetFilter, setTargetFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [updating, setUpdating] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setScheduleEnabled = (item: ScheduleItem, enabled: boolean): void => {
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, enabled } : candidate,
      ),
    );
    setUpdating((current) => new Set(current).add(item.id));
    void api
      .request<{ data: ScheduleItem }>({
        method: 'POST',
        path: `schedules/${encodeURIComponent(item.id)}/${enabled ? 'enable' : 'disable'}`,
      })
      .then(({ data }) =>
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id ? data : candidate,
          ),
        ),
      )
      .catch(() =>
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, enabled: item.enabled }
              : candidate,
          ),
        ),
      )
      .finally(() =>
        setUpdating((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        }),
      );
  };

  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: readonly ScheduleItem[] }>({
        path: 'schedules',
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
        [item.title, item.cron, scheduleDescription, item.targetType].some(
          (value) => value?.toLocaleLowerCase().includes(term),
        );
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

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  // Narrowing a filter restarts from the first page, and the stored page is
  // clamped because the list can shrink under it between renders.
  const currentPage = Math.min(page, pageCount);
  const pagedItems = visibleItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const statusLabel = (status: ViewStatus): string =>
    t(`page.statuses.${status}`);
  const targetTypeLabel = (type: string): string =>
    t(`page.targets.${type}`, { defaultValue: type });
  const targetStateLabel = (state: TargetState): string =>
    t(`page.targetStates.${state}`);
  const controlClassName =
    'h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30';
  const pagerButtonClassName =
    'h-8 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-6 py-7'>
        <div className='mx-auto w-full max-w-7xl'>
          <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
            {t('nav.automation')}
          </p>
          <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
            {t('page.title')}
          </h1>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-6 py-6'>
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
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t('page.filters.searchPlaceholder')}
                type='search'
                value={search}
              />
            </label>
            <select
              aria-label={t('page.filters.statusLabel')}
              className={`${controlClassName} w-full md:w-44`}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'all' | ViewStatus);
                setPage(1);
              }}
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
              onChange={(event) => {
                setTargetFilter(event.target.value);
                setPage(1);
              }}
              value={targetFilter}
            >
              <option value='all'>{t('page.filters.allTargets')}</option>
              {targetTypes.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {targetTypeLabel(targetType)}
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
            <>
              <div className='overflow-hidden'>
                <table className='w-full table-fixed text-left text-sm'>
                  <colgroup>
                    <col className='w-[34%]' />
                    <col className='w-[9%]' />
                    <col className='w-[9%]' />
                    <col className='w-[17%]' />
                    <col className='w-[11%]' />
                    <col className='w-[20%]' />
                  </colgroup>
                  <thead className='bg-muted/40 text-xs text-muted-foreground'>
                    <tr>
                      {(
                        [
                          'name',
                          'target',
                          'status',
                          'scheduleTimezone',
                          'triggered',
                          'nextRun',
                        ] as const
                      ).map((column) => (
                        <th className='px-3 py-3 font-medium' key={column}>
                          {t(`page.columns.${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border'>
                    {pagedItems.map((item) => {
                      const href = `/settings/automation/schedules/${encodeURIComponent(item.id)}`;
                      return (
                        <tr key={item.id}>
                          <td className='break-words px-3 py-4'>
                            <Link
                              className='block break-words font-medium hover:text-primary hover:underline'
                              to={href}
                            >
                              {item.title}
                            </Link>
                          </td>
                          <td className='break-words px-3 py-4'>
                            <TypeTag label={targetTypeLabel(item.targetType)} />
                            {item.targetState !== 'ready' ? (
                              <div className='mt-1'>
                                <StatusBadge
                                  label={targetStateLabel(item.targetState)}
                                  status='targetIssue'
                                />
                              </div>
                            ) : null}
                          </td>
                          <td className='px-3 py-4'>
                            <ScheduleSwitch
                              checked={item.enabled}
                              disabled={
                                updating.has(item.id) ||
                                item.lifecycleState === 'inactive'
                              }
                              label={
                                item.enabled
                                  ? t('page.actions.disable')
                                  : t('page.actions.enable')
                              }
                              onChange={(enabled) =>
                                setScheduleEnabled(item, enabled)
                              }
                            />
                          </td>
                          <td className='break-words px-3 py-4'>
                            <span className='font-medium break-words'>
                              {formatCronDescription(
                                item.cron,
                                i18n.resolvedLanguage ?? i18n.language,
                              ) ?? t('page.invalidSchedule')}
                            </span>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              {item.timezone}
                            </p>
                          </td>
                          <td className='break-words px-3 py-4'>
                            <span className='tabular-nums'>
                              {item.runCount}
                            </span>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              {item.lastRunAt
                                ? (formatClientRelativeTime(item.lastRunAt) ??
                                  t('page.unavailable'))
                                : t('page.unavailable')}
                            </p>
                          </td>
                          <td className='break-words px-3 py-4'>
                            {item.nextRunAt ? (
                              <DateTimeValue value={item.nextRunAt} />
                            ) : (
                              t('page.unavailable')
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visibleItems.length > PAGE_SIZE ? (
                <div className='flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm'>
                  <p className='text-muted-foreground'>
                    {t('page.pagination.summary', {
                      page: currentPage,
                      total: pageCount,
                    })}
                  </p>
                  <div className='flex gap-2'>
                    <button
                      className={pagerButtonClassName}
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                      type='button'
                    >
                      {t('page.pagination.previous')}
                    </button>
                    <button
                      className={pagerButtonClassName}
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage(currentPage + 1)}
                      type='button'
                    >
                      {t('page.pagination.next')}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
