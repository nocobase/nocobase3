import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { requireCount, requireDate, type DailyReport } from './metrics.js';

export function calculateReport(input: unknown): DailyReport {
  if (!input || typeof input !== 'object')
    throw new Error('Metrics are required.');
  const metrics = input as Record<string, unknown>;
  if (requireCount(metrics.count) === 0)
    throw new Error('Cannot calculate a report without metrics.');
  const spendCents = requireCount(metrics.spendCents);
  const revenueCents = requireCount(metrics.revenueCents);
  return {
    date: requireDate(metrics.date),
    impressions: requireCount(metrics.impressions),
    clicks: requireCount(metrics.clicks),
    conversions: requireCount(metrics.conversions),
    spendCents,
    revenueCents,
    profitCents: revenueCents - spendCents,
  };
}
export const run: WorkflowRunFunction = (input, options) => {
  options.signal.throwIfAborted();
  return calculateReport((input as { metrics?: unknown } | null)?.metrics);
};
