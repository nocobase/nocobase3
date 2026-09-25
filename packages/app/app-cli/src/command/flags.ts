// A path flag that follows the command line's one rule for paths.
//
// A path the user types resolves from the current directory, as with any command line; a default the command names in
// its `--help` is inside the application. Spelling that out in every command is how it went wrong: a default resolved
// from the current directory finds nothing when the command runs from a subdirectory. `appPath()` resolves what the
// user typed, and `AppCommand.parse()` resolves a default against the application root, because only the command knows
// where that is.
import path from 'node:path';

import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

const APP_PATH = Symbol.for('@nocobase/app-cli.appPath');

export interface AppPathFlagOptions {
  readonly description: string;
  /** A path relative to the application root, used when the flag is not given. */
  readonly default?: string;
  readonly required?: boolean;
}

/** A path flag whose value is always absolute: typed values from the current directory, the default from the App root. */
export function appPath(
  options: AppPathFlagOptions & { readonly default: string },
): Interfaces.OptionFlag<string>;
export function appPath(
  options: AppPathFlagOptions & { readonly required: true },
): Interfaces.OptionFlag<string>;
export function appPath(
  options: AppPathFlagOptions,
): Interfaces.OptionFlag<string | undefined>;
export function appPath(
  options: AppPathFlagOptions,
): Interfaces.OptionFlag<string | undefined> {
  const parse = async (input: string): Promise<string> =>
    path.resolve(process.cwd(), input);
  let flag: Interfaces.OptionFlag<string | undefined>;
  if (options.default !== undefined) {
    const relative = options.default;
    flag = Flags.string({
      description: options.description,
      default: relative,
      defaultHelp: async () => `${relative}, relative to the application root`,
      parse,
    });
  } else if (options.required === true) {
    flag = Flags.string({
      description: options.description,
      required: true,
      parse,
    });
  } else {
    flag = Flags.string({ description: options.description, parse });
  }
  Object.defineProperty(flag, APP_PATH, { value: true });
  return flag;
}

/** Whether a flag definition came from `appPath()`, including one from another copy of this package. */
export function isAppPathFlag(flag: unknown): boolean {
  return (
    typeof flag === 'object' &&
    flag !== null &&
    (flag as Record<symbol, unknown>)[APP_PATH] === true
  );
}
