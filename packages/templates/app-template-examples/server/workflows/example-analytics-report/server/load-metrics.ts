import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
import { requireCount, requireDate, type DailyMetrics } from './metrics.js';

export async function loadMetrics(
  database: DatabaseManager,
  dateInput: unknown,
): Promise<DailyMetrics> {
  const date = requireDate(dateInput);
  // Aggregate in the source database instead of persisting unbounded rows in a node result.
  const row = await database
    .query('analytics')
    .selectFrom('dailyMetrics')
    .where('date', '=', date)
    .select((eb) => [
      eb.fn.countAll().as('count'),
      ...[
        'impressions',
        'clicks',
        'conversions',
        'spendCents',
        'revenueCents',
      ].map((field) => eb.fn.sum(field).as(field)),
    ])
    .executeTakeFirst();
  return {
    date,
    count: requireCount(row?.count),
    impressions: requireCount(row?.impressions),
    clicks: requireCount(row?.clicks),
    conversions: requireCount(row?.conversions),
    spendCents: requireCount(row?.spendCents),
    revenueCents: requireCount(row?.revenueCents),
  };
}
export const run: WorkflowRunFunction = async (input, options) => {
  options.signal.throwIfAborted();
  const date = (input as { date?: unknown } | null)?.date;
  const result = await loadMetrics(
    options.services.resolve(databaseManagerToken),
    date,
  );
  options.signal.throwIfAborted();
  options.logger.info('Analytics metrics loaded', {
    date: result.date,
    count: result.count,
  });
  return result;
};
