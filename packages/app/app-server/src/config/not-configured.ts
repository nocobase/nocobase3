/**
 * The application has nothing to start with: no configuration supplies what it cannot run without.
 *
 * Distinct from any other startup failure because it has one cause and one remedy, and the remedy is a command. A
 * stack trace adds nothing to "run `pnpm config:init`" and pushes it off the screen, so a standalone start prints the
 * message alone for this error and the whole error for everything else. Recognised by `name` as well as by class, so a
 * second copy of this package in the process still produces the short message.
 */
export class ApplicationNotConfiguredError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationNotConfiguredError';
  }
}

/** Whether `error`, or anything in its cause chain, reports an application that has not been configured. */
export function findApplicationNotConfigured(
  error: unknown,
): ApplicationNotConfiguredError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (
      current instanceof ApplicationNotConfiguredError ||
      current.name === 'ApplicationNotConfiguredError'
    )
      return current;
    current = current.cause;
  }
  return undefined;
}
