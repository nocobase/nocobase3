import type { Application } from '@nocobase/app-server';
import { Command } from '@oclif/core';
import type { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';

import { createDefaultCommandContext } from './default-context.ts';
import { applicationState } from './runtime/command-store.ts';

export type AppCommandRuntime = Awaited<
  ReturnType<typeof resolveStandaloneAppRuntime>
>;
export interface AppCommandContext {
  readonly createApp: (
    runtime: AppCommandRuntime,
  ) => Application | Promise<Application>;
  readonly rootDir: string;
  readonly loadRuntime: () => Promise<AppCommandRuntime>;
}

/**
 * A command that acts on the application the CLI runs in.
 *
 * The application is the one the runner located, and its runtime and `createApp` are loaded by convention from
 * `server/runtime` and `server/app` only when a command asks. A subclass may pin `appContext` instead, which is how
 * tests point a command at a fixture.
 */
export class AppCommand extends Command {
  override async run(): Promise<void> {
    throw new Error('No application command implementation was selected.');
  }
  static appContext: AppCommandContext | undefined;
  protected get appContext(): AppCommandContext {
    const pinned = (this.constructor as typeof AppCommand).appContext;
    if (pinned) return pinned;
    const { location } = applicationState();
    if (location.kind === 'none') {
      throw new Error(
        `${location.root} is not a NocoBase application: no package.json above it declares nocobase.templateKind or nocobase.buildTarget.`,
      );
    }
    return createDefaultCommandContext({ rootDir: location.root });
  }
}
