import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveDefaultAppConfigFile } from '@nocobase/app-server/config';
import { parse } from 'yaml';

import type { AppCommandRuntime } from '../context.js';

/**
 * The top-level sections `config.example.yml` documents.
 *
 * Together with the sections the application defaults in code, these are the ones something reads. The example is the
 * one statement of what may go in a configuration file, and it names sections — `client`, `users` — that no default
 * mentions, so neither list is enough on its own.
 */
export async function exampleSections(
  deploymentRootDir: string,
): Promise<string[]> {
  try {
    const parsed: unknown = parse(
      await readFile(
        path.join(deploymentRootDir, 'config.example.yml'),
        'utf8',
      ),
    );
    return typeof parsed === 'object' && parsed !== null
      ? Object.keys(parsed)
      : [];
  } catch {
    return [];
  }
}

/** The nearest known key within two edits, which covers a dropped, doubled or swapped letter. */
export function closestKey(
  key: string,
  known: Iterable<string>,
): string | undefined {
  let best: { readonly key: string; readonly distance: number } | undefined;
  for (const candidate of known) {
    const distance = editDistance(key, candidate);
    if (distance <= 2 && (best === undefined || distance < best.distance))
      best = { key: candidate, distance };
  }
  return best?.key;
}

/**
 * The file the application reads, resolved the way its default `server/config.ts` does: `APP_CONFIG_FILE` relative to
 * the application root, otherwise `config.*` beside the deployment root. Without a runtime to ask, the same probe is
 * done by hand.
 */
export function activeConfigFile(
  rootDir: string,
  deploymentRootDir: string,
  runtime: AppCommandRuntime | undefined,
  environment: NodeJS.ProcessEnv,
): string {
  const configured = environment.APP_CONFIG_FILE;
  if (configured) return path.resolve(rootDir, configured);
  if (runtime) return resolveDefaultAppConfigFile(runtime.paths);
  for (const extension of ['.yml', '.yaml', '.toml', '.json']) {
    const candidate = path.join(deploymentRootDir, `config${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return path.join(deploymentRootDir, 'config.yml');
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}
