import { AppCommand, appContextOf } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  collectionsRefreshAllowed,
  runDatabaseApplyCommand,
  type DatabaseCommandResult,
} from '../../database-command.ts';

export default class AppDbApply extends AppCommand {
  static override summary = 'Apply pending database migrations and seeds.';
  static override description =
    'Runs both in one plan, the same order startup runs them: each connection is migrated, then seeded. Only pending tasks run, so repeating it is safe. Runs the default connection unless --connection or --all is specified. Plugins belong to the default connection. Stops on the first failure. To discard the current schema and start over, use "db reset".';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics --json',
    '<%= config.bin %> <%= command.id %> --all',
  ];

  static override flags: {
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    collections: Interfaces.BooleanFlag<boolean>;
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
  };

  public async run(): Promise<DatabaseCommandResult> {
    const { flags } = await this.parse(AppDbApply);
    const result = await runDatabaseApplyCommand(
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
