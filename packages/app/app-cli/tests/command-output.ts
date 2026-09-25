// Runs an AppCommand the way the runner does — oclif's static `run`, so `--json`, `catch` and the envelope all apply —
// and captures what it wrote.
import { format } from 'node:util';

import { Config } from '@oclif/core';
import { vi } from 'vitest';

import type { AppCommand } from '../src/context.ts';

export interface CommandRun {
  readonly result: unknown;
  readonly error: unknown;
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  /** stdout parsed as the one JSON document `--json` promises; throws when it is not exactly one. */
  readonly json: () => Record<string, unknown>;
}

export async function runAppCommand(
  command: typeof AppCommand,
  argv: readonly string[],
  root: string,
): Promise<CommandRun> {
  const config = await Config.load({
    root,
    pjson: {
      name: 'app-command-test',
      version: '0.0.0',
      oclif: { bin: 'nocobase' },
    },
  });
  let stdout = '';
  let stderr = '';
  // oclif's ux writes through console.log and console.error; the application's own logging writes to the streams.
  const spies = [
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout += `${format(...args)}\n`;
    }),
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += `${format(...args)}\n`;
    }),
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    }),
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    }),
  ];
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  let result: unknown;
  let error: unknown;
  try {
    result = await command.run([...argv], config);
  } catch (caught) {
    error = caught;
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  const exitCode =
    typeof process.exitCode === 'number' ? process.exitCode : undefined;
  process.exitCode = previousExitCode;
  return {
    result,
    error,
    exitCode,
    stdout,
    stderr,
    json: () => JSON.parse(stdout) as Record<string, unknown>,
  };
}
