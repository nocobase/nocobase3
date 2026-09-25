// Assembles and runs an application's CLI.
//
// `bin/run.js` calls this, and so does the `cli/index.js` a build writes into `dist/`. Everything oclif needs is
// synthesized here rather than read from a manifest: the command map is merged in memory, and the `pjson` handed to
// `Config.load` points its `explicit` discovery target at this package's registry module, which reads that map back
// out.
import { Config, flush, handle, run, settings } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { AppCliCommand } from '../plugins/types.ts';
import {
  loadAppCommands,
  loadAppPlugins,
  registerTypeScriptLoader,
} from './application.ts';
import { assembleCli } from './assemble.ts';
import {
  RESERVED_TOPICS,
  builtinCommandFiles,
  builtinTopicsFor,
} from './builtin.ts';
import { setApplicationState, setResolvedCommands } from './command-store.ts';
import { loadCommandFiles } from './discover.ts';
import { appAt, locateApp, type AppLocation } from './location.ts';

export const CLI_BIN_NAME = 'nocobase';

export interface RunAppCliOptions {
  /**
   * The application root, for an entry point that knows where it lives, such as the `cli/index.js` a build writes
   * into `dist/`. Without it, `NOCOBASE_APP_ROOT` names the application, and without that the application is found
   * from the working directory. Naming it leaves the working directory alone, so relative paths a command takes still
   * resolve against where it was run.
   */
  readonly root?: string;
  /** Arguments to dispatch. Defaults to this process's. */
  readonly argv?: readonly string[];
}

export async function runAppCli(options: RunAppCliOptions = {}): Promise<void> {
  try {
    const argv = [...(options.argv ?? process.argv.slice(2))];
    const root = options.root ?? process.env.NOCOBASE_APP_ROOT;
    const location =
      root === undefined || root === ''
        ? locateApp(process.cwd())
        : appAt(root);
    // Before anything imports application code or, in this repository, workspace sources that only a loader can run.
    await registerTypeScriptLoader(location);

    let plugins: ReturnType<typeof loadAppPlugins> | undefined;
    const loadPlugins = (): ReturnType<typeof loadAppPlugins> =>
      (plugins ??= loadAppPlugins(location));
    setApplicationState({ location, loadPlugins });

    const { commands, topics } = await assembleForArguments(
      argv,
      location,
      loadPlugins,
    );
    setResolvedCommands(commands);

    // Package root, resolved from this file: src/runtime/run.ts and dist/runtime/run.js are both two levels deep.
    const packageRoot = path.resolve(import.meta.dirname, '..', '..');
    const runningFromSource = import.meta.filename.endsWith('.ts');
    const config = await Config.load({
      pjson: cliPjson(packageRoot, runningFromSource, topics),
      root: packageRoot,
    });
    if (runningFromSource) {
      settings.debug = Boolean(process.env.NOCOBASE_CLI_DEBUG);
    }
    await run(argv, config);
    await flush();
  } catch (error) {
    await handle(error as Error);
  }
}

/**
 * The command tree a run needs.
 *
 * A built-in command is dispatched with nothing else loaded, so `pnpm install` running `nocobase skills sync`, or
 * `plugin register` repairing a broken `cli/plugins.ts`, never depends on every plugin's CLI entry importing. Only a
 * run that has to see the whole tree — help, the application's own commands, a plugin's commands — assembles it.
 */
async function assembleForArguments(
  argv: readonly string[],
  location: AppLocation,
  loadPlugins: () => ReturnType<typeof loadAppPlugins>,
): Promise<{
  commands: Record<string, AppCliCommand>;
  topics: Record<string, { description: string }>;
}> {
  const files = await builtinCommandFiles(location);
  const builtinId = matchCommandId(argv, Object.keys(files));
  if (builtinId !== undefined) {
    const commands = await loadCommandFiles({ [builtinId]: files[builtinId] });
    return { commands, topics: builtinTopicsFor([builtinId]) };
  }

  const builtinCommands = await loadCommandFiles(files);
  return assembleCli({
    builtinCommands,
    builtinTopics: builtinTopicsFor(Object.keys(builtinCommands)),
    commands: await loadAppCommands(location),
    plugins: await loadPlugins(),
    deployment: location.kind === 'deployment',
    reservedTopics: RESERVED_TOPICS,
  });
}

/** The longest run of leading words in `argv` that names one of `ids`, the way oclif resolves a space-separated id. */
export function matchCommandId(
  argv: readonly string[],
  ids: readonly string[],
): string | undefined {
  const known = new Set(ids);
  const words: string[] = [];
  for (const argument of argv) {
    if (argument.startsWith('-')) break;
    words.push(argument);
  }
  for (let length = words.length; length > 0; length -= 1) {
    const id = words.slice(0, length).join(':');
    if (known.has(id)) return id;
  }
  return undefined;
}

function cliPjson(
  packageRoot: string,
  runningFromSource: boolean,
  topics: Record<string, { description: string }>,
): Interfaces.PJSON {
  // Only the identity fields are taken from the manifest; everything oclif dispatches on is synthesized below, so a
  // stale `oclif` block in the published package cannot change how the assembled CLI behaves.
  const manifestPath = path.join(packageRoot, 'package.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string;
        version?: string;
        description?: string;
      })
    : {};

  return {
    name: manifest.name ?? '@nocobase/app-cli',
    version: manifest.version ?? '0.0.0',
    ...(manifest.description === undefined
      ? {}
      : { description: manifest.description }),
    oclif: {
      bin: CLI_BIN_NAME,
      dirname: CLI_BIN_NAME,
      topicSeparator: ' ',
      additionalHelpFlags: ['-h'],
      helpOptions: {
        flagSortOrder: 'none' as const,
        maxWidth: process.stdout.columns ?? 80,
      },
      helpClass: runningFromSource
        ? './src/help/runtime-help.ts'
        : './dist/help/runtime-help.js',
      topics,
      commands: {
        strategy: 'explicit',
        identifier: 'default',
        target: runningFromSource
          ? './src/runtime/registry.ts'
          : './dist/runtime/registry.js',
      },
    },
  };
}
