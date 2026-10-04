import { parseApiInput } from '@nocobase/app-server/router';
import type { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { z } from 'zod';

import type { ServiceFactory } from '../factory/service-factory.js';
import type { UsageStatisticsRequest } from '../service/ai-usage-statistics-service.js';
import type { AISettingsActor } from './settings-access.js';
import type { AIRouteGuards } from './settings-access.js';
import {
  UsageBreakdownQuery,
  UsageQuery,
  UsageSeriesQuery,
  UsageSummaryQuery,
} from './schemas.js';

/** `/aiEmployee/usage`: token usage across every user, read on the AI settings page. */
export function createAIUsageStatisticsRouter(
  app: Hono,
  services: ServiceFactory,
  { settings }: AIRouteGuards,
): void {
  app.get(
    '/aiEmployee/usage/summary',
    settings,
    validator('query', (value) => parseApiInput(UsageSummaryQuery, value)),
    async (context) => {
      const { compareShiftHours, ...query } = context.req.valid('query');
      const data = await services.usageStatisticsService.summary({
        ...usageRequest(context.var.aiSettingsActor, query),
        compareShiftHours,
      });
      return context.json({ data });
    },
  );

  app.get(
    '/aiEmployee/usage/series',
    settings,
    validator('query', (value) => parseApiInput(UsageSeriesQuery, value)),
    async (context) => {
      const { granularity, ...query } = context.req.valid('query');
      const data = await services.usageStatisticsService.series({
        ...usageRequest(context.var.aiSettingsActor, query),
        granularity,
      });
      return context.json({ data });
    },
  );

  app.get(
    '/aiEmployee/usage/breakdown',
    settings,
    validator('query', (value) => parseApiInput(UsageBreakdownQuery, value)),
    async (context) => {
      const { dimension, limit, ...query } = context.req.valid('query');
      const data = await services.usageStatisticsService.breakdown({
        ...usageRequest(context.var.aiSettingsActor, query),
        dimension,
        limit,
      });
      return context.json({ data });
    },
  );

  app.get(
    '/aiEmployee/usage/filterOptions',
    settings,
    validator('query', (value) => parseApiInput(UsageQuery, value)),
    async (context) => {
      const data = await services.usageStatisticsService.filterOptions(
        usageRequest(context.var.aiSettingsActor, context.req.valid('query')),
      );
      return context.json({ data });
    },
  );
}

function usageRequest(
  actor: AISettingsActor,
  query: z.infer<typeof UsageQuery>,
): UsageStatisticsRequest {
  return { actor, ...query };
}
