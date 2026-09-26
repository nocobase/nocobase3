// Assembles and runs an application's CLI.
//
// `bin/run.js` calls this, and so does the `cli/index.js` a build writes into `dist/`. Everything oclif needs is
// synthesized here rather than read from a manifest: the command map is merged in memory, and the `pjson` handed to
// `Config.load` points its `explicit` discovery target at this package's registry module, which reads that map back
// out.
import { Config, handle, run } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  loadAppCommands,
  loadAppPlugins,
  registerTypeScriptLoader,
} from './application.ts';
import { assembleCli, type AssembledCli } from './assemble.ts';
import {
  DEVELOPMENT_TOPICS,
  RESERVED_TOPICS,
  TREE_COMMANDS,
  builtinCommandFiles,
  builtinTopicsFor,
} from './builtin.ts';
import {
  setApplicationState,
  setResolvedCli,
  takeOpenRuntimes,
} from './command-store.ts';
import { commandFailureJson } from '../command/envelope.ts';
import {
  debugEnabled,
  describeForDebugging,
  wasDiagnosed,
} from '../command/diagnostics.ts';
import { CommandError, describeCommandError } from '../command/errors.ts';
import { cliInvocation } from '../command/invocation.ts';
import { INVALID_USAGE, describeUnknownCommand } from '../command/usage.ts';
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
  const argv = [...(options.argv ?? process.argv.slice(2))];
  let assembled: AssembledCli | undefined;
  // Kept for the failure path too, whose suggestions name the command line the way it runs here.
  let location: AppLocation | undefined;
  try {
    const root = options.root ?? process.env.NOCOBASE_APP_ROOT;
    const located =
      root === undefined || root === ''
        ? locateApp(process.cwd())
        : appAt(root);
    location = located;
    // Before anything imports application code or, in this repository, workspace sources that only a loader can run.
    await registerTypeScriptLoader(located);

    let plugins: ReturnType<typeof loadAppPlugins> | undefined;
    const loadPlugins = (): ReturnType<typeof loadAppPlugins> =>
      (plugins ??= loadAppPlugins(located));
    setApplicationState({ location: located, loadPlugins });

    assembled = await assembleForArguments(argv, located, loadPlugins);
    setResolvedCli(assembled);

    // Package root, resolved from this file: src/runtime/run.ts and dist/runtime/run.js are both two levels deep.
    const packageRoot = path.resolve(import.meta.dirname, '..', '..');
    const runningFromSource = import.meta.filename.endsWith('.ts');
    const config = await Config.load({
      pjson: cliPjson(packageRoot, runningFromSource, assembled.topics),
      root: packageRoot,
    });
    try {
      await run(argv, config);
    } finally {
      await closeLeftOpenRuntimes(argv);
    }
    await flushStdout();
  } catch (error) {
    // A command reports its own failures. What arrives here failed before or around one — an unknown command, a
    // broken plugin entry — and under --json it still has to answer with the one document a caller parses. Without
    // --json a command's failure passes through here on its way to oclif's handler, having printed its diagnostics
    // already. oclif's own debug mode is left off: it would print the raw stack in place of the message and its
    // suggestions, unredacted.
    if (debugEnabled() && !wasDiagnosed(error)) {
      process.stderr.write(`${await describeForDebugging(error)}\n`);
    }
    const reported = withCommandSuggestions(error, assembled, location);
    if (jsonRequested(argv)) {
      const { json, exit } = describeCommandError(reported);
      process.stdout.write(
        `${JSON.stringify(commandFailureJson(commandWords(argv), json, []), null, 2)}\n`,
      );
      process.exitCode = exit;
      return;
    }
    await handle(reported as Error);
  }
}

/** oclif's "command not found" as a `CommandError` naming the closest commands; any other error as it is. */
function withCommandSuggestions(
  error: unknown,
  assembled: AssembledCli | undefined,
  location: AppLocation | undefined,
): unknown {
  const commands = assembled?.commands ?? {};
  const unknown = describeUnknownCommand(error, {
    commandIds: Object.keys(commands).filter(
      (id) => commands[id]?.hidden !== true,
    ),
    topics: Object.keys(assembled?.topics ?? {}),
    invocation: cliInvocation(location),
  });
  if (unknown === undefined) return error;
  return new CommandError(unknown.message, {
    code: INVALID_USAGE,
    exit: unknown.exit,
    suggestions: unknown.suggestions,
    cause: error,
  });
}

/**
 * Puts away any runtime a command loaded and did not close, so the process can exit, and names the command so its
 * author can fix it: `withApp()` closes what it opens, and nothing else should open a runtime.
 */
async function closeLeftOpenRuntimes(argv: readonly string[]): Promise<void> {
  const open = takeOpenRuntimes();
  if (open.length === 0) return;
  process.stderr.write(
    `${commandWords(argv) || 'The command'} left the application open; wrap it in withApp().\n`,
  );
  for (const runtime of open) {
    try {
      await runtime.close();
    } catch (error) {
      process.stderr.write(
        `Closing the application failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}

/** Whether the caller asked for JSON: `--json` before any `--`, or oclif's `NOCOBASE_CONTENT_TYPE=json`. */
function jsonRequested(argv: readonly string[]): boolean {
  if (process.env.NOCOBASE_CONTENT_TYPE?.toLowerCase() === 'json') return true;
  const passThrough = argv.indexOf('--');
  const json = argv.indexOf('--json');
  return json !== -1 && (passThrough === -1 || json < passThrough);
}

function commandWords(argv: readonly string[]): string {
  const words: string[] = [];
  for (const argument of argv) {
    if (argument.startsWith('-')) break;
    words.push(argument);
  }
  return words.join(' ');
}

/**
 * The command tree a run needs.
 *
 * A built-in command is dispatched with nothing else loaded, so `pnpm install` running `nocobase skills sync`, or
 * `plugin register` repairing a broken `cli/plugins.ts`, never depends on every plugin's CLI entry importing. Only a
 * run that has to see the whole tree — help, `commands`, the application's own commands, a plugin's commands —
 * assembles it.
 */
async function assembleForArguments(
  argv: readonly string[],
  location: AppLocation,
  loadPlugins: () => ReturnType<typeof loadAppPlugins>,
): Promise<AssembledCli> {
  const files = await builtinCommandFiles(location);
  const builtinId = matchCommandId(argv, Object.keys(files));
  if (builtinId !== undefined && !TREE_COMMANDS.includes(builtinId)) {
    const builtinCommands = await loadCommandFiles({
      [builtinId]: files[builtinId],
    });
    return assembleCli({
      builtinCommands,
      builtinTopics: builtinTopicsFor([builtinId]),
      developmentTopics: DEVELOPMENT_TOPICS,
    });
  }

  const builtinCommands = await loadCommandFiles(files);
  return assembleCli({
    builtinCommands,
    builtinTopics: builtinTopicsFor(Object.keys(builtinCommands)),
    commands: await loadAppCommands(location),
    plugins: await loadPlugins(),
    deployment: location.kind === 'deployment',
    reservedTopics: RESERVED_TOPICS,
    developmentTopics: DEVELOPMENT_TOPICS,
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

/**
 * Waits for stdout to take what is buffered. oclif's `flush()` waits for `drain` behind an unref'd timeout, so once a
 * reader has closed the pipe the wait never ends, nothing else keeps the process alive, and the run is left unsettled.
 * This returns at once when nothing is buffered, and otherwise also stops at `close` or `error`.
 *
 * A reader that stops early, such as `| head`, is otherwise already handled: `@oclif/core` swallows `EPIPE` on stdout
 * from the moment it is imported, so a command that keeps printing finishes, `withApp()` puts its application away,
 * and the runner closes whatever was left open. Nothing here may exit the process on `EPIPE`, which would skip both.
 */
async function flushStdout(): Promise<void> {
  const stdout = process.stdout;
  if (stdout.destroyed || !stdout.writableNeedDrain) return;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      stdout.off('drain', done);
      stdout.off('close', done);
      stdout.off('error', done);
      resolve();
    };
    stdout.once('drain', done);
    stdout.once('close', done);
    stdout.once('error', done);
  });
}
