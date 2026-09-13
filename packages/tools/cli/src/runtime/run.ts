// Assembles and runs an application's CLI.
//
// An application's `cli/index.ts` calls this. Everything oclif needs is synthesized here rather than read from a
// manifest: the command map is merged in memory, and the `pjson` handed to `Config.load` points its `explicit`
// discovery target at this package's registry module, which reads that map back out.
import { Config, flush, handle, run, settings } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { AppCliCommand, AppCliPlugins } from '../plugins/types.ts';
import { assembleCli } from './assemble.ts';
import { builtinCommands, builtinTopics } from './builtin.ts';
import { setRegisteredPlugins, setResolvedCommands } from './command-store.ts';

export const CLI_BIN_NAME = 'nocobase';

export interface RunAppCliOptions {
  /** Commands the application itself contributes; they mount under the `app` topic. */
  readonly commands?: Readonly<Record<string, AppCliCommand>>;
  /** Plugin CLI contributions, normally the default export of the application's `cli/plugins.ts`. */
  readonly plugins?: AppCliPlugins;
  /** Arguments to dispatch. Defaults to this process's. */
  readonly argv?: readonly string[];
}

export async function runAppCli(options: RunAppCliOptions = {}): Promise<void> {
  try {
    const { commands, topics } = assembleCli({
      builtinCommands,
      builtinTopics,
      ...(options.commands === undefined ? {} : { commands: options.commands }),
      ...(options.plugins === undefined ? {} : { plugins: options.plugins }),
    });
    setResolvedCommands(commands);
    setRegisteredPlugins(options.plugins);

    // Package root, resolved from this file: src/runtime/run.ts and dist/runtime/run.js are both two levels deep.
    const packageRoot = path.resolve(import.meta.dirname, '..', '..');
    const runningFromSource = import.meta.filename.endsWith('.ts');
    const config = await Config.load({
      pjson: cliPjson(packageRoot, runningFromSource, topics),
      root: packageRoot,
    });
    if (runningFromSource) {
      settings.debug = Boolean(process.env.NB3_CLI_DEBUG);
    }
    await run([...(options.argv ?? process.argv.slice(2))], config);
    await flush();
  } catch (error) {
    await handle(error as Error);
  }
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
    name: manifest.name ?? '@nocobase/nb3-cli',
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
