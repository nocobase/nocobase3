import { AppCommand } from '../../context.ts';
import { type Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

import {
  runAppCollectionsDoctor,
  type AppCollectionsDoctorResult,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';

export default class AppDbDoctor extends AppCommand {
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
    json: Interfaces.BooleanFlag<boolean>;
    all: Interfaces.BooleanFlag<boolean>;
    connection: Interfaces.OptionFlag<string | undefined>;
    fix: Interfaces.BooleanFlag<boolean>;
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
    fix: Flags.boolean({
      default: false,
      description:
        'Delete the metadata records whose physical table is missing.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDbDoctor);
    let result: AppCollectionsDoctorResult;
    try {
      const runtime = await this.appContext.loadRuntime();
      result = await runAppCollectionsDoctor(
        runtime.config.get<AppDatabaseConfig>('database')!,
        {
          paths: runtime.paths,
          connection: flags.connection,
          all: flags.all,
          fix: flags.fix,
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

    const remaining = result.results.some((entry) =>
      (entry.issues ?? []).some(
        (issue) =>
          !issue.orphaned || !(entry.repaired ?? []).includes(issue.name),
      ),
    );
    if (!result.ok || remaining) this.exit(1);
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
