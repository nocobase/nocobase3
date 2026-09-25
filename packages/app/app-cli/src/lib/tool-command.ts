// Shared by the commands that run a development or build script against the application.
import { Command } from '@oclif/core';

import { applicationState } from '../runtime/command-store.ts';
import { runAppTool, type AppTool } from '../tools/run-tool.ts';
import { collectCliHooks } from './cli-hooks.ts';

export interface ToolCommandOptions {
  /** Hand the plugins' build and dev hooks to the script. */
  readonly hooks?: boolean;
  /** Node options for the script, such as a loader. */
  readonly execArgv?: readonly string[];
}

/**
 * A command that forwards its arguments untouched to one script.
 *
 * The scripts parse their own options — `build --target`, `build retarget --node-version` — and print their own
 * usage, so the command does not declare flags it would only have to keep in step with them.
 */
export abstract class ToolCommand extends Command {
  static override strict = false;

  protected abstract readonly tool: AppTool;
  protected readonly toolOptions: ToolCommandOptions = {};

  override async run(): Promise<void> {
    const { location, loadPlugins } = applicationState();
    const env: Record<string, string> = {};
    if (this.toolOptions.hooks) {
      env['NOCOBASE_CLI_HOOKS'] = JSON.stringify(
        collectCliHooks(await loadPlugins()),
      );
    }
    const exitCode = await runAppTool(this.tool, {
      rootDir: location.root,
      args: this.argv,
      env,
      ...(this.toolOptions.execArgv === undefined
        ? {}
        : { execArgv: this.toolOptions.execArgv }),
    });
    if (exitCode !== 0) this.exit(exitCode);
  }
}
