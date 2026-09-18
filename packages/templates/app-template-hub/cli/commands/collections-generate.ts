import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import path from 'node:path';

import {
  generateAppCollectionsArtifact,
  type AppCollectionsArtifactResult,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import appRuntime from '../../server/runtime.js';

export default class AppCollectionsGenerate extends Command {
  static override summary = 'Write Collection artifacts from the database.';
  static override description =
    'Reads every Collection of a managed connection and writes collection.json, metadata.json and schema.json under database/<connection>/collections/<name>/, plus one _manifest.json per connection. The files are derived: migrations stay the only authority on schema and nothing reads them back at runtime. Runs the default connection unless --connection or --all is specified; external connections are included and record no migration head.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics',
    '<%= config.bin %> <%= command.id %> --all --check',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    check: Interfaces.BooleanFlag<boolean>;
  } = {
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
    all: Flags.boolean({
      default: false,
      exclusive: ['connection'],
      description: 'Run every configured connection, external ones included.',
    }),
    connection: Flags.string({
      exclusive: ['all'],
      description: 'Target a named connection.',
    }),
    check: Flags.boolean({
      default: false,
      description:
        'Compare the generated result with the files on disk and exit non-zero on any difference; writes nothing.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppCollectionsGenerate);
    let result: AppCollectionsArtifactResult;
    try {
      const runtime = await resolveStandaloneAppRuntime(appRuntime, {
        rootDir: path.resolve(import.meta.dirname, '..', '..'),
      });
      result = await generateAppCollectionsArtifact(
        runtime.config.get<AppDatabaseConfig>('database')!,
        {
          paths: runtime.paths,
          connection: flags.connection,
          all: flags.all,
          check: flags.check,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (flags.json)
        this.logJson({ ok: false, status: 'failed', error: message });
      else this.log(message);
      this.exit(1);
      return;
    }

    if (flags.json) this.logJson(result);
    else this.report(result);
    if (!result.ok) this.exit(1);
  }

  private report(result: AppCollectionsArtifactResult): void {
    if (result.status === 'not-configured') {
      this.log('No database is configured.');
      return;
    }
    for (const entry of result.results) {
      this.log(
        `[${entry.connection}] collections: ${entry.status}${entry.error ? `: ${entry.error}` : ''}`,
      );
      if (entry.manifest) {
        this.log(
          `  Schema management: ${entry.manifest.schemaManagement}; migration head: ${entry.manifest.migrationHead ?? 'none'}`,
        );
        this.log(
          `  Collections: ${entry.manifest.collections.join(', ') || 'none'}`,
        );
      }
      if (entry.written?.length)
        this.log(`  Written: ${entry.written.join(', ')}`);
      if (entry.deleted?.length)
        this.log(`  Deleted: ${entry.deleted.join(', ')}`);
      if (entry.unchanged) this.log(`  Unchanged: ${entry.unchanged}`);
      if (entry.differences) {
        if (entry.differences.length === 0) this.log('  Up to date.');
        for (const difference of entry.differences) {
          this.log(`  ${difference.kind}: ${difference.path}`);
        }
      }
    }
  }
}
