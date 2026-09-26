import { AppCommand, appContextOf } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  generateAppCollectionsArtifact,
  type AppCollectionsArtifactConnectionResult,
  type AppCollectionsArtifactResult,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';

import { nocobaseCommand } from '../../command/invocation.ts';
import { CommandError } from '../../command/errors.ts';
import { withAppRuntime } from '../../command/lifecycle.ts';
import {
  connectionFailureMessage,
  quoteConnections,
  selectionArgs,
  toDatabaseCommandError,
} from '../../database-command.ts';

/** What `collections generate` returns, which is `result` under `--json`. */
export interface CollectionsGenerateResult {
  /** `not-configured` when no database is configured, so nothing was generated; absent otherwise. */
  readonly state?: 'not-configured';
  /** Whether this was a --check run, which compares and writes nothing. */
  readonly check: boolean;
  /** One entry per connection generated or checked. */
  readonly results: readonly AppCollectionsArtifactConnectionResult[];
}

export default class AppCollectionsGenerate extends AppCommand {
  static override summary = 'Write Collection artifacts from the database.';
  static override description =
    "Reads every Collection of the selected connections and writes collection.json, metadata.json and schema.json under database/<connection>/collections/<name>/, plus one _manifest.json per connection. The directory is a cache of what the database resolves to, for external connections too: it is gitignored, safe to delete, and nothing reads it back. Migrations stay the authority on schema; an external connection's hand-written metadata lives in database/<connection>/metadata/<name>.json, which this command reads and never writes. Runs the default connection unless --connection or --all is specified.";

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --connection analytics',
    '<%= config.bin %> <%= command.id %> --all --check',
  ];

  static override flags: {
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    check: Interfaces.BooleanFlag<boolean>;
  } = {
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

  public async run(): Promise<CollectionsGenerateResult> {
    const { flags } = await this.parse(AppCollectionsGenerate);
    let result: AppCollectionsArtifactResult;
    try {
      result = await withAppRuntime(
        appContextOf(this),
        (runtime) =>
          generateAppCollectionsArtifact(
            runtime.config.get<AppDatabaseConfig>('database')!,
            {
              paths: runtime.paths,
              connection: flags.connection,
              all: flags.all,
              check: flags.check,
            },
          ),
        { onCleanupFailure: (error) => this.warn(error.message) },
      );
    } catch (error) {
      throw toDatabaseCommandError(error, flags.connection);
    }

    this.report(result);

    const failed = result.results.filter((entry) => entry.status === 'failed');
    if (failed.length) {
      throw new CommandError(
        connectionFailureMessage(
          'Could not generate the Collection artifacts of',
          failed,
        ),
        {
          code: 'COLLECTIONS_CONNECTION_FAILED',
          details: {
            connections: failed.map((entry) => entry.connection),
            check: result.check,
            results: result.results,
          },
        },
      );
    }
    const stale = result.results.filter((entry) => entry.status === 'stale');
    if (stale.length) {
      throw new CommandError(
        `The Collection artifacts of ${quoteConnections(stale.map((entry) => entry.connection))} differ from the database.`,
        {
          code: 'COLLECTIONS_STALE',
          suggestions: [
            {
              message: 'Run without --check to write them:',
              run: nocobaseCommand([
                'collections',
                'generate',
                ...selectionArgs(flags),
              ]),
            },
          ],
          details: {
            connections: stale.map((entry) => entry.connection),
            check: result.check,
            results: result.results,
          },
        },
      );
    }

    if (result.status === 'not-configured') {
      this.setStatus('success-noop');
      return { state: 'not-configured', check: result.check, results: [] };
    }
    return { check: result.check, results: result.results };
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
      if (entry.unusedMetadata?.length)
        this.log(
          `  Metadata for Collections the database does not have: ${entry.unusedMetadata.join(', ')}. Fix or remove them in the connection's metadata directory.`,
        );
      if (entry.differences) {
        if (entry.differences.length === 0) this.log('  Up to date.');
        else if (entry.directoryExists === false) {
          // Nothing has been generated for this connection yet, so every
          // expected file is missing. Naming them one per line says that
          // three times per Collection; the count and the command say it
          // once, and --json still carries the list.
          this.log(
            `  Not generated yet: ${entry.differences.length} files to write. Run without --check to write them.`,
          );
        } else {
          for (const difference of entry.differences) {
            this.log(`  ${difference.kind}: ${difference.path}`);
          }
        }
      }
    }
  }
}
