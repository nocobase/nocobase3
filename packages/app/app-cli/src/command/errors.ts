// The error a command throws when it fails, and how any error becomes the `error` of a `--json` document.
//
// `CommandError` extends oclif's `CLIError` so that without `--json` oclif's own handler prints it — the message, the
// suggestions under "Try this:", and the exit code — and nothing here re-implements terminal rendering.
import { Errors } from '@oclif/core';

/** A step the reader can take next: a sentence, and optionally the exact command that takes it. */
export interface CommandSuggestion {
  readonly message: string;
  /** The executable and its arguments, never a shell string, so no quoting is involved in running it. */
  readonly run?: {
    readonly command: string;
    readonly args: readonly string[];
  };
}

export interface CommandErrorOptions {
  /** A stable, machine-readable name for the failure, such as `CONNECTION_FAILED`. Agents branch on it. */
  readonly code: string;
  /** What to do next. A string is shorthand for a suggestion with only a message. */
  readonly suggestions?: readonly (string | CommandSuggestion)[];
  /** The process exit code. Defaults to 1; use 2 for invalid usage. */
  readonly exit?: number;
  /**
   * What a caller needs to act on the failure, beyond the message — the findings a check produced, the connection
   * that failed. It becomes `error.details` under `--json`; keep it to plain data, and never put a secret in it.
   */
  readonly details?: unknown;
  readonly cause?: unknown;
}

/** The `error` member of a failed `--json` document. */
export interface CommandErrorJson {
  readonly code: string;
  readonly message: string;
  readonly suggestions: readonly CommandSuggestion[];
  readonly details?: unknown;
}

const COMMAND_ERROR = Symbol.for('@nocobase/app-cli.CommandError');

/**
 * A failure a command reports on purpose.
 *
 * Throw it instead of printing an error and calling `exit()`: with `--json` it becomes the `error` of the one document
 * the command prints, and without it oclif prints the message and suggestions and exits with `exit`.
 */
export class CommandError extends Errors.CLIError {
  public readonly errorCode: string;
  public readonly commandSuggestions: readonly CommandSuggestion[];
  public readonly exitCode: number;
  public readonly details: unknown;

  public constructor(message: string, options: CommandErrorOptions) {
    const suggestions = (options.suggestions ?? []).map(toSuggestion);
    super(message, {
      code: options.code,
      exit: options.exit ?? 1,
      suggestions: suggestions.map(renderSuggestion),
    });
    // A cause that only repeats the message would print it twice under "Caused by".
    const repeatsMessage =
      options.cause instanceof Error && options.cause.message === message;
    if (options.cause !== undefined && !repeatsMessage) {
      this.cause = options.cause;
    }
    this.errorCode = options.code;
    this.commandSuggestions = suggestions;
    this.exitCode = options.exit ?? 1;
    this.details = options.details;
    Object.defineProperty(this, COMMAND_ERROR, { value: true });
  }
}

/**
 * Whether `error` is a `CommandError`, including one created by another copy of this package. The brand is looked up
 * by a registered symbol rather than `instanceof`, which a duplicated installation would defeat.
 */
export function isCommandError(error: unknown): error is CommandError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<symbol, unknown>)[COMMAND_ERROR] === true
  );
}

interface OclifErrorShape {
  readonly code?: string;
  readonly oclif?: { readonly exit?: number | false };
}

/** The `error` of a `--json` document for any thrown value, and the exit code the process ends with. */
export function describeCommandError(error: unknown): {
  readonly json: CommandErrorJson;
  readonly exit: number;
} {
  // `withApp` wraps a failure whose cleanup also failed; the failure is what the caller acts on, so its code survives.
  if (error instanceof AggregateError && error.cause !== undefined) {
    const cause = describeCommandError(error.cause);
    return {
      json: { ...cause.json, message: error.message },
      exit: cause.exit,
    };
  }
  if (isCommandError(error)) {
    return {
      json: {
        code: error.errorCode,
        message: error.message,
        suggestions: error.commandSuggestions,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      exit: error.exitCode,
    };
  }
  if (error instanceof Errors.CLIError || isOclifError(error)) {
    // oclif's own errors: invalid flags and arguments, an unknown command, `exit()`. Their default exit code is 2,
    // which is the invalid-usage code the rest of this command line uses.
    const shape = error as OclifErrorShape & Error;
    const exit = shape.oclif?.exit;
    return {
      json: {
        code: shape.code ?? 'INVALID_USAGE',
        message: shape.message,
        suggestions: [],
      },
      exit: typeof exit === 'number' ? exit : 2,
    };
  }
  return {
    json: {
      code: 'UNEXPECTED',
      message: error instanceof Error ? error.message : String(error),
      suggestions: [],
    },
    exit: 1,
  };
}

function isOclifError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as OclifErrorShape).oclif === 'object'
  );
}

function toSuggestion(
  suggestion: string | CommandSuggestion,
): CommandSuggestion {
  return typeof suggestion === 'string' ? { message: suggestion } : suggestion;
}

function renderSuggestion(suggestion: CommandSuggestion): string {
  if (suggestion.run === undefined) return suggestion.message;
  const line = [suggestion.run.command, ...suggestion.run.args]
    .map(quoteForShell)
    .join(' ');
  return `${suggestion.message} ${line}`;
}

/** Quotes an argument for a POSIX shell when it would otherwise split or be interpreted, so the line can be pasted. */
function quoteForShell(argument: string): string {
  if (/^[\w@%+=:,./-]+$/u.test(argument)) return argument;
  return `'${argument.replaceAll("'", `'\\''`)}'`;
}
