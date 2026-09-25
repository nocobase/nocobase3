// Loading an application for a command, and always putting it away again.
//
// The order matters and is easy to get wrong by hand, which is why commands reach it only through these two
// functions: shut the application down — including one a failing `createApp` left half-built on `runtime.app` — then
// destroy the runtime scope, and report a cleanup failure without hiding the failure that caused it.
import type { Application } from '@nocobase/app-server';

import type { AppCommandContext, AppCommandRuntime } from '../context.ts';

/** Loads the runtime without creating the application, runs `fn`, then destroys the runtime scope. */
export async function withAppRuntime<T>(
  context: Pick<AppCommandContext, 'loadRuntime'>,
  fn: (runtime: AppCommandRuntime) => Promise<T>,
): Promise<T> {
  const runtime = await context.loadRuntime();
  return settle(
    () => fn(runtime),
    () => [() => runtime.scope.destroy()],
  );
}

/**
 * Loads the runtime, creates the application, runs `fn`, then shuts the application down and destroys the scope. The
 * application is created, not started: `fn` registers providers or starts it when it needs to.
 */
export async function withAppInstance<T>(
  context: Pick<AppCommandContext, 'loadRuntime' | 'createApp'>,
  fn: (app: Application, runtime: AppCommandRuntime) => Promise<T>,
): Promise<T> {
  const runtime = await context.loadRuntime();
  let app: Application | undefined;
  return settle(
    async () => {
      app = await context.createApp(runtime);
      return fn(app, runtime);
    },
    () => [
      // A factory may bind runtime.app before throwing; dispose partial assembly too.
      async () => (app ?? runtime.app)?.shutdown(),
      () => runtime.scope.destroy(),
      async () => {
        delete (runtime as { app?: unknown }).app;
      },
    ],
  );
}

async function settle<T>(
  work: () => Promise<T>,
  cleanup: () => readonly (() => Promise<unknown>)[],
): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  let failed = false;
  try {
    result = await work();
  } catch (error) {
    failed = true;
    failure = error;
  }
  const cleanupErrors: unknown[] = [];
  for (const step of cleanup()) {
    try {
      await step();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (failed && cleanupErrors.length > 0) {
    throw new AggregateError(
      [failure, ...cleanupErrors],
      `${failure instanceof Error ? failure.message : String(failure)}; application cleanup also failed`,
      { cause: failure },
    );
  }
  if (failed) throw failure;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Application cleanup failed');
  }
  return result as T;
}
