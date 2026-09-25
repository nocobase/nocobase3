import { AppCommand } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import { runDatabaseUnlockCommand } from '../../database-command.ts';

export default class AppDbUnlock extends AppCommand {
  static override summary =
    'Report and release the migration and seed locks a killed run left behind.';
  static override description =
    'A run holds its lock only while it is sending heartbeats, so a killed run stops holding it and the next run takes it over on its own. Use this when waiting is not wanted, or to see who holds one. A lock that is still beating is reported rather than released; --force releases it anyway, which lets a second run start beside the first. Covers both the migration and the seed lock for the selected connections.';

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
      description: 'Release a lock that is still sending heartbeats.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDbUnlock);
    await runDatabaseUnlockCommand(
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
