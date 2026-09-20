import { Command } from '@oclif/core';
import type { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
export type AppCommandRuntime = Awaited<
  ReturnType<typeof resolveStandaloneAppRuntime>
>;
export interface AppCommandContext {
  readonly rootDir: string;
  readonly loadRuntime: () => Promise<AppCommandRuntime>;
}
export class AppCommand extends Command {
  override async run(): Promise<void> {
    throw new Error('No application command implementation was selected.');
  }
  static appContext: AppCommandContext | undefined;
  protected get appContext(): AppCommandContext {
    const context = (this.constructor as typeof AppCommand).appContext;
    if (!context) throw new Error('Application CLI context was not provided.');
    return context;
  }
}
