import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Download, RefreshCw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useSearchParams } from 'react-router';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../registry/nocobase-ai/shared/ui/alert.js';
import { Button } from '../../registry/nocobase-ai/shared/ui/button.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../registry/nocobase-ai/shared/ui/select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../registry/nocobase-ai/shared/ui/table.js';
import { ChartPreview } from '../../registry/nocobase-ai/components/tools/chart-renderer.js';
import { LoadingState } from '../../registry/nocobase-ai/shared/loading-state.js';
import {
  USAGE_BREAKDOWN_DIMENSIONS,
  fetchUsageBreakdown,
  fetchUsageFilterOptions,
  fetchUsageSeries,
  fetchUsageSummary,
  type UsageBreakdown,
  type UsageBreakdownDimension,
  type UsageFilterOptions,
  type UsageGranularity,
  type UsageQuery,
  type UsageSeries,
  type UsageSummary,
  type UsageTotals,
} from '../usage-statistics-service.js';
import { useT } from '../locales/index.js';

const RANGE_KEYS = ['today', '7d', '30d', '90d'] as const;
type RangeKey = (typeof RANGE_KEYS)[number];

const RANGE_LABELS: Readonly<Record<RangeKey, string>> = {
  today: 'usage.range.today',
  '7d': 'usage.range.last7Days',
  '30d': 'usage.range.last30Days',
  '90d': 'usage.range.last90Days',
};

const RANGE_DAYS: Readonly<Record<RangeKey, number>> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const DIMENSION_LABELS: Readonly<Record<UsageBreakdownDimension, string>> = {
  model: 'usage.dimension.model',
  aiEmployeeUsername: 'usage.dimension.aiEmployee',
  userId: 'usage.dimension.user',
};

const METRIC_CARDS = [
  { key: 'totalTokens', label: 'usage.metric.totalTokens' },
  { key: 'inputTokens', label: 'usage.metric.inputTokens' },
  { key: 'outputTokens', label: 'usage.metric.outputTokens' },
  { key: 'cachedTokens', label: 'usage.metric.cachedTokens' },
  { key: 'reasoningTokens', label: 'usage.metric.reasoningTokens' },
  { key: 'eventCount', label: 'usage.metric.llmCalls' },
  { key: 'toolCallCount', label: 'usage.metric.toolCalls' },
] as const satisfies readonly { key: keyof UsageTotals; label: string }[];

const HOURS_PER_DAY = 24;
const ALL_VALUE = '__all__';
/** Spreadsheets only detect UTF-8 in a CSV that starts with a byte order mark. */
const UTF8_BOM = '\uFEFF';
const INPUT_SERIES_COLOR = '#6366f1';
const OUTPUT_SERIES_COLOR = '#f59e0b';
const CACHED_SERIES_COLOR = '#14b8a6';

/** Whole local days ending at `now`, so a range never cuts a day in half. */
function buildRange(
  rangeKey: RangeKey,
  now: number,
): { start: number; end: number } {
  const end = new Date(now);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  start.setDate(start.getDate() - (RANGE_DAYS[rangeKey] - 1));
  return { start: start.getTime(), end: now };
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

function formatBucketLabel(
  start: number,
  granularity: UsageGranularity,
  language: string,
): string {
  const date = new Date(start);
  if (granularity === 'hour') {
    return new Intl.DateTimeFormat(language, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }).format(date);
  }
  if (granularity === 'month') {
    return new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'short',
    }).format(date);
  }
  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function toCsv(rows: readonly string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell,
        )
        .join(','),
    )
    .join('\n');
}

export default function UsageStatisticsPage(): ReactElement {
  const api = useApiClient();
  const t = useT();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const [params, setParams] = useSearchParams();
  // Refreshing re-anchors the range to the current time; nothing else moves it.
  const [rangeAnchor, setRangeAnchor] = useState(() => Date.now());

  const rangeKey =
    RANGE_KEYS.find((key) => key === params.get('range')) ?? '7d';
  const dimension =
    USAGE_BREAKDOWN_DIMENSIONS.find((key) => key === params.get('by')) ??
    'model';
  const model = params.get('model') ?? '';
  const aiEmployeeUsername = params.get('employee') ?? '';

  const query = useMemo<UsageQuery>(() => {
    const { start, end } = buildRange(rangeKey, rangeAnchor);
    return {
      start,
      end,
      timezoneOffset: -new Date().getTimezoneOffset(),
      ...(model ? { model } : {}),
      ...(aiEmployeeUsername ? { aiEmployeeUsername } : {}),
    };
  }, [rangeKey, rangeAnchor, model, aiEmployeeUsername]);
  // The range ends at the current moment, so the comparison window moves back
  // by the preset's whole period: today is measured against the same hours
  // yesterday, not against the stretch that just ended.
  const compareShiftHours = RANGE_DAYS[rangeKey] * HOURS_PER_DAY;

  const [summary, setSummary] = useState<UsageSummary>();
  const [series, setSeries] = useState<UsageSeries>();
  const [options, setOptions] = useState<UsageFilterOptions>();
  const [breakdown, setBreakdown] = useState<UsageBreakdown>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const updateParams = useCallback(
    (changes: Record<string, string>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    void Promise.all([
      fetchUsageSummary(
        api,
        { ...query, compareShiftHours },
        controller.signal,
      ),
      fetchUsageSeries(api, query, controller.signal),
      fetchUsageFilterOptions(api, query, controller.signal),
    ])
      .then(([nextSummary, nextSeries, nextOptions]) => {
        if (controller.signal.aborted) return;
        setSummary(nextSummary);
        setSeries(nextSeries);
        setOptions(nextOptions);
      })
      .catch((cause: unknown) => {
        if (!isAbort(cause)) setError(asError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, query, compareShiftHours]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsageBreakdown(api, { ...query, dimension }, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setBreakdown(next);
      })
      .catch((cause: unknown) => {
        if (!isAbort(cause)) setError(asError(cause));
      });
    return () => controller.abort();
  }, [api, query, dimension]);

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(language),
    [language],
  );
  const percentFormat = useMemo(
    () =>
      new Intl.NumberFormat(language, {
        style: 'percent',
        maximumFractionDigits: 1,
      }),
    [language],
  );

  const chartOptions = useMemo(() => {
    if (!series) return undefined;
    const labels = series.buckets.map((bucket) =>
      formatBucketLabel(bucket.start, series.granularity, language),
    );
    return {
      grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { alignWithLabel: true },
      },
      yAxis: { type: 'value' },
      series: [
        {
          // Cached tokens are part of the input tokens, so the input bar is
          // split into its cached and uncached halves rather than gaining a
          // segment: stacked, the two still add up to the input total.
          name: t('usage.metric.uncachedInputTokens'),
          type: 'bar',
          stack: 'input',
          itemStyle: { color: INPUT_SERIES_COLOR },
          data: series.buckets.map((bucket) =>
            Math.max(0, bucket.inputTokens - bucket.cachedTokens),
          ),
        },
        {
          name: t('usage.metric.cachedTokens'),
          type: 'bar',
          stack: 'input',
          itemStyle: { color: CACHED_SERIES_COLOR },
          data: series.buckets.map((bucket) => bucket.cachedTokens),
        },
        {
          name: t('usage.metric.outputTokens'),
          type: 'bar',
          stack: 'output',
          itemStyle: { color: OUTPUT_SERIES_COLOR },
          data: series.buckets.map((bucket) => bucket.outputTokens),
        },
      ],
    };
  }, [series, language, t]);

  const exportCsv = useCallback(() => {
    if (!breakdown) return;
    const header = [
      t(DIMENSION_LABELS[breakdown.dimension]),
      t('usage.metric.totalTokens'),
      t('usage.metric.inputTokens'),
      t('usage.metric.cachedTokens'),
      t('usage.metric.outputTokens'),
      t('usage.metric.llmCalls'),
      t('usage.metric.toolCalls'),
    ];
    const csv = toCsv([
      header,
      ...breakdown.rows.map((row) => [
        row.label,
        String(row.totalTokens),
        String(row.inputTokens),
        String(row.cachedTokens),
        String(row.outputTokens),
        String(row.eventCount),
        String(row.toolCallCount),
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([`${UTF8_BOM}${csv}`], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-usage-${breakdown.dimension}-${new Date(query.start)
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [breakdown, query.start, t]);

  const totals = summary?.totals;
  const empty = !loading && totals?.eventCount === 0;

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      {error && (
        <Alert variant='destructive' role='alert'>
          <AlertTitle>{t('usage.loadFailed')}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={rangeKey}
          onValueChange={(value) => {
            if (typeof value === 'string') updateParams({ range: value });
          }}
        >
          <SelectTrigger aria-label={t('usage.filter.range')}>
            <SelectValue>{t(RANGE_LABELS[rangeKey])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RANGE_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(RANGE_LABELS[key])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={aiEmployeeUsername || ALL_VALUE}
          onValueChange={(value) => {
            if (typeof value !== 'string') return;
            updateParams({ employee: value === ALL_VALUE ? '' : value });
          }}
        >
          <SelectTrigger aria-label={t('usage.filter.aiEmployee')}>
            <SelectValue>
              {options?.aiEmployees.find(
                (option) => option.value === aiEmployeeUsername,
              )?.label ?? t('usage.filter.allAiEmployees')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>
              {t('usage.filter.allAiEmployees')}
            </SelectItem>
            {options?.aiEmployees.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={model || ALL_VALUE}
          onValueChange={(value) => {
            if (typeof value !== 'string') return;
            updateParams({ model: value === ALL_VALUE ? '' : value });
          }}
        >
          <SelectTrigger aria-label={t('usage.filter.model')}>
            <SelectValue>{model || t('usage.filter.allModels')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>
              {t('usage.filter.allModels')}
            </SelectItem>
            {options?.models.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant='outline'
          size='sm'
          className='ml-auto'
          onClick={() => setRangeAnchor(Date.now())}
        >
          <RefreshCw className='size-4' aria-hidden='true' />
          {t('usage.refresh')}
        </Button>
      </div>

      <section aria-label={t('usage.summary')}>
        <dl className='grid grid-cols-2 gap-3 md:grid-cols-4'>
          {METRIC_CARDS.map((metric) => (
            <MetricCard
              key={metric.key}
              label={t(metric.label)}
              value={totals ? numberFormat.format(totals[metric.key]) : '—'}
              delta={deltaOf(
                totals?.[metric.key],
                summary?.previous?.[metric.key],
              )}
              percentFormat={percentFormat}
              comparisonLabel={t('usage.vsPreviousPeriod')}
              noComparisonLabel={t('usage.noComparison')}
            />
          ))}
        </dl>
      </section>

      <section aria-label={t('usage.trend')} className='rounded-lg border p-4'>
        <h2 className='mb-2 text-sm font-medium'>{t('usage.trend')}</h2>
        {loading && !series ? (
          <LoadingState className='h-[280px]' />
        ) : empty ? (
          <p className='py-16 text-center text-sm text-muted-foreground'>
            {t('usage.empty')}
          </p>
        ) : chartOptions ? (
          <ChartPreview options={chartOptions} />
        ) : null}
      </section>

      <section
        aria-label={t('usage.breakdown')}
        className='flex flex-col gap-3'
      >
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='text-sm font-medium'>{t('usage.breakdown')}</h2>
          <div className='flex gap-1' role='tablist'>
            {USAGE_BREAKDOWN_DIMENSIONS.map((key) => (
              <Button
                key={key}
                role='tab'
                aria-selected={dimension === key}
                variant={dimension === key ? 'secondary' : 'ghost'}
                size='sm'
                onClick={() => updateParams({ by: key })}
              >
                {t(DIMENSION_LABELS[key])}
              </Button>
            ))}
          </div>
          <Button
            variant='outline'
            size='sm'
            className='ml-auto'
            disabled={!breakdown?.rows.length}
            onClick={exportCsv}
          >
            <Download className='size-4' aria-hidden='true' />
            {t('usage.exportCsv')}
          </Button>
        </div>

        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(DIMENSION_LABELS[dimension])}</TableHead>
                <TableHead className='text-right'>
                  {t('usage.metric.totalTokens')}
                </TableHead>
                <TableHead className='text-right'>{t('usage.share')}</TableHead>
                <TableHead className='text-right'>
                  {t('usage.metric.inputTokens')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('usage.metric.cachedTokens')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('usage.metric.outputTokens')}
                </TableHead>
                <TableHead className='text-right'>
                  {t('usage.metric.llmCalls')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown?.rows.length ? (
                breakdown.rows.map((row) => (
                  <TableRow key={row.key || '—'}>
                    <TableCell className='font-medium'>
                      {row.label || t('usage.unattributed')}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {numberFormat.format(row.totalTokens)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {breakdown.totals.totalTokens > 0
                        ? percentFormat.format(
                            row.totalTokens / breakdown.totals.totalTokens,
                          )
                        : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {numberFormat.format(row.inputTokens)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {numberFormat.format(row.cachedTokens)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {numberFormat.format(row.outputTokens)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {numberFormat.format(row.eventCount)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className='py-10 text-center text-sm text-muted-foreground'
                  >
                    {loading ? t('usage.loading') : t('usage.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function deltaOf(current?: number, previous?: number): number | undefined {
  if (current === undefined || previous === undefined || previous === 0) {
    return undefined;
  }
  return (current - previous) / previous;
}

function MetricCard({
  label,
  value,
  delta,
  percentFormat,
  comparisonLabel,
  noComparisonLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly delta?: number;
  readonly percentFormat: Intl.NumberFormat;
  readonly comparisonLabel: string;
  readonly noComparisonLabel: string;
}): ReactElement {
  return (
    <div className='rounded-lg border p-4'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-1 text-2xl font-semibold tabular-nums'>{value}</dd>
      {delta === undefined ? (
        <p className='mt-1 text-xs text-muted-foreground'>
          {noComparisonLabel}
        </p>
      ) : (
        <p className='mt-1 text-xs'>
          <span
            className={`tabular-nums ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
          >
            {delta >= 0 ? '+' : ''}
            {percentFormat.format(delta)}
          </span>{' '}
          <span className='text-muted-foreground'>{comparisonLabel}</span>
        </p>
      )}
    </div>
  );
}
