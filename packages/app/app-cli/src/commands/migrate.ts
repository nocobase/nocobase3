import { AppCommand } from '../context.js';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { runDatabaseCommand } from '../database-command.js';

export default class AppMigrate extends AppCommand {
  static override summary = 'Run pending database migrations.';
  static override description =
    'Runs the default connection unless --connection or --all is specified. Plugins belong to the default connection. Stops on the first failure.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics --json',
    '<%= config.bin %> <%= command.id %> --all',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    fresh: Interfaces.BooleanFlag<boolean>;
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
    fresh: Flags.boolean({
      default: false,
      description: 'Clear managed schema objects and rerun all migrations.',
    }),
    force: Flags.boolean({
      default: false,
      description: 'Skip the confirmation required by --fresh.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppMigrate);
    await runDatabaseCommand(
      {
        log: (message) => this.log(message),
        logJson: (value) => this.logJson(value),
        exit: (code) => this.exit(code),
      },
      'migrations',
      flags,
      async () => this.appContext.loadRuntime(),
    );
  }
}
