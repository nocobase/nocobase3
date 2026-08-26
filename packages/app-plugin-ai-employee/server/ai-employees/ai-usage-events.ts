/**
 * AI usage events are deferred to a later phase of the NocoBase 3 migration.
 * This module keeps the `addMessages` call site compiling with the same shape
 * with an in-process no-op sink.
 *
 * Behavior note: telemetry only — the AI conversation/message writes are not
 * affected by this no-op.
 */
import type { DatabaseConnection } from '@nocobase/app-database';
import type { Context } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';

export async function recordAIUsageEventsForMessages(
  _ctx: Context,
  _sessionId: string,
  _messages: any[],
  _transaction?: DatabaseConnection,
): Promise<void> {
  return;
}

export type AIUsageEventLogger = Logger;
