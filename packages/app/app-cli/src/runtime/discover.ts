// Finds commands by where they sit on disk.
//
// A file's path below the commands directory is its command id: `db/apply.ts` answers to `db apply`. The same rule
// serves this package's own commands and an application's `cli/commands/`, so neither keeps an index that a new file
// has to be added to — forgetting that entry used to leave a command answering to nothing.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AppCliCommand } from '../plugins/types.ts';

export type CommandExtension = '.ts' | '.js';

/**
 * Command ids below `directory`, each mapped to the file that defines it.
 *
 * Files and directories whose name starts with `_`, and directories named `lib`, are skipped so that a command can
 * keep helpers beside it. There is no `index` convention: `db/index.ts` would be the command `db index`.
 */
export async function discoverCommandFiles(
  directory: string,
  extension: CommandExtension,
): Promise<Record<string, string>> {
  const found: Record<string, string> = {};

  const walk = async (current: string, segments: string[]): Promise<void> => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'lib') continue;
        await walk(entryPath, [...segments, entry.name]);
        continue;
      }
      if (
        !entry.isFile() ||
        !entry.name.endsWith(extension) ||
        entry.name.endsWith(`.d${extension}`)
      ) {
        continue;
      }
      const name = entry.name.slice(0, -extension.length);
      found[[...segments, name].join(':')] = entryPath;
    }
  };

  await walk(directory, []);
  return found;
}

/** Imports every command file and checks each default-exports an oclif command. */
export async function loadCommandFiles(
  files: Readonly<Record<string, string>>,
): Promise<Record<string, AppCliCommand>> {
  const loaded: Record<string, AppCliCommand> = {};
  for (const [id, file] of Object.entries(files)) {
    const module = (await import(pathToFileURL(file).href)) as {
      default?: AppCliCommand;
    };
    // oclif loads a command by reading its static `run`, so a file without one fails at dispatch time with an error
    // naming oclif internals. Rejecting it here names the file instead.
    if (typeof module.default?.run !== 'function') {
      throw new Error(
        `${file} must default-export an oclif Command class to answer to "${id.replaceAll(':', ' ')}".`,
      );
    }
    loaded[id] = module.default;
  }
  return loaded;
}
