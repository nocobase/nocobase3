// Turns an oclif parse failure into a message that names what was wrong without repeating what was typed.
//
// oclif's own messages quote the input — `Parsing --timeout … received: abc`, `--hub=<value> cannot also be provided`,
// `Unexpected argument: <value>` — and a mistyped command line can put a secret in any of those places, for example
// `--apikey <key>`, where the misspelled flag leaves the key behind as an unexpected argument. So no value is echoed.
// Flag names are read from the message only to be matched against the command's own flags; the single exception is the
// name of an unknown flag, which `unknownFlagNames` reduces to its name before repeating it.

const HELP = 'Run this command with --help.';

/** A message for a failed `this.parse()` that names only flags from `flagNames`. */
export function describeArgumentError(
  error: unknown,
  flagNames: readonly string[],
): string {
  const message = error instanceof Error ? error.message : '';
  const declared = (pattern: RegExp): string[] => [
    ...new Set(
      [...message.matchAll(pattern)]
        .map((match) => match[1] ?? '')
        .filter((name) => flagNames.includes(name)),
    ),
  ];

  const missing = declared(/Missing required flag (?:--)?([a-z][a-z0-9-]*)/g);
  if (missing.length > 0) {
    return `Missing required ${plural('flag', missing)} ${list(missing)}. ${HELP}`;
  }
  const invalid = declared(
    /(?:Parsing|Flag|Expected) --([a-z][a-z0-9-]*)[ =]/g,
  );
  if (invalid.length > 0) {
    return `Invalid value for ${list(invalid)}. ${HELP}`;
  }
  const conflicting = declared(/--([a-z][a-z0-9-]*)(?:=\S*)? cannot also/g);
  if (conflicting.length > 0) {
    return `${list(conflicting)} cannot be combined with the other flags given. ${HELP}`;
  }
  if (message.startsWith('Nonexistent flag')) {
    const unknown = unknownFlagNames(error);
    return unknown.length > 0
      ? `Unknown ${plural('flag', unknown)} ${list(unknown)}. ${HELP}`
      : `Unknown flag. ${HELP}`;
  }
  if (message.startsWith('Unexpected argument')) {
    return `This command takes no positional arguments. ${HELP}`;
  }
  return `Invalid command arguments. ${HELP}`;
}

// The one place a name the command did not declare is repeated. Only the part of a `--name=value` token before `=` is
// kept, and only when it has the shape of a long flag, so a value that happens to start with a dash is not echoed.
function unknownFlagNames(error: unknown): string[] {
  const tokens = (error as { flags?: unknown }).flags;
  if (!Array.isArray(tokens)) return [];
  return [
    ...new Set(
      tokens
        .map((token) => /^--([a-z][a-z0-9-]{0,39})(?:=|$)/i.exec(String(token)))
        .map((match) => match?.[1])
        .filter((name): name is string => name !== undefined),
    ),
  ];
}

function list(names: readonly string[]): string {
  return names.map((name) => `--${name}`).join(', ');
}

function plural(word: string, items: readonly unknown[]): string {
  return items.length === 1 ? word : `${word}s`;
}
