import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import path from 'node:path';

import { runAppSeeds, databaseConfig } from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';

import appRuntime from '../../server/runtime.js';

export default class AppSeed extends Command {
  static override summary = 'Run pending database seeds.';
  static override description =
    'Resolves this application runtime and applies every seed the application and its plugins declare.';

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
    const { flags } = await this.parse(AppSeed);
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: path.resolve(import.meta.dirname, '..', '..'),
    });
    const result = await runAppSeeds(
      runtime.appConfig.get(databaseConfig),
      runtime.configPaths,
    );

    if (!result) {
      if (flags.json) {
        this.logJson({ ok: true, status: 'not-configured' });
        return;
      }
      this.log('No database seeder is configured.');
      return;
    }

    if (result.status === 'skipped') {
      if (flags.json) {
        this.logJson({ ok: true, status: 'skipped', reason: result.reason });
        return;
      }
      this.log(`Database seeds skipped: ${result.reason}.`);
      return;
    }

    if (flags.json) {
      this.logJson({
        ok: true,
        status: 'completed',
        executed: result.executed ?? [],
        skipped: result.skipped ?? [],
      });
      return;
    }

    this.log('Database seeds completed.');
    this.logNames('Executed', result.executed ?? []);
    this.logNames('Skipped', result.skipped ?? []);
  }

  private logNames(label: string, names: readonly string[]): void {
    if (names.length === 0) {
      this.log(`${label}: none`);
      return;
    }
    this.log(`${label}:`);
    for (const name of names) {
      this.log(`- ${name}`);
    }
  }
}
