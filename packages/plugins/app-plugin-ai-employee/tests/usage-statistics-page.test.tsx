/** @vitest-environment jsdom */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UsageStatisticsSettingsPage from '../client/pages/usage-statistics-settings-page.js';
import type {
  UsageBreakdown,
  UsageSeries,
  UsageSummary,
  UsageTotals,
} from '../client/usage-statistics-service.js';

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  series: vi.fn(),
  breakdown: vi.fn(),
  filterOptions: vi.fn(),
  chart: vi.fn(),
  api: {},
}));

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: {},
  useApiClient: () => mocks.api,
  createApiClient: () => mocks.api,
  resolveAppUrl: (value: string) => value,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en-US' } }),
}));
vi.mock('../client/locales/index.js', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('../registry/nocobase-ai/components/tools/chart-renderer.js', () => ({
  ChartPreview: (props: { options: Record<string, unknown> }) => {
    mocks.chart(props.options);
    return <div data-testid='chart' />;
  },
}));
vi.mock('../client/usage-statistics-service.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../client/usage-statistics-service.js')
  >()),
  fetchUsageSummary: mocks.summary,
  fetchUsageSeries: mocks.series,
  fetchUsageBreakdown: mocks.breakdown,
  fetchUsageFilterOptions: mocks.filterOptions,
}));

const range = { start: 1, end: 2, timezoneOffsetHours: 8 };

function totals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    eventCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    toolCallCount: 0,
    autoToolCallCount: 0,
    ...overrides,
  };
}

const summary: UsageSummary = {
  range,
  totals: totals({
    eventCount: 12,
    inputTokens: 9000,
    outputTokens: 1000,
    totalTokens: 10_000,
  }),
  previous: totals({ eventCount: 6, totalTokens: 8000 }),
  previousRange: { start: 0, end: 1 },
};

const series: UsageSeries = {
  range,
  granularity: 'day',
  buckets: [
    {
      start: Date.parse('2026-09-20T00:00:00Z'),
      ...totals({ inputTokens: 4000, outputTokens: 400, cachedTokens: 1200 }),
    },
    {
      start: Date.parse('2026-09-21T00:00:00Z'),
      ...totals({ inputTokens: 5000, outputTokens: 600, cachedTokens: 2500 }),
    },
  ],
};

const breakdown: UsageBreakdown = {
  range,
  dimension: 'model',
  rows: [
    {
      key: 'gpt-5.2',
      label: 'gpt-5.2',
      ...totals({
        totalTokens: 7500,
        inputTokens: 7000,
        outputTokens: 500,
        cachedTokens: 3100,
        eventCount: 8,
      }),
    },
    {
      key: 'claude-opus-5',
      label: 'claude-opus-5',
      ...totals({
        totalTokens: 2500,
        inputTokens: 2000,
        outputTokens: 500,
        cachedTokens: 600,
        eventCount: 4,
      }),
    },
  ],
  totals: summary.totals,
};

function renderPage(search = '') {
  const router = createMemoryRouter(
    [{ path: '/settings/ai/usage', element: <UsageStatisticsSettingsPage /> }],
    { initialEntries: [`/settings/ai/usage${search}`] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.summary.mockResolvedValue(summary);
  mocks.series.mockResolvedValue(series);
  mocks.breakdown.mockResolvedValue(breakdown);
  mocks.filterOptions.mockResolvedValue({
    range,
    models: [{ value: 'gpt-5.2', label: 'gpt-5.2' }],
    aiEmployees: [{ value: 'nathan', label: 'Nathan' }],
  });
});

describe('usage statistics page', () => {
  it('shows the range totals, the trend and the breakdown', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Usage statistics',
      }),
    ).toBeInTheDocument();
    const metrics = within(
      screen.getByRole('region', { name: 'usage.summary' }),
    );
    expect(metrics.getByText('10,000')).toBeInTheDocument();
    expect(metrics.getByText('9,000')).toBeInTheDocument();
    // 10,000 against a previous period of 8,000.
    expect(metrics.getByText('+25%')).toBeInTheDocument();
    expect(
      metrics.getAllByText('usage.vsPreviousPeriod').length,
    ).toBeGreaterThan(0);
    // Counters the previous period never recorded have nothing to compare to.
    expect(metrics.getAllByText('usage.noComparison').length).toBeGreaterThan(
      0,
    );

    await waitFor(() => expect(mocks.chart).toHaveBeenCalled());
    const chartOptions = mocks.chart.mock.calls.at(-1)?.[0] as {
      series: { stack: string; data: number[] }[];
    };
    // Cached tokens are part of the input tokens, so the input stack carries
    // the uncached remainder plus the cached half and still totals the input.
    expect(chartOptions.series.map((item) => item.data)).toEqual([
      [2800, 2500],
      [1200, 2500],
      [400, 600],
    ]);
    expect(chartOptions.series.map((item) => item.stack)).toEqual([
      'input',
      'input',
      'output',
    ]);

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'usage.dimension.model',
      'usage.metric.totalTokens',
      'usage.share',
      'usage.metric.inputTokens',
      'usage.metric.cachedTokens',
      'usage.metric.outputTokens',
      'usage.metric.llmCalls',
    ]);
    expect(rows[1]).toHaveTextContent('gpt-5.2');
    expect(rows[1]).toHaveTextContent('75%');
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['gpt-5.2', '7,500', '75%', '7,000', '3,100', '500', '8']);
  });

  it('reads the range and dimension from the URL and passes filters to the API', async () => {
    renderPage('?range=30d&by=userId&model=gpt-5.2&employee=nathan');

    await waitFor(() => expect(mocks.breakdown).toHaveBeenCalled());
    expect(mocks.summary.mock.calls.at(-1)?.[1]).toMatchObject({
      model: 'gpt-5.2',
      aiEmployeeUsername: 'nathan',
      // The 30-day preset compares against the 30 days before it.
      compareShiftHours: 30 * 24,
    });
    expect(mocks.breakdown.mock.calls.at(-1)?.[1]).toMatchObject({
      dimension: 'userId',
    });
  });

  it('compares today against the same hours yesterday', async () => {
    renderPage('?range=today');
    await waitFor(() => expect(mocks.summary).toHaveBeenCalled());
    expect(mocks.summary.mock.calls.at(-1)?.[1]).toMatchObject({
      compareShiftHours: 24,
    });
  });

  it('switches the breakdown dimension through the URL', async () => {
    const router = renderPage();
    await waitFor(() => expect(mocks.breakdown).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('tab', { name: 'usage.dimension.user' }));

    await waitFor(() => expect(mocks.breakdown).toHaveBeenCalledTimes(2));
    expect(mocks.breakdown.mock.calls.at(-1)?.[1]).toMatchObject({
      dimension: 'userId',
    });
    expect(router.state.location.search).toBe('?by=userId');
  });

  it('reports an empty range instead of an empty chart', async () => {
    mocks.summary.mockResolvedValue({
      ...summary,
      totals: totals(),
      previous: totals(),
    });
    mocks.breakdown.mockResolvedValue({ ...breakdown, rows: [] });
    renderPage();

    expect(await screen.findAllByText('usage.empty')).toHaveLength(2);
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('surfaces a failed load', async () => {
    mocks.summary.mockRejectedValue(new Error('Boom'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('usage.loadFailed');
    expect(alert).toHaveTextContent('Boom');
  });
});
