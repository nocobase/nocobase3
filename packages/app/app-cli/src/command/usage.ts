// What this command line adds to oclif's own usage errors: a message without oclif's trailing hint, and suggestions a
// caller can act on — the flag or command that was probably meant, and the help that lists the rest.
//
// oclif raises these before a command's `run()` starts, as parse errors inside the command or as "command not found"
// in the runner, and describes them only in prose. Both places turn them into the same `INVALID_USAGE` failure, so an
// agent reads `error.suggestions` rather than parsing text.
import { stripVTControlCharacters } from 'node:util';

import type { Interfaces } from '@oclif/core';

import {
  closestMatches,
  editDistance,
  matchDistance,
  nearest,
  typoAllowance,
} from './distance.ts';
import type { ScoredMatch } from './distance.ts';
import { isCommandError, type CommandSuggestion } from './errors.ts';
import { declaredFlags } from './flags.ts';

/** The code every usage failure carries, which is what oclif's own errors already mapped to. */
export const INVALID_USAGE = 'INVALID_USAGE';

/** A usage error, described for a `CommandError`. */
export interface UsageFailure {
  readonly message: string;
  readonly suggestions: readonly CommandSuggestion[];
  readonly exit: number;
}

/** The command a usage error was raised for. */
export interface UsageContext {
  /** Its id as words, such as `['db', 'apply']`. */
  readonly words: readonly string[];
  /** Every long flag name it accepts, without dashes, `json` and `no-` forms included. */
  readonly flags: readonly string[];
}

/** The tree an unknown command is looked up in. */
export interface CommandTreeNames {
  /** Visible command ids in oclif's colon form, such as `db:apply`. */
  readonly commandIds: readonly string[];
  readonly topics: readonly string[];
}

/** What oclif appends to every parse error it raises. */
const HELP_HINT = '\nSee more help with --help';

/** oclif's message for an id that names no command, from dispatch and from help. */
const COMMAND_NOT_FOUND = /^command (\S+) not found\.?$/iu;

interface OclifUsageErrorShape {
  readonly oclif?: { readonly exit?: number | false };
  /** What `NonExistentFlagsError` carries: the arguments as typed, such as `--conection=main`. */
  readonly flags?: unknown;
  /** What the argument errors carry. */
  readonly args?: unknown;
}

/**
 * The usage failure behind an error oclif raised while parsing a command's arguments, or `undefined` for any other
 * error. It is recognised by the hint oclif appends, which it adds to every parse error and to a flag's own parse
 * failure, whatever class that failure has.
 */
export function describeUsageError(
  error: unknown,
  context: UsageContext,
): UsageFailure | undefined {
  if (!(error instanceof Error) || isCommandError(error)) return undefined;
  if (!error.message.endsWith(HELP_HINT)) return undefined;
  const shape = error as Error & OclifUsageErrorShape;
  const suggestions: CommandSuggestion[] = [];
  const meant = new Set<string>();
  for (const typed of nonexistentFlagNames(shape.flags)) {
    for (const name of closestMatches(typed, context.flags)) meant.add(name);
  }
  for (const name of meant) {
    suggestions.push({ message: `Did you mean --${name}?` });
  }
  suggestions.push({
    message: Array.isArray(shape.args)
      ? "See the command's arguments:"
      : "See the command's flags:",
    run: {
      command: 'pnpm',
      args: ['nocobase', ...context.words, '--help'],
    },
  });
  const exit = shape.oclif?.exit;
  return {
    message: tidyMessage(error.message.slice(0, -HELP_HINT.length)),
    suggestions,
    exit: typeof exit === 'number' ? exit : 2,
  };
}

/**
 * The usage failure behind oclif's "command not found", or `undefined` for any other error: the closest command ids,
 * the topic's help when the first word is a topic, and the command that lists everything.
 */
export function describeUnknownCommand(
  error: unknown,
  tree: CommandTreeNames,
): UsageFailure | undefined {
  if (!(error instanceof Error) || isCommandError(error)) return undefined;
  const match = COMMAND_NOT_FOUND.exec(error.message);
  if (match?.[1] === undefined) return undefined;
  const typed = match[1].split(':').filter(Boolean);
  const suggestions: CommandSuggestion[] = closestCommandIds(
    typed,
    tree.commandIds,
  ).map((id) => {
    const words = id.split(':');
    return {
      message: `Did you mean ${words.join(' ')}?`,
      run: { command: 'pnpm', args: ['nocobase', ...words] },
    };
  });
  const [topic] = typed;
  if (
    suggestions.length === 0 &&
    typed.length > 1 &&
    topic !== undefined &&
    tree.topics.includes(topic)
  ) {
    suggestions.push({
      message: `See the ${topic} commands:`,
      run: { command: 'pnpm', args: ['nocobase', topic, '--help'] },
    });
  }
  suggestions.push({
    message: 'List every command:',
    run: { command: 'pnpm', args: ['nocobase', 'commands', '--json'] },
  });
  return {
    message: `Command "${typed.join(' ')}" not found.`,
    suggestions,
    exit: 2,
  };
}

/**
 * The command ids closest to what was typed. Each id is compared with as many leading words as it has, because oclif
 * folds every word it cannot place into the id it reports, positional arguments included: `plugn register audit-log`
 * arrives as `plugn:register:audit-log` and still finds `plugin register`.
 */
export function closestCommandIds(
  typed: readonly string[],
  commandIds: readonly string[],
): string[] {
  const scored: ScoredMatch[] = [];
  for (const id of commandIds) {
    const words = id.split(':');
    const input = typed.slice(0, words.length).join(' ');
    const candidate = words.join(' ');
    if (input === '' || input === typed.join(' ')) {
      // Compared in full: the usual typo threshold, with no allowance for a prefix.
      const distance = matchDistance(input, candidate);
      if (distance !== undefined) scored.push({ candidate: id, distance });
      continue;
    }
    // Compared on a prefix of what was typed: close only by edit distance, so trailing arguments never make every
    // one-word command look like a match.
    const distance = editDistance(input, candidate);
    if (distance <= typoAllowance(input)) {
      scored.push({ candidate: id, distance });
    }
  }
  return nearest(scored);
}

/** Every long flag name `command` accepts, as `UsageContext.flags` lists them. Hidden flags are left out. */
export function acceptedFlagNames(command: {
  readonly flags?: Interfaces.FlagInput;
  readonly baseFlags?: Interfaces.FlagInput;
  readonly enableJsonFlag?: boolean;
}): string[] {
  const names = command.enableJsonFlag === true ? ['json'] : [];
  for (const [name, flag] of Object.entries(declaredFlags(command))) {
    if (flag.hidden === true) continue;
    names.push(name, ...(flag.aliases ?? []));
    if (flag.type === 'boolean' && flag.allowNo) names.push(`no-${name}`);
  }
  return names;
}

/** The long flag names in what `NonExistentFlagsError` reports, without dashes or a value. */
function nonexistentFlagNames(flags: unknown): string[] {
  if (!Array.isArray(flags)) return [];
  const names: string[] = [];
  for (const flag of flags) {
    if (typeof flag !== 'string' || !flag.startsWith('--')) continue;
    const [name = ''] = flag.slice(2).split('=');
    if (name !== '') names.push(name);
  }
  return names;
}

/** A parse error's message without terminal colour, and a flag's own parse failure on one line. */
function tidyMessage(message: string): string {
  return stripVTControlCharacters(message)
    .replace(/^Parsing (--\S+) \n\t/u, 'Parsing $1: ')
    .trimEnd();
}
