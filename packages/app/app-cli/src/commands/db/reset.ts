import { AppCommand } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { runDatabaseApplyCommand } from '../../database-command.ts';

export default class AppDbReset extends AppCommand {
  static override summary =
    'Delete every managed schema object, then apply all migrations and seeds.';
  static override description =
    'Destructive. Each connection has its managed schema dropped and is then migrated and seeded from empty, so every row in a managed table is lost. Prompts before doing anything, and requires --force in CI or a non-interactive terminal. External connections are skipped. Use "db apply" to run only what is pending.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics',
    '<%= config.bin %> <%= command.id %> --all --force',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    force: Interfaces.BooleanFlag<boolean>;
  } = {
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
    all: Flags.boolean({
      default: false,
      exclusive: ['connection'],
      description:
        'Run all managed connections; report external connections as skipped.',
    }),
    connection: Flags.string({
      exclusive: ['all'],
      description: 'Target a named managed connection, regardless of autoRun.',
    }),
    force: Flags.boolean({
      default: false,
      description: 'Skip the confirmation prompt.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDbReset);
    await runDatabaseApplyCommand(
      {
        log: (message) => this.log(message),
        logJson: (value) => this.logJson(value),
        exit: (code) => this.exit(code),
      },
      { ...flags, fresh: true },
      this.appContext,
    );
  }
}
