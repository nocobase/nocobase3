import { AppCommand } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { runDatabaseRedoCommand } from '../../database-command.ts';

export default class AppDbRedo extends AppCommand {
  static override summary =
    'Roll back the latest migration batch and apply it again.';
  static override description =
    'What correcting a migration before its branch is merged needs: an executed migration is already recorded, so editing it and running "db apply" changes nothing. Rolls the batch back, then applies migrations and seeds the way "db apply" does. Destructive in the same way "db rollback" is, and confirms the same way. Once the branch is merged, write a new migration instead.';

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
    const { flags } = await this.parse(AppDbRedo);
    await runDatabaseRedoCommand(
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
