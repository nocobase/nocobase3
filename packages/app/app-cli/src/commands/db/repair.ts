import { AppCommand, appContextOf } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  runDatabaseRepairCommand,
  type DatabaseCommandResult,
} from '../../database-command.ts';

export default class AppDbRepair extends AppCommand {
  static override summary =
    'Realign recorded migration and seed checksums with the current sources.';
  static override description =
    'Rewrites the checksum stored for each executed migration and seed whose source has since changed, clearing the drift that a run reports. It executes nothing and changes no schema or data. History records with no matching source are left untouched, because removing one would let the task run again. Preview with --dry-run before writing.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --all --force --json',
  ];

  static override flags: {
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    'dry-run': Interfaces.BooleanFlag<boolean>;
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
    'dry-run': Flags.boolean({
      default: false,
      description: 'Report what would be rewritten without writing anything.',
    }),
    force: Flags.boolean({
      default: false,
      description: 'Skip the confirmation prompt.',
    }),
  };

  public async run(): Promise<DatabaseCommandResult> {
    const { flags } = await this.parse(AppDbRepair);
    const result = await runDatabaseRepairCommand(
      this,
      { ...flags, dryRun: flags['dry-run'] },
      appContextOf(this),
    );
    if (result.state === 'not-configured') this.setStatus('success-noop');
    return result;
  }
}
