import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '@oclif/core';

export const packageRoot: string = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/**
 * Loads the legacy command implementations directly for regression coverage. They are no longer a published command
 * surface, but the application package scripts still share selected classes from this tree.
 */
export async function loadTestConfig(): Promise<Config> {
  const pjson = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  pjson.oclif.commands = './src/commands';
  pjson.oclif.helpClass = './src/help/runtime-help.ts';

  return Config.load({ pjson, root: packageRoot });
}

/**
 * Loads the commands exposed by generated applications through their package scripts. The business logic still
 * lives in the ordinary command classes; this separate tree controls only the public invocation shape and help text.
 */
export async function loadAppScriptTestConfig(): Promise<Config> {
  const pjson = JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  pjson.oclif.bin = 'pnpm run';
  pjson.oclif.dirname = 'nocobase-app';
  pjson.oclif.commands = './src/app-scripts';
  pjson.oclif.helpClass = './src/help/runtime-help.ts';

  return Config.load({ pjson, root: packageRoot });
}

export interface RunResult {
  stdout: string;
  lines: string[];
}

export interface FailedRunResult extends RunResult {
  error: unknown;
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

export async function runCommandAllowFailure(
  config: Config,
  id: string,
  argv: string[] = [],
): Promise<FailedRunResult> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]): void => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    await config.runCommand(id, argv);
  } catch (error) {
    return { error, stdout: lines.join('\n'), lines };
  } finally {
    console.log = originalLog;
  }
  throw new Error(`Expected ${id} to fail.`);
}
