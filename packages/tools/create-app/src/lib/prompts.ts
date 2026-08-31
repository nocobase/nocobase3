import * as clack from '@clack/prompts';
import { DIALECT_CHOICES, type DatabaseDialect } from './database.ts';
import { assertValidAppName } from './scaffold.ts';

/** Thrown when the user aborts a prompt with Ctrl+C, so the caller can exit quietly rather than print a stack. */
export class PromptCancelledError extends Error {
  public constructor() {
    super('Cancelled.');
    this.name = 'PromptCancelledError';
  }
}

function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    throw new PromptCancelledError();
  }

  return value;
}

/**
 * Prompts are only usable on an interactive terminal. In a script or CI job the missing value cannot be asked for, so
 * the caller is told which flag would have supplied it instead of hanging on a read that never returns.
 */
export function assertInteractive(missing: string, flag: string): void {
  if (!process.stdin.isTTY) {
    throw new Error(
      `${missing} is required, and there is no terminal to prompt on. Pass ${flag}.`,
    );
  }
}

export async function promptAppName(): Promise<string> {
  assertInteractive('An app name', 'it as the first argument');

  const name = unwrap(
    await clack.text({
      message: 'Where should the app be created?',
      placeholder: 'crm',
      defaultValue: '',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'An app name is required.';
        }

        try {
          assertValidAppName(value.trim());
          return undefined;
        } catch (error) {
          return (error as Error).message;
        }
      },
    }),
  );

  return name.trim();
}

export async function promptDialect(): Promise<DatabaseDialect> {
  assertInteractive('A database type', '--db-dialect');

  return unwrap(
    await clack.select<DatabaseDialect>({
      message: 'Which database will this app use?',
      options: DIALECT_CHOICES.map((choice) => ({
        value: choice.value,
        label: choice.label,
        hint: choice.hint,
      })),
      initialValue: 'postgres',
    }),
  );
}

export const intro: typeof clack.intro = clack.intro;
export const outro: typeof clack.outro = clack.outro;
export const log: typeof clack.log = clack.log;
export const spinner: typeof clack.spinner = clack.spinner;
export const note: typeof clack.note = clack.note;
export const cancel: typeof clack.cancel = clack.cancel;
