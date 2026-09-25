// Loads what an application contributes to its own CLI: the plugins listed in `cli/plugins`, and the commands under
// `cli/commands/`.
//
// A source checkout holds TypeScript, which Node cannot load from these files on its own — they import with `.js`
// specifiers that name `.ts` files — so a source run registers the application's own `tsx` first. A built `dist/`
// holds the compiled JavaScript and needs nothing.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AppCliCommand, AppCliPlugins } from '../plugins/types.ts';
import { discoverCommandFiles, loadCommandFiles } from './discover.ts';
import type { AppLocation } from './location.ts';

let typeScriptLoaderRegistered = false;

/**
 * Registers the application's `tsx` in this process, so its TypeScript can be imported.
 *
 * Returns whether a loader is in place. `tsx` is an optional peer that a source application provides; when it is
 * missing this does nothing, and the import that needed it fails with Node's own error naming the file.
 */
export async function registerTypeScriptLoader(
  location: AppLocation,
): Promise<boolean> {
  if (location.kind !== 'source') return false;
  if (typeScriptLoaderRegistered) return true;
  let entry: string;
  try {
    entry = createRequire(path.join(location.root, 'package.json')).resolve(
      'tsx/esm/api',
    );
  } catch {
    return false;
  }
  const { register } = (await import(pathToFileURL(entry).href)) as {
    register: () => unknown;
  };
  register();
  typeScriptLoaderRegistered = true;
  return true;
}

function sourceExtension(location: AppLocation): '.ts' | '.js' {
  return location.kind === 'deployment' ? '.js' : '.ts';
}

/** The plugin contributions `cli/plugins` exports, or none when the application has no such file. */
export async function loadAppPlugins(
  location: AppLocation,
): Promise<AppCliPlugins | undefined> {
  if (location.kind === 'none') return undefined;
  const file = path.join(
    location.root,
    'cli',
    `plugins${sourceExtension(location)}`,
  );
  if (!existsSync(file)) return undefined;
  await registerTypeScriptLoader(location);
  const module = (await import(pathToFileURL(file).href)) as {
    default?: AppCliPlugins;
  };
  if (!Array.isArray(module.default?.plugins)) {
    throw new Error(
      `${file} must default-export the result of defineCliPlugins([...]).`,
    );
  }
  return module.default;
}

/** The application's own commands under `cli/commands/`, keyed by the id they answer to below the `app` topic. */
export async function loadAppCommands(
  location: AppLocation,
): Promise<Record<string, AppCliCommand>> {
  if (location.kind === 'none') return {};
  const files = await discoverCommandFiles(
    path.join(location.root, 'cli', 'commands'),
    sourceExtension(location),
  );
  if (Object.keys(files).length === 0) return {};
  await registerTypeScriptLoader(location);
  return loadCommandFiles(files);
}
