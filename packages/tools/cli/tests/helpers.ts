import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '@oclif/core';

export const packageRoot: string = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/**
 * Loads the CLI the same way `bin/run.js` does in development, by pointing oclif at the TypeScript sources rather than
 * at `dist`. Tests therefore exercise the command tree they can see in `src`, with no build step in between.
 */
export async function loadTestConfig(): Promise<Config> {
  const pjson = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  pjson.oclif.commands = './src/commands';
  pjson.oclif.helpClass = './src/help/runtime-help.ts';

  return Config.load({ pjson, root: packageRoot });
}

export interface RunResult {
  stdout: string;
  lines: string[];
}

/**
 * Runs a command in-process and captures what it printed. Commands report through `this.log`, which oclif routes to
 * `ux.stdout` and from there to `console.log` — patching `process.stdout.write` would not see it, because the test
 * runner has already replaced the console by the time the command runs.
 */
export async function runCommand(
  config: Config,
  id: string,
  argv: string[] = [],
): Promise<RunResult> {
  const lines: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]): void => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    await config.runCommand(id, argv);
  } finally {
    console.log = originalLog;
  }

  return { stdout: lines.join('\n'), lines };
}
