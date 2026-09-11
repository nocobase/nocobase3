import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
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

export default class AppI18nCheck extends Command {
  static override summary =
    'Report languages declared on only one side of the application.';
  static override description =
    'The browser builds its language picker from client/locales, while the server decides what it will answer in from server/locales. A language present in only one is one the interface offers and the server refuses, so the two lists have to agree.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ];

  static override flags: {
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppI18nCheck);
    const root = path.resolve(import.meta.dirname, '..', '..');
    const result = await checkAppLocales(root);
    const { ok, sides, clientOnly, serverOnly } = result;

    if (flags.json) {
      this.logJson({
        ok: result.ok,
        sides: result.sides.map((entry) => ({
          side: entry.side,
          locales: entry.locales,
        })),
        clientOnly: result.clientOnly,
        serverOnly: result.serverOnly,
      });
      if (!ok) this.exit(1);
      return;
    }

    for (const entry of sides) {
      this.log(`${entry.side}: ${entry.locales.join(', ')}`);
    }

    if (sides.length < 2) {
      this.log(
        'Only one side declares locales; nothing to compare. Add the other to serve that language from both halves.',
      );
      return;
    }

    if (ok) {
      this.log('\nClient and server declare the same languages.');
      return;
    }

    this.log('');
    for (const locale of clientOnly) {
      this.log(
        `  ${locale}: declared in client/locales only — the picker offers it, the server rejects it.`,
      );
    }
    for (const locale of serverOnly) {
      this.log(
        `  ${locale}: declared in server/locales only — nothing can select it.`,
      );
    }
    this.log(
      `\nAdd the missing file, copying ${SOURCE_LOCALE}.ts from the other side as a starting point.`,
    );
    this.exit(1);
  }
}
