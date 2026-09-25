// The one document an `AppCommand` prints under `--json`.
//
// Every command answers in this shape, success or failure, so a caller learns one way to read them: check `ok`, then
// read `result` or `error`. The envelope carries a brand so `AppCommand.logJson` can refuse anything else — a second
// document on stdout is exactly what a machine reader cannot recover from.
import type { CommandErrorJson } from './errors.ts';

export const COMMAND_JSON_SCHEMA_VERSION = 1;

/** How a successful run went. A failed run is always `failure`. */
export type CommandSuccessStatus =
  'success' | 'success-noop' | 'partial-success';

export interface CommandSuccessJson<TResult = unknown> {
  readonly schemaVersion: typeof COMMAND_JSON_SCHEMA_VERSION;
  readonly ok: true;
  /** The command's id as typed, such as `db apply`. */
  readonly command: string;
  readonly status: CommandSuccessStatus;
  /** What `run()` returned; `null` when it returned nothing. */
  readonly result: TResult | null;
  readonly warnings: readonly string[];
}

export interface CommandFailureJson {
  readonly schemaVersion: typeof COMMAND_JSON_SCHEMA_VERSION;
  readonly ok: false;
  readonly command: string;
  readonly status: 'failure';
  readonly error: CommandErrorJson;
  readonly warnings: readonly string[];
}

export type CommandJson<TResult = unknown> =
  CommandSuccessJson<TResult> | CommandFailureJson;

const ENVELOPE = Symbol.for('@nocobase/app-cli.commandEnvelope');

function brand<T extends object>(envelope: T): T {
  Object.defineProperty(envelope, ENVELOPE, { value: true });
  return envelope;
}

export function isCommandEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[ENVELOPE] === true
  );
}

export function commandSuccessJson<TResult>(
  command: string,
  status: CommandSuccessStatus,
  result: TResult | undefined,
  warnings: readonly string[],
): CommandSuccessJson<TResult> {
  return brand({
    schemaVersion: COMMAND_JSON_SCHEMA_VERSION,
    ok: true as const,
    command,
    status,
    result: result ?? null,
    warnings: [...warnings],
  });
}

export function commandFailureJson(
  command: string,
  error: CommandErrorJson,
  warnings: readonly string[],
): CommandFailureJson {
  return brand({
    schemaVersion: COMMAND_JSON_SCHEMA_VERSION,
    ok: false as const,
    command,
    status: 'failure' as const,
    error,
    warnings: [...warnings],
  });
}
