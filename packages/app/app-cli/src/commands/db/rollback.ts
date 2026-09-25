import { AppCommand } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { runDatabaseRollbackCommand } from '../../database-command.ts';

export default class AppDbRollback extends AppCommand {
  static override summary = 'Roll back the latest migration batch.';
  static override description =
    'Runs down() for every migration in the batch, newest first, and deletes its history records. The batch is the unit the history records, so a batch that mixed application and plugin migrations rolls back as one; the confirmation names every migration and its package first. Destructive: data in anything those migrations drop is lost, and seeds are not re-run. Requires --force in CI or a non-interactive terminal. Fails if any migration in the batch is irreversible or has no down(). Use "db redo" to roll back and apply again.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics',
    '<%= config.bin %> <%= command.id %> --force --json',
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
    const { flags } = await this.parse(AppDbRollback);
    await runDatabaseRollbackCommand(
      {
        log: (message) => this.log(message),
        logJson: (value) => this.logJson(value),
        exit: (code) => this.exit(code),
      },
      flags,
      this.appContext,
    );
  }
}
