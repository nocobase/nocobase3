// What `NOCOBASE_CLI_DEBUG` adds to a failure: the error behind the message, with its stack and every cause.
//
// A command's message is written to be safe to show anywhere; what lies behind it may quote a request, a response or
// an environment value. So the chain is printed only when someone asks for it, to stderr, and after the same redaction
// the application's log files get.
import { isCommandError } from './errors.ts';

/** Whether `NOCOBASE_CLI_DEBUG` asks for diagnostics: set to anything but empty, `0` or `false`. */
export function debugEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = env.NOCOBASE_CLI_DEBUG?.trim().toLowerCase();
  return (
    value !== undefined && value !== '' && value !== '0' && value !== 'false'
  );
}

/** The failure and everything behind it, redacted, as lines for stderr. */
export async function describeForDebugging(error: unknown): Promise<string> {
  // Loaded only here, so the command line pays for the logging library only when someone is debugging.
  const { sanitizeLog } = await import('@nocobase/logging');
  const redact = (text: string): string => String(sanitizeLog(text));
  const lines: string[] = ['NOCOBASE_CLI_DEBUG:'];
  const seen = new Set<unknown>();
  const visit = (value: unknown, label: string, depth: number): void => {
    if (depth > 8 || seen.has(value)) return;
    seen.add(value);
    lines.push(`${label}${redact(describe(value))}`);
    for (const cause of causesOf(value)) visit(cause, 'Caused by: ', depth + 1);
  };
  visit(error, '', 0);
  return lines.join('\n');
}

function describe(value: unknown): string {
  if (value instanceof Error)
    return value.stack ?? `${value.name}: ${value.message}`;
  return String(value);
}

function causesOf(value: unknown): unknown[] {
  const causes: unknown[] = [];
  if (isCommandError(value)) {
    if (value.underlyingError !== undefined) causes.push(value.underlyingError);
  } else if (value instanceof Error && value.cause !== undefined) {
    causes.push(value.cause);
  }
  if (value instanceof AggregateError) {
    for (const inner of value.errors as unknown[]) causes.push(inner);
  }
  return causes;
}
