import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Version ranges for the database drivers, matching what `@nocobase/app-database` declares so a generated app resolves
 * the same major versions the database package is tested against.
 */
export const DRIVER_VERSIONS: Readonly<Record<string, string>> = {
  'better-sqlite3': '^12.11.1',
  pg: '^8.23.0',
  mysql2: '^3.23.3',
};

/**
 * Adds the chosen driver to the generated project's `dependencies`.
 *
 * The template ships none of the three drivers — it depends on `knex` alone — so exactly one is added here, in
 * `dependencies` rather than `devDependencies` because the server needs it at runtime.
 */
export async function addDriverDependency(
  directory: string,
  driver: string,
): Promise<void> {
  const version = DRIVER_VERSIONS[driver];

  if (!version) {
    throw new Error(`No version range is known for the driver "${driver}".`);
  }

  const manifestPath = path.join(directory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
  };

  const dependencies = manifest.dependencies ?? {};
  dependencies[driver] = version;
  manifest.dependencies = sortKeys(dependencies);

  // A template that carries the driver in devDependencies would otherwise pin a second, conflicting range.
  if (manifest.devDependencies?.[driver]) {
    delete manifest.devDependencies[driver];
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function sortKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
}
