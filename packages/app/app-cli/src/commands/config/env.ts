import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { AppCommand } from '../../context.ts';
import { runConfigEnv } from '../../lib/config-env.ts';

export default class AppConfigEnv extends AppCommand {
  static override summary =
    'List the environment variables the application reads.';
  static override description =
    'Loads the application the way a start would, without starting it, and lists every environment variable it reads: the ones its configuration sections declare, each with the configuration path it sets, and the ones the runtime reads itself. Values are never printed, because many are secrets; each variable is marked set or not set in the environment the application would start with, .env files included. A variable an environment variable sets overrides the configuration file.';

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
    const { flags } = await this.parse(AppConfigEnv);
    const { variables } = await runConfigEnv({
      loadRuntime: () => this.appContext.loadRuntime(),
    });

    if (flags.json) {
      this.logJson({ ok: true, variables });
      return;
    }

    const width = Math.max(
      ...variables.map((variable) => variable.name.length),
    );
    for (const variable of variables) {
      this.log(
        `${variable.set ? '●' : '○'} ${variable.name.padEnd(width)}  ${
          variable.path ?? variable.description ?? ''
        }`,
      );
    }
    this.log('');
    this.log('● set in the environment   ○ not set');
  }
}
