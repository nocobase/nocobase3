// How to run this command line from where the current run is, for the commands a suggestion or a next step names.
//
// A source checkout runs it as `pnpm nocobase`. A built `dist/` has no `.bin` and its runtime image has no pnpm, so a
// suggestion written that way cannot be run exactly where the runtime commands — `db`, `config`, `collections` — are
// most often used. There it is `node <dist>/cli/index.js`, with the absolute path so it runs from any directory.
import path from 'node:path';

import { applicationState } from '../runtime/command-store.ts';
import type { AppLocation } from '../runtime/location.ts';

/** An executable and its arguments, as a suggestion's `run` carries them. */
export interface CliInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * The executable and leading arguments that run this command line, for `location` or, without one, for the application
 * the runner located. Outside a run, as in a test that binds a command directly, it is `pnpm nocobase`.
 */
export function cliInvocation(
  location?: Pick<AppLocation, 'kind' | 'root'>,
): CliInvocation {
  const where = location ?? currentLocation();
  if (where?.kind === 'deployment') {
    return {
      command: 'node',
      args: [path.join(where.root, 'cli', 'index.js')],
    };
  }
  return { command: 'pnpm', args: ['nocobase'] };
}

/** `cliInvocation()` followed by `args`, such as `['db', 'unlock']`. */
export function nocobaseCommand(
  args: readonly string[],
  location?: Pick<AppLocation, 'kind' | 'root'>,
): { command: string; args: string[] } {
  const invocation = cliInvocation(location);
  return {
    command: invocation.command,
    args: [...invocation.args, ...args],
  };
}

function currentLocation(): AppLocation | undefined {
  try {
    return applicationState().location;
  } catch {
    return undefined;
  }
}
