// Tests run commands through the same helper a plugin's tests import.
import type { AppCommand } from '../src/context.ts';
import { runAppCommand as run, type AppCommandRun } from '../src/testing.ts';

export type CommandRun = AppCommandRun;

/** `root` is accepted for the older call shape; the bound command already carries its application root. */
export function runAppCommand(
  command: typeof AppCommand,
  argv: readonly string[],
  _root?: string,
): Promise<AppCommandRun> {
  return run(command, argv);
}
