import { pathToFileURL } from 'node:url';
import {
  runExternalModuleMetadata,
  type ExternalModuleMetadataResult,
} from './external-module-metadata/index.js';
import {
  runManagedCollectionLifecycle,
  type ManagedCollectionLifecycleResult,
} from './managed-collection-lifecycle/index.js';
import { cleanExampleTempDirectories } from './shared/temp-directory.js';
import type { ExampleCommandIO } from './shared/types.js';

export type DatabaseExampleName = 'managed' | 'external';
export type DatabaseExampleResult =
  ManagedCollectionLifecycleResult | ExternalModuleMetadataResult;

const exampleDescriptions: Readonly<Record<DatabaseExampleName, string>> = {
  managed:
    'Migration, Database Metadata Store, Seed, Collection resolution, CAS, transactions, and persistence.',
  external:
    'External physical Schema, Module Metadata Store, Collection resolution, record DML, and write protection.',
};

export async function runExampleCommand(
  args: readonly string[],
  io: ExampleCommandIO,
): Promise<readonly DatabaseExampleResult[]> {
  const command = args[0];
  if (
    !command ||
    command === 'list' ||
    command === '--help' ||
    command === '-h'
  ) {
    printHelp(io);
    return [];
  }
  if (command === 'clean') {
    assertNoArguments(args.slice(1));
    const removed = await cleanExampleTempDirectories(io.tempDirectoryRoot);
    io.write(`Removed ${removed} retained example result(s).`);
    return [];
  }

  const options = parseExampleOptions(args.slice(1));
  if (command === 'all') {
    return [
      await runManagedCollectionLifecycle({
        write: io.write,
        cleanup: options.cleanup,
        tempDirectoryRoot: io.tempDirectoryRoot,
      }),
      await runExternalModuleMetadata({
        write: io.write,
        cleanup: options.cleanup,
        tempDirectoryRoot: io.tempDirectoryRoot,
      }),
    ];
  }
  if (command === 'managed') {
    return [
      await runManagedCollectionLifecycle({
        write: io.write,
        cleanup: options.cleanup,
        tempDirectoryRoot: io.tempDirectoryRoot,
      }),
    ];
  }
  if (command === 'external') {
    return [
      await runExternalModuleMetadata({
        write: io.write,
        cleanup: options.cleanup,
        tempDirectoryRoot: io.tempDirectoryRoot,
      }),
    ];
  }
  throw new Error(
    `Unknown database example "${command}". Run "pnpm --filter @nocobase/db example list".`,
  );
}

function parseExampleOptions(args: readonly string[]): {
  readonly cleanup: boolean;
} {
  const unexpectedArgument = args.find((argument) => argument !== '--cleanup');
  if (unexpectedArgument) {
    throw new Error(`Unexpected example argument "${unexpectedArgument}".`);
  }
  return { cleanup: args.includes('--cleanup') };
}

function assertNoArguments(args: readonly string[]): void {
  if (args[0]) {
    throw new Error(`Unexpected example argument "${args[0]}".`);
  }
}

function printHelp(io: ExampleCommandIO): void {
  io.write('Available @nocobase/db examples:');
  io.write('');
  for (const name of Object.keys(
    exampleDescriptions,
  ) as DatabaseExampleName[]) {
    io.write(`  ${name} [--cleanup]`);
    io.write(`    ${exampleDescriptions[name]}`);
  }
  io.write('');
  io.write('  all [--cleanup]');
  io.write('    Run every example in sequence.');
  io.write('');
  io.write('  clean');
  io.write('    Remove all retained example results.');
  io.write('');
  io.write('Results are retained by default. Use --cleanup to remove a run.');
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(entry).href === import.meta.url);
}

if (isMainModule()) {
  runExampleCommand(process.argv.slice(2), { write: console.log }).catch(
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
