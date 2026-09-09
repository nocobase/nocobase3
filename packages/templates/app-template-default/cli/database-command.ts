import {
  AppDatabaseTaskError,
  databaseConfig,
  runAppDatabaseTasks,
  type AppDatabaseTaskKind,
  type AppDatabaseTasksResult,
} from '@nocobase/app-server/database';
import type {
  AppConfigAccessor,
  ConfigPaths,
} from '@nocobase/app-server/config';

/** Keep single-connection JSON fields compatible while exposing per-connection bulk results. */
export async function runDatabaseCommand(
  command: {
    log(message: string): void;
    logJson(value: unknown): void;
    exit(code: number): never;
  },
  kind: AppDatabaseTaskKind,
  flags: { json: boolean; all: boolean; connection?: string },
  resolveRuntime: () => Promise<{
    appConfig: AppConfigAccessor;
    configPaths: ConfigPaths;
  }>,
): Promise<void> {
  let result: AppDatabaseTasksResult;
  try {
    const runtime = await resolveRuntime();
    result = await runAppDatabaseTasks(
      runtime.appConfig.get(databaseConfig),
      runtime.configPaths,
      { kind, ...flags },
    );
  } catch (error) {
    if (!(error instanceof AppDatabaseTaskError)) {
      if (flags.json)
        command.logJson({
          ok: false,
          status: 'failed',
          connection: flags.connection,
          error: error instanceof Error ? error.message : String(error),
        });
      else command.log(error instanceof Error ? error.message : String(error));
      command.exit(1);
      return;
    }
    result = error.result;
  }
  if (flags.json) {
    if (flags.all || !result.ok) command.logJson(result);
    else if (!result.results.length)
      command.logJson({ ok: true, status: 'not-configured' });
    else {
      const entry = result.results[0];
      command.logJson({
        ok: true,
        connection: entry.connection,
        status: entry.status,
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.status === 'completed'
          ? {
              ...(kind === 'migrations' ? { batch: entry.batch ?? 0 } : {}),
              executed: entry.executed ?? [],
              skipped: entry.skipped ?? [],
            }
          : {}),
      });
    }
  } else {
    if (!result.results.length) command.log('No database is configured.');
    for (const entry of result.results) {
      command.log(
        `[${entry.connection}] ${kind}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}${entry.error ? `: ${entry.error}` : ''}`,
      );
      if (entry.batch !== undefined) command.log(`Batch: ${entry.batch}`);
      if (entry.executed)
        command.log(`Executed: ${entry.executed.join(', ') || 'none'}`);
      if (entry.skipped)
        command.log(`Skipped: ${entry.skipped.join(', ') || 'none'}`);
    }
  }
  if (!result.ok) command.exit(1);
}
