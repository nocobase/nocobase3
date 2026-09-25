import { AppCommand, appContextOf } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  collectionsRefreshAllowed,
  runDatabaseRollbackCommand,
  type DatabaseCommandResult,
} from '../../database-command.ts';

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
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    collections: Interfaces.BooleanFlag<boolean>;
    force: Interfaces.BooleanFlag<boolean>;
  } = {
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
    collections: Flags.boolean({
      default: true,
      allowNo: true,
      description:
        'Refresh the gitignored Collection cache under database/<connection>/collections/ for each connection whose migrations changed. Use --no-collections to skip it. Never written in a built dist/.',
    }),
    force: Flags.boolean({
      default: false,
      description: 'Skip the confirmation prompt.',
    }),
  };

  public async run(): Promise<DatabaseCommandResult> {
    const { flags } = await this.parse(AppDbRollback);
    const result = await runDatabaseRollbackCommand(
      this,
      {
        ...flags,
        collections: flags.collections && collectionsRefreshAllowed(),
      },
      appContextOf(this),
    );
    if (result.state === 'not-configured') this.setStatus('success-noop');
    return result;
  }
}
