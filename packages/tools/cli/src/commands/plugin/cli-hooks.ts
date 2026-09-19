import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { collectCliHooks, type ResolvedCliHooks } from '../../lib/cli-hooks.ts';
import {
  APP_BUILD_HOOK_STAGES,
  APP_DEV_HOOK_STAGES,
} from '../../plugins/types.ts';
import { registeredPlugins } from '../../runtime/command-store.ts';

export default class PluginCliHooks extends Command {
  static override summary =
    'List the build and dev hooks the registered plugins declare.';
  static override description =
    "Reports, for each stage of an application's build and dev run, the commands its plugins have asked to run. `pnpm build` and `pnpm dev` call this to discover them; run it by hand to see what they will do before running either.";

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PluginCliHooks);
    const hooks: ResolvedCliHooks = collectCliHooks(registeredPlugins());

    if (flags.json) {
      this.logJson({ ok: true, ...hooks });
      return;
    }

    const total =
      APP_BUILD_HOOK_STAGES.reduce(
        (count, stage) => count + hooks.build[stage].length,
        0,
      ) +
      APP_DEV_HOOK_STAGES.reduce(
        (count, stage) => count + hooks.dev[stage].length,
        0,
      );
    // Declaring none is the ordinary case rather than a problem: most plugins contribute commands alone, and an
    // application whose plugins all do builds and dev runs exactly as it did before hooks existed.
    if (total === 0) {
      this.log('No plugin declares a build or dev hook.');
      return;
    }

    for (const stage of APP_BUILD_HOOK_STAGES) {
      this.printStage(stage, hooks.build[stage]);
    }
    for (const stage of APP_DEV_HOOK_STAGES) {
      this.printStage(stage, hooks.dev[stage]);
    }
  }

  private printStage(
    stage: string,
    hooks: readonly {
      label: string;
      command: readonly string[];
      packageName: string;
    }[],
  ): void {
    if (hooks.length === 0) {
      return;
    }
    this.log(stage);
    for (const hook of hooks) {
      this.log(`  ${hook.label}`);
      this.log(`    ${hook.command.join(' ')}  (${hook.packageName})`);
    }
  }
}
