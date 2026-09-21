import type { Application } from '@nocobase/app-server';
import { databaseManagerToken } from '@nocobase/db';
import type { AppCommandContext, AppCommandRuntime } from './context.js';
import {
  AppDatabaseTaskError,
  type AppDatabaseConfig,
  runAppDatabaseTasks,
  type AppDatabaseTaskKind,
  type AppDatabaseTasksResult,
} from '@nocobase/app-server/database';
import type { AppDatabaseTask } from '@nocobase/app-server/database';
import { createInterface } from 'node:readline/promises';

/** Keep single-connection JSON fields compatible while exposing per-connection bulk results. */
export async function runDatabaseCommand(
  command: {
    log(message: string): void;
    logJson(value: unknown): void;
    exit(code: number): never;
  },
  kind: AppDatabaseTaskKind,
  flags: {
    json: boolean;
    all: boolean;
    connection?: string;
    fresh?: boolean;
    force?: boolean;
  },
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
): Promise<void> {
  if (flags.force && !flags.fresh) {
    command.log('--force can only be used together with --fresh.');
    command.exit(1);
    return;
  }
  if (
    flags.fresh &&
    !flags.force &&
    (Boolean(process.env.CI) || !process.stdin.isTTY || !process.stdout.isTTY)
  ) {
    command.log(
      '--fresh requires --force in CI or a non-interactive terminal.',
    );
    command.exit(1);
    return;
  }
  let result: AppDatabaseTasksResult | undefined;
  let runtime: AppCommandRuntime | undefined;
  let app: Application | undefined;
  try {
    runtime = await context.loadRuntime();
    let failure: unknown;
    let failed = false;
    try {
      app = await context.createApp(runtime);
      app.registerProviders();
      result = await runAppDatabaseTasks(
        app.config.get<AppDatabaseConfig>('database')!,
        {
          paths: app.paths,
          runtimeConfig: app.config,
          container: app.container,
          // Plugin migrations and seeds are resolved from the registered plugins,
          // never from config.yml, so they cannot be configured away.
          contributions: app.databaseTaskContributions,
          database: () => app!.container.resolve(databaseManagerToken),
          kind,
          all: flags.all,
          connection: flags.connection,
          ...(flags.fresh
            ? {
                fresh: true,
                confirmFresh: flags.force
                  ? undefined
                  : (plan: readonly AppDatabaseTask[]) =>
                      confirmFresh(command, plan),
              }
            : {}),
        },
      );
    } catch (error) {
      failed = true;
      failure = error;
    }
    // A factory may bind runtime.app before throwing. Dispose partial assembly too.
    const cleanupErrors: unknown[] = [];
    try {
      await (app ?? runtime.app)?.shutdown();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await runtime.scope.destroy();
    } catch (error) {
      cleanupErrors.push(error);
    }
    delete runtime.app;
    if (failed && cleanupErrors.length) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        `${failure instanceof Error ? failure.message : String(failure)}; application cleanup also failed`,
        { cause: failure },
      );
    }
    if (failed) throw failure;
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Application cleanup failed');
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
  if (!result) throw new Error('Database task returned no result.');
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
              ...(entry.fresh ? { fresh: true } : {}),
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
      if (entry.fresh) command.log('Fresh: true');
    }
  }
  if (!result.ok) command.exit(1);
}

async function confirmFresh(
  command: { log(message: string): void },
  plan: readonly AppDatabaseTask[],
): Promise<boolean> {
  if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      '--fresh requires --force in CI or a non-interactive terminal.',
    );
  }
  const targets = plan
    .filter((task) => !task.skipReason)
    .map((task) => task.connection);
  const skipped = plan
    .filter((task) => task.skipReason)
    .map((task) => `${task.connection} (${task.skipReason})`);
  command.log(
    `WARNING: --fresh will delete all managed schema objects for: ${targets.join(', ') || 'none'}.`,
  );
  if (skipped.length) command.log(`Skipped: ${skipped.join(', ')}.`);
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await prompt.question('Type "yes" to continue: '))
      .trim()
      .toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    prompt.close();
  }
}
