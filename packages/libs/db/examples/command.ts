import { pathToFileURL } from 'node:url';
import {
  runExternalModuleMetadata,
  type ExternalModuleMetadataResult,
} from './external-module-metadata/index.js';
import {
  runManagedCollectionLifecycle,
  type ManagedCollectionLifecycleResult,
} from './managed-collection-lifecycle/index.js';
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
  if (args.length > 1) {
    throw new Error(`Unexpected example argument "${args[1]}".`);
  }
  if (command === 'all') {
    return [
      await runManagedCollectionLifecycle({ write: io.write }),
      await runExternalModuleMetadata({ write: io.write }),
    ];
  }
  if (command === 'managed') {
    return [await runManagedCollectionLifecycle({ write: io.write })];
  }
  if (command === 'external') {
    return [await runExternalModuleMetadata({ write: io.write })];
  }
  throw new Error(
    `Unknown database example "${command}". Run "pnpm --filter @nocobase/db example list".`,
  );
}

function printHelp(io: ExampleCommandIO): void {
  io.write('Available @nocobase/db examples:');
  io.write('');
  for (const name of Object.keys(
    exampleDescriptions,
  ) as DatabaseExampleName[]) {
    io.write(`  ${name}`);
    io.write(`    ${exampleDescriptions[name]}`);
  }
  io.write('');
  io.write('  all');
  io.write('    Run every example in sequence.');
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
