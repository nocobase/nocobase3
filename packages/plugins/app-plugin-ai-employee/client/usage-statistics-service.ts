import type { ApiClient } from '@nocobase/app-client';

import { aiPath, requestAI, type AIRequestQuery } from './api-client.js';

export interface UsageTotals {
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  toolCallCount: number;
  autoToolCallCount: number;
}

export interface UsageRange {
  start: number;
  end: number;
  timezoneOffsetHours: number;
}

export interface UsageSummary {
  range: UsageRange;
  totals: UsageTotals;
  previous: UsageTotals;
  previousRange: { start: number; end: number };
}

export interface UsageSeriesBucket extends UsageTotals {
  start: number;
}

export type UsageGranularity = 'hour' | 'day' | 'week' | 'month';

export interface UsageSeries {
  range: UsageRange;
  granularity: UsageGranularity;
  buckets: UsageSeriesBucket[];
}

export const USAGE_BREAKDOWN_DIMENSIONS = [
  'model',
  'aiEmployeeUsername',
  'userId',
] as const;

export type UsageBreakdownDimension =
  (typeof USAGE_BREAKDOWN_DIMENSIONS)[number];

export interface UsageBreakdownRow extends UsageTotals {
  key: string;
  label: string;
}

export interface UsageBreakdown {
  range: UsageRange;
  dimension: UsageBreakdownDimension;
  rows: UsageBreakdownRow[];
  totals: UsageTotals;
}

export interface UsageFilterOption {
  value: string;
  label: string;
}

export interface UsageFilterOptions {
  range: UsageRange;
  models: UsageFilterOption[];
  aiEmployees: UsageFilterOption[];
}

export interface UsageQuery {
  /** Inclusive range start, epoch milliseconds. */
  start: number;
  /** Inclusive range end, epoch milliseconds. */
  end: number;
  /** East-positive minutes, as `-new Date().getTimezoneOffset()` reports. */
  timezoneOffset: number;
  model?: string;
  aiEmployeeUsername?: string;
}

function toQuery(query: UsageQuery): AIRequestQuery {
  return {
    start: query.start,
    end: query.end,
    timezoneOffset: query.timezoneOffset,
    ...(query.model ? { model: query.model } : {}),
    ...(query.aiEmployeeUsername
      ? { aiEmployeeUsername: query.aiEmployeeUsername }
      : {}),
  };
}

export function fetchUsageSummary(
  api: ApiClient,
  query: UsageQuery & {
    /** Hours to move the comparison window back by; defaults to the range length. */
    compareShiftHours?: number;
  },
  signal?: AbortSignal,
): Promise<UsageSummary> {
  return requestAI(api, aiPath('aiEmployee', 'usage', 'summary'), {
    query: {
      ...toQuery(query),
      ...(query.compareShiftHours === undefined
        ? {}
        : { compareShiftHours: query.compareShiftHours }),
    },
    signal,
  });
}

export function fetchUsageSeries(
  api: ApiClient,
  query: UsageQuery,
  signal?: AbortSignal,
): Promise<UsageSeries> {
  return requestAI(api, aiPath('aiEmployee', 'usage', 'series'), {
    query: toQuery(query),
    signal,
  });
}

export function fetchUsageBreakdown(
  api: ApiClient,
  query: UsageQuery & { dimension: UsageBreakdownDimension; limit?: number },
  signal?: AbortSignal,
): Promise<UsageBreakdown> {
  return requestAI(api, aiPath('aiEmployee', 'usage', 'breakdown'), {
    query: {
      ...toQuery(query),
      dimension: query.dimension,
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    },
    signal,
  });
}

export function fetchUsageFilterOptions(
  api: ApiClient,
  query: UsageQuery,
  signal?: AbortSignal,
): Promise<UsageFilterOptions> {
  // Options describe the whole range, so the current selection is not applied.
  return requestAI(api, aiPath('aiEmployee', 'usage', 'filterOptions'), {
    query: {
      start: query.start,
      end: query.end,
      timezoneOffset: query.timezoneOffset,
    },
    signal,
  });
}
