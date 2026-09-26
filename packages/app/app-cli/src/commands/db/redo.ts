import { AppCommand, appContextOf } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  databaseRunChangedNothing,
  collectionsRefreshAllowed,
  runDatabaseRedoCommand,
  type DatabaseCommandResult,
} from '../../database-command.ts';

export default class AppDbRedo extends AppCommand {
  static override summary =
    'Roll back the latest migration batch and apply it again.';
  static override description =
    'What correcting a migration before its branch is merged needs: an executed migration is already recorded, so editing it and running "db apply" changes nothing. Rolls the batch back, then applies migrations and seeds the way "db apply" does. Destructive in the same way "db rollback" is, and confirms the same way; --dry-run shows the plan instead. Once the branch is merged, write a new migration instead.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> --dry-run --json',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics',
  ];

  static override flags: {
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    collections: Interfaces.BooleanFlag<boolean>;
    force: Interfaces.BooleanFlag<boolean>;
    'dry-run': Interfaces.BooleanFlag<boolean>;
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
    'dry-run': Flags.boolean({
      default: false,
      description:
        'Report what would run, as a plan, without changing anything.',
    }),
  };

  public async run(): Promise<DatabaseCommandResult> {
    const { flags } = await this.parse(AppDbRedo);
    const result = await runDatabaseRedoCommand(
      this,
      {
        ...flags,
        dryRun: flags['dry-run'],
        collections: flags.collections && collectionsRefreshAllowed(),
      },
      appContextOf(this),
    );
    if (databaseRunChangedNothing(result)) this.setStatus('success-noop');
    return result;
  }
}
