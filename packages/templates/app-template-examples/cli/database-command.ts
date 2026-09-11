import {
  AppDatabaseTaskError,
  databaseConfig,
  runAppDatabaseTasks,
  type AppDatabaseTaskKind,
  type AppDatabaseTasksResult,
} from '@nocobase/app-server/database';
import type { AppDatabaseTask } from '@nocobase/app-server/database';
import type {
  AppConfigAccessor,
  ConfigPaths,
} from '@nocobase/app-server/config';
import '../server/database-drivers.js';
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
  resolveRuntime: () => Promise<{
    appConfig: AppConfigAccessor;
    configPaths: ConfigPaths;
  }>,
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
  let result: AppDatabaseTasksResult;
  try {
    const runtime = await resolveRuntime();
    result = await runAppDatabaseTasks(
      runtime.appConfig.get(databaseConfig),
      runtime.configPaths,
      {
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
