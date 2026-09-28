// The command tree as data: what `nocobase commands` returns, for agents and scripts that would otherwise scrape
// `--help`.
//
// It reads the command classes the runner assembled rather than oclif's cached metadata, because the cache evaluates a
// dynamic default and drops a boolean flag's default altogether; the catalog reports a default only when it is static.
import type { Command } from '@oclif/core';

import {
  declaredFlags,
  isAppPathFlag,
  type DeclaredFlag,
} from '../command/flags.ts';
import type { AppCliCommand } from '../plugins/types.ts';
import type { AssembledCli, CommandSource } from './assemble.ts';

export interface CommandArgInfo {
  readonly name: string;
  readonly description: string | null;
  readonly required: boolean;
}

export interface CommandFlagInfo {
  /** The long name, without dashes. */
  readonly name: string;
  /** The single-letter alias, when the flag has one. */
  readonly char?: string;
  /** `boolean` takes no value; `option` takes one. */
  readonly type: 'boolean' | 'option';
  readonly description: string | null;
  readonly required: boolean;
  /** Whether the flag may be given more than once. */
  readonly multiple: boolean;
  /** Present only for a boolean flag that also accepts `--no-<name>`. */
  readonly allowNo?: true;
  /** The default when it is a fixed value; left out when there is none or it is computed at run time. */
  readonly default?: unknown;
  /**
   * `application-root` for a path flag declared with `appPath()`: its `default` is relative to the application root,
   * wherever the command runs, while a typed value resolves from the current directory.
   */
  readonly defaultRelativeTo?: 'application-root';
  /** The only values the flag accepts, when it restricts them. */
  readonly options?: readonly string[];
}

export interface CommandExampleInfo {
  /** The command line, with the bin and the command id filled in. */
  readonly command: string;
  readonly description?: string;
}

export interface CommandInfo {
  /** Space-separated, as typed: `db apply`. */
  readonly id: string;
  readonly summary: string | null;
  readonly description: string | null;
  readonly source: CommandSource;
  /** The plugin package, for `source: 'plugin'`. */
  readonly package?: string;
  /** Absent from a built `dist/`. */
  readonly developmentOnly: boolean;
  /** Whether the command takes `--json` and answers with the one JSON document. */
  readonly json: boolean;
  /** Whether it has a `--dry-run` flag. */
  readonly dryRun: boolean;
  /** Whether it has a `--force` flag. */
  readonly force: boolean;
  readonly args: readonly CommandArgInfo[];
  /** Every visible flag except `--json`, which `json` reports. */
  readonly flags: readonly CommandFlagInfo[];
  readonly examples: readonly CommandExampleInfo[];
}

export interface TopicInfo {
  readonly name: string;
  readonly description: string;
  readonly source: CommandSource;
  /** The plugin package, for `source: 'plugin'`. */
  readonly package?: string;
}

export interface CommandCatalog {
  readonly commands: readonly CommandInfo[];
  readonly topics: readonly TopicInfo[];
}

/** Every visible command and topic in `assembled`, sorted by id and name. */
export function describeCommandTree(
  assembled: AssembledCli,
  { bin }: { readonly bin: string },
): CommandCatalog {
  const commands: CommandInfo[] = [];
  for (const [key, command] of Object.entries(assembled.commands)) {
    if (command.hidden === true) continue;
    const id = key.split(':').join(' ');
    const origin = assembled.commandOrigins[key] ?? {
      source: 'builtin',
      developmentOnly: false,
    };
    const render = (text: string): string => renderTemplate(text, bin, id);
    const flags = describeFlags(command);
    commands.push({
      id,
      summary: textOrNull(command.summary, render),
      description: textOrNull(command.description, render),
      source: origin.source,
      ...(origin.package === undefined ? {} : { package: origin.package }),
      developmentOnly: origin.developmentOnly,
      json: command.enableJsonFlag === true,
      dryRun: flags.some((flag) => flag.name === 'dry-run'),
      force: flags.some((flag) => flag.name === 'force'),
      args: describeArgs(command),
      flags,
      examples: describeExamples(command.examples, bin, render),
    });
  }
  const topics: TopicInfo[] = Object.entries(assembled.topics).map(
    ([name, topic]) => {
      const origin = assembled.topicOrigins[name] ?? { source: 'builtin' };
      return {
        name,
        description: topic.description,
        source: origin.source,
        ...(origin.package === undefined ? {} : { package: origin.package }),
      };
    },
  );
  return {
    commands: commands.sort((a, b) => a.id.localeCompare(b.id)),
    topics: topics.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** The catalog for people: each command's id and summary, top-level commands first, then one group per topic. */
export function formatCommandCatalog(catalog: CommandCatalog): string {
  const width = Math.max(0, ...catalog.commands.map((c) => c.id.length)) + 2;
  const topics = new Map(catalog.topics.map((topic) => [topic.name, topic]));
  const groups = new Map<string, CommandInfo[]>();
  for (const command of catalog.commands) {
    const [head = command.id] = command.id.split(' ');
    const group = topics.has(head) ? head : '';
    groups.set(group, [...(groups.get(group) ?? []), command]);
  }
  const blocks: string[] = [];
  const line = (command: CommandInfo): string =>
    `  ${command.id.padEnd(width)}${command.summary ?? ''}`.trimEnd();
  const topLevel = groups.get('');
  if (topLevel !== undefined) {
    blocks.push(['Commands', ...topLevel.map(line)].join('\n'));
  }
  for (const [name, commands] of groups) {
    if (name === '') continue;
    const description = topics.get(name)?.description;
    const heading =
      description === undefined ? name : `${name}: ${description}`;
    blocks.push([heading, ...commands.map(line)].join('\n'));
  }
  return blocks.join('\n\n');
}

function describeArgs(command: AppCliCommand): CommandArgInfo[] {
  return Object.entries(command.args ?? {})
    .filter(([, arg]) => arg.hidden !== true)
    .map(([name, arg]) => ({
      name,
      description: arg.description ?? null,
      required: arg.required === true,
    }));
}

function describeFlags(command: AppCliCommand): CommandFlagInfo[] {
  return Object.entries(declaredFlags(command))
    .filter(([name, flag]) => name !== 'json' && flag.hidden !== true)
    .map(([name, flag]) => describeFlag(name, flag));
}

function describeFlag(name: string, flag: DeclaredFlag): CommandFlagInfo {
  const fixedDefault =
    flag.default !== undefined && typeof flag.default !== 'function';
  const options = flag.type === 'option' ? flag.options : undefined;
  return {
    name,
    ...(flag.char === undefined ? {} : { char: flag.char }),
    type: flag.type === 'boolean' ? 'boolean' : 'option',
    description: flag.description ?? flag.summary ?? null,
    required: flag.required === true,
    multiple: flag.type === 'option' && flag.multiple === true,
    ...(flag.type === 'boolean' && flag.allowNo
      ? { allowNo: true as const }
      : {}),
    ...(fixedDefault ? { default: flag.default } : {}),
    ...(fixedDefault && isAppPathFlag(flag)
      ? { defaultRelativeTo: 'application-root' as const }
      : {}),
    ...(options === undefined ? {} : { options: [...options] }),
  };
}

/**
 * Examples as oclif's help lays them out: a string is one command per line, unless its first line is prose and the
 * rest are commands, in which case the first line describes them.
 */
function describeExamples(
  examples: readonly Command.Example[] | undefined,
  bin: string,
  render: (text: string) => string,
): CommandExampleInfo[] {
  const described: CommandExampleInfo[] = [];
  for (const example of examples ?? []) {
    if (typeof example !== 'string') {
      described.push({
        command: render(example.command),
        description: render(example.description),
      });
      continue;
    }
    const lines = example
      .split(/\r?\n/u)
      .map((text) => render(text).trim())
      .filter(Boolean);
    const isCommand = (text: string): boolean =>
      text.startsWith(`${bin} `) || text === bin || text.startsWith('$ ');
    const [first, ...rest] = lines;
    if (
      first !== undefined &&
      rest.length > 0 &&
      !isCommand(first) &&
      rest.every(isCommand)
    ) {
      for (const command of rest) {
        described.push({ command, description: first });
      }
      continue;
    }
    for (const command of lines) described.push({ command });
  }
  return described;
}

function textOrNull(
  text: string | undefined,
  render: (text: string) => string,
): string | null {
  return text === undefined || text === '' ? null : render(text);
}

/** Fills in the two placeholders oclif's own help renders in examples and descriptions. */
function renderTemplate(text: string, bin: string, id: string): string {
  return text
    .replaceAll(/<%[=-]\s*config\.bin\s*%>/gu, bin)
    .replaceAll(/<%[=-]\s*command\.id\s*%>/gu, id);
}
