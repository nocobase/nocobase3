import { AppCommand } from '../../context.ts';
import { CommandError } from '../../command/errors.ts';
import type { Command } from '@oclif/core';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** The locale every other one is compared against. */
const SOURCE_LOCALE = 'en-US';

interface LocaleSide {
  readonly side: 'client' | 'server';
  readonly directory: string;
  readonly locales: readonly string[];
}

export interface LocaleCheckResult {
  readonly ok: boolean;
  readonly sides: readonly LocaleSide[];
  readonly clientOnly: readonly string[];
  readonly serverOnly: readonly string[];
}

/** One side as `locales check` reports it: the directory is left out, since it is always `<side>/locales`. */
export interface LocalesCheckSide {
  readonly side: 'client' | 'server';
  readonly locales: readonly string[];
}

/**
 * What `locales check` returns, and what `error.details` carries when the two sides disagree. Under `--json` the
 * envelope's `ok` says whether they agree.
 */
export interface LocalesCheckCommandResult {
  readonly sides: readonly LocalesCheckSide[];
  readonly clientOnly: readonly string[];
  readonly serverOnly: readonly string[];
}

/**
 * Locales a directory declares, taken from the files beside its `index.ts`.
 *
 * The loader map is not parsed: a locale exists when its file does, which is the same thing and does not depend on how
 * the map happens to be written.
 */
async function readDeclaredLocales(
  directory: string,
): Promise<readonly string[]> {
  try {
    const files = await readdir(directory);
    return files
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .map((file) => path.basename(file, '.ts'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Compares the languages the two halves of an application declare.
 *
 * Exported so it can be exercised against a fixture directory; the command itself only formats what this returns.
 */
export async function checkAppLocales(
  root: string,
): Promise<LocaleCheckResult> {
  const sides: LocaleSide[] = [];
  for (const side of ['client', 'server'] as const) {
    const directory = path.join(root, side, 'locales');
    const locales = await readDeclaredLocales(directory);
    if (locales.length > 0) {
      sides.push({ side, directory, locales });
    }
  }

  const client = sides.find((entry) => entry.side === 'client');
  const server = sides.find((entry) => entry.side === 'server');
  // With only one side present there is nothing to compare: an application whose server produces no text of its own
  // has no reason to carry a server locale file.
  const clientOnly =
    client && server
      ? client.locales.filter((locale) => !server.locales.includes(locale))
      : [];
  const serverOnly =
    client && server
      ? server.locales.filter((locale) => !client.locales.includes(locale))
      : [];

  return {
    ok: clientOnly.length === 0 && serverOnly.length === 0,
    sides,
    clientOnly,
    serverOnly,
  };
}

export default class AppI18nCheck extends AppCommand {
  static override summary =
    'Report languages declared on only one side of the application.';
  static override description =
    'The browser builds its language picker from client/locales, while the server decides what it can answer in from server/locales. A client-only language still works in the interface while server messages fall back to English; this command reports mismatches so server translations can stay aligned when needed.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  public async run(): Promise<LocalesCheckCommandResult> {
    await this.parse(AppI18nCheck);
    const { ok, sides, clientOnly, serverOnly } = await checkAppLocales(
      this.rootDir,
    );
    const report: LocalesCheckCommandResult = {
      sides: sides.map((entry) => ({
        side: entry.side,
        locales: entry.locales,
      })),
      clientOnly,
      serverOnly,
    };

    for (const entry of sides) {
      this.log(`${entry.side}: ${entry.locales.join(', ')}`);
    }

    if (sides.length < 2) {
      this.log(
        'Only one side declares locales; nothing to compare. Add the other when both halves need translated text.',
      );
      return report;
    }

    if (ok) {
      this.log('\nClient and server declare the same languages.');
      return report;
    }

    this.log('');
    for (const locale of clientOnly) {
      this.log(
        `  ${locale}: declared in client/locales only — the picker offers it, and server messages fall back to ${SOURCE_LOCALE}.`,
      );
    }
    for (const locale of serverOnly) {
      this.log(
        `  ${locale}: declared in server/locales only — nothing can select it.`,
      );
    }
    throw new CommandError('Client and server declare different languages.', {
      code: 'LOCALES_MISMATCH',
      suggestions: [
        `Add the matching file when both halves need this language; copy ${SOURCE_LOCALE}.ts from the other side as a starting point.`,
      ],
      details: report,
    });
  }
}
