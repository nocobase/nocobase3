import { AppCommand, appContextOf } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  runAppCollectionsDoctor,
  type AppCollectionsDoctorConnectionResult,
  type AppCollectionsDoctorResult,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';

import { nocobaseCommand } from '../../command/invocation.ts';
import { CommandError, type CommandSuggestion } from '../../command/errors.ts';
import { withAppRuntime } from '../../command/lifecycle.ts';
import {
  connectionFailureMessage,
  selectionArgs,
  toDatabaseCommandError,
} from '../../database-command.ts';

/** What `collections doctor` returns, which is `result` under `--json`. */
export interface CollectionsDoctorResult {
  /** `not-configured` when no database is configured, so nothing was checked; absent otherwise. */
  readonly state?: 'not-configured';
  /** Whether --fix deleted the records whose table is gone. */
  readonly fix: boolean;
  /** One entry per connection checked. */
  readonly results: readonly AppCollectionsDoctorConnectionResult[];
}

export default class CollectionsDoctor extends AppCommand {
  static override summary =
    'Compare stored Collection metadata with the schema behind it.';
  static override description =
    'The physical schema and the Collection metadata are two records of what exists. A table dropped outside a migration leaves its metadata record behind, and from then on resolving that Collection fails — including inside the migration that would recreate it. This reports every record that disagrees with its table, and --fix deletes the ones whose table is gone. Anything else is reported only: the table is there and something in it no longer matches, which a migration has to reconcile. Exits non-zero while any issue remains. Runs the default connection unless --connection or --all is specified.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --fix',
    '<%= config.bin %> <%= command.id %> --all --json',
  ];

  static override flags: {
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    fix: Interfaces.BooleanFlag<boolean>;
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
    fix: Flags.boolean({
      default: false,
      description:
        'Delete the metadata records whose physical table is missing.',
    }),
  };

  public async run(): Promise<CollectionsDoctorResult> {
    const { flags } = await this.parse(CollectionsDoctor);
    let result: AppCollectionsDoctorResult;
    try {
      result = await withAppRuntime(
        appContextOf(this),
        (runtime) =>
          runAppCollectionsDoctor(
            runtime.config.get<AppDatabaseConfig>('database')!,
            {
              paths: runtime.paths,
              connection: flags.connection,
              all: flags.all,
              fix: flags.fix,
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
          'Could not check the Collection metadata of',
          failed,
        ),
        {
          code: 'COLLECTIONS_CONNECTION_FAILED',
          details: {
            connections: failed.map((entry) => entry.connection),
            fix: result.fix,
            results: result.results,
          },
        },
      );
    }
    const remaining = result.results.flatMap((entry) =>
      (entry.issues ?? []).filter(
        (issue) =>
          !issue.orphaned || !(entry.repaired ?? []).includes(issue.name),
      ),
    );
    if (remaining.length) {
      const suggestions: (string | CommandSuggestion)[] = [];
      if (remaining.some((issue) => issue.orphaned)) {
        suggestions.push({
          message: 'Delete the records whose table is gone:',
          run: nocobaseCommand([
            'collections',
            'doctor',
            '--fix',
            ...selectionArgs(flags),
          ]),
        });
      }
      if (remaining.some((issue) => !issue.orphaned)) {
        suggestions.push(
          'Write a migration that reconciles the records whose table exists but no longer matches.',
        );
      }
      throw new CommandError(
        `${String(remaining.length)} Collection metadata ${remaining.length === 1 ? 'record disagrees' : 'records disagree'} with the schema.`,
        {
          code: 'COLLECTION_ISSUES_REMAIN',
          suggestions,
          details: { fix: result.fix, results: result.results },
        },
      );
    }

    if (result.status === 'not-configured') {
      this.setStatus('success-noop');
      return { state: 'not-configured', fix: result.fix, results: [] };
    }
    return { fix: result.fix, results: result.results };
  }

  private report(result: AppCollectionsDoctorResult): void {
    if (!result.results.length) {
      this.log('No database is configured.');
      return;
    }

    for (const entry of result.results) {
      this.log(
        `[${entry.connection}] collections: ${entry.status}${entry.error ? `: ${entry.error}` : ''}`,
      );
      if (entry.status !== 'completed') continue;
      this.log(`Checked: ${String(entry.checked ?? 0)} metadata records`);
      const repaired = entry.repaired ?? [];
      if (repaired.length) this.log(`Deleted: ${repaired.join(', ')}`);
      const outstanding = (entry.issues ?? []).filter(
        (issue) => !repaired.includes(issue.name),
      );
      if (!outstanding.length) {
        this.log(
          repaired.length
            ? 'No issue remains.'
            : 'Metadata agrees with the schema.',
        );
        continue;
      }
      for (const issue of outstanding) {
        this.log(`  ${issue.code} ${issue.name}: ${issue.message}`);
        if (issue.orphaned)
          this.log('    Its table is gone; --fix deletes this record.');
      }
    }
  }
}
