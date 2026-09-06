// @vitest-environment node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

const templateName = JSON.parse(
  readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
).name as string;

/**
 * Sources `create-app` rewrites the template's package name in, mirroring `PACKAGE_NAME_SOURCES` in
 * `packages/tools/create-app/src/lib/scaffold.ts`.
 */
const REWRITTEN_SOURCES = [
  'client/runtime.ts',
  'client/service-provider.ts',
  'server/providers/app-example.ts',
];

/** Source trees shipped to a generated application, per the `files` field. */
const SHIPPED_SOURCE_DIRECTORIES = ['client', 'server', 'database', 'scripts'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);

function sourceFilesIn(directory: string): string[] {
  const absolute = path.join(appRoot, directory);

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];

    const relative = path.join(directory, entry.name);

    if (entry.isDirectory()) return sourceFilesIn(relative);
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];

    return [relative];
  });
}

describe('template package name', () => {
  /**
   * `create-app` rewrites this name to the application's in a fixed list of files. A source that embeds it but is not
   * on that list ships the template's name into every generated application, where the client would then declare an
   * i18n namespace the server does not share and `pnpm client:inspect` would refuse to run.
   *
   * When this fails, either rewrite the new occurrence to derive the name at runtime, or add the file to
   * `PACKAGE_NAME_SOURCES` in `packages/tools/create-app/src/lib/scaffold.ts` and to `REWRITTEN_SOURCES` above.
   */
  it('appears only in the sources create-app rewrites', () => {
    const offenders = SHIPPED_SOURCE_DIRECTORIES.filter((directory) =>
      statSync(path.join(appRoot, directory), { throwIfNoEntry: false }),
    )
      .flatMap((directory) => sourceFilesIn(directory))
      .filter((relative) => !REWRITTEN_SOURCES.includes(relative))
      .filter((relative) =>
        readFileSync(path.join(appRoot, relative), 'utf8').includes(
          templateName,
        ),
      );

    expect(offenders).toEqual([]);
  });

  /** The rewrite list is only correct while every file on it exists and still carries the name. */
  it('is present in every source create-app expects to rewrite', () => {
    for (const relative of REWRITTEN_SOURCES) {
      expect(
        readFileSync(path.join(appRoot, relative), 'utf8'),
        `${relative} no longer contains ${templateName}`,
      ).toContain(templateName);
    }
  });
});
