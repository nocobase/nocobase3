// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import LocalesCheck, {
  checkAppLocales,
} from '../src/commands/locales/check.ts';
import { CommandError } from '../src/command/errors.ts';
import { bindAppCommand } from './app-command.ts';
import { runAppCommand } from './command-output.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(
  sides: Record<'client' | 'server', readonly string[]>,
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'i18n-check-'));
  roots.push(root);
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', nocobase: { templateKind: 'default' } }),
  );

  for (const [side, locales] of Object.entries(sides)) {
    if (locales.length === 0) continue;
    const directory = path.join(root, side, 'locales');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'index.ts'), 'export default {};\n');
    for (const locale of locales) {
      writeFileSync(
        path.join(directory, `${locale}.ts`),
        'export default {};\n',
      );
    }
  }

  return root;
}

it('passes when both sides declare the same languages', async () => {
  const result = await checkAppLocales(
    fixture({ client: ['en-US', 'zh-CN'], server: ['en-US', 'zh-CN'] }),
  );

  expect(result.ok).toBe(true);
  expect(result.clientOnly).toEqual([]);
  expect(result.serverOnly).toEqual([]);
});

// The mismatch remains useful to report even though the browser may offer a language the server handles in English.
it('reports a client-only language difference', async () => {
  const result = await checkAppLocales(
    fixture({
      client: ['en-US', 'es-ES', 'zh-CN'],
      server: ['en-US', 'zh-CN'],
    }),
  );

  expect(result.ok).toBe(false);
  expect(result.clientOnly).toEqual(['es-ES']);
  expect(result.serverOnly).toEqual([]);
});

it('reports a language only the server declares, which nothing can select', async () => {
  const result = await checkAppLocales(
    fixture({ client: ['en-US'], server: ['en-US', 'ja-JP'] }),
  );

  expect(result.ok).toBe(false);
  expect(result.serverOnly).toEqual(['ja-JP']);
});

// An application whose server produces no text of its own carries no server locale file, and that is not a defect.
it('passes when only one side declares locales at all', async () => {
  const result = await checkAppLocales(
    fixture({ client: ['en-US', 'zh-CN'], server: [] }),
  );

  expect(result.ok).toBe(true);
  expect(result.sides).toHaveLength(1);
});

it('ignores index.ts when reading the declared languages', async () => {
  const result = await checkAppLocales(
    fixture({ client: ['en-US'], server: ['en-US'] }),
  );

  expect(result.sides.map((side) => side.locales)).toEqual([
    ['en-US'],
    ['en-US'],
  ]);
});

it('returns both sides as the --json result when they agree', async () => {
  const root = fixture({
    client: ['en-US', 'zh-CN'],
    server: ['en-US', 'zh-CN'],
  });
  const run = await runAppCommand(
    bindAppCommand(LocalesCheck, { rootDir: root }),
    ['--json'],
    root,
  );

  expect(run.json()).toEqual({
    schemaVersion: 1,
    ok: true,
    command: expect.any(String),
    status: 'success',
    result: {
      sides: [
        { side: 'client', locales: ['en-US', 'zh-CN'] },
        { side: 'server', locales: ['en-US', 'zh-CN'] },
      ],
      clientOnly: [],
      serverOnly: [],
    },
    warnings: [],
  });
  expect(run.exitCode).toBeUndefined();
});

it('fails with LOCALES_MISMATCH and the comparison in error.details', async () => {
  const root = fixture({
    client: ['en-US', 'es-ES'],
    server: ['en-US', 'ja-JP'],
  });
  const run = await runAppCommand(
    bindAppCommand(LocalesCheck, { rootDir: root }),
    ['--json'],
    root,
  );

  expect(run.json()).toMatchObject({
    ok: false,
    status: 'failure',
    error: {
      code: 'LOCALES_MISMATCH',
      details: {
        sides: [
          { side: 'client', locales: ['en-US', 'es-ES'] },
          { side: 'server', locales: ['en-US', 'ja-JP'] },
        ],
        clientOnly: ['es-ES'],
        serverOnly: ['ja-JP'],
      },
    },
  });
  expect(run.exitCode).toBe(1);
});

it('prints each mismatch for people and exits non-zero', async () => {
  const root = fixture({ client: ['en-US', 'es-ES'], server: ['en-US'] });
  const run = await runAppCommand(
    bindAppCommand(LocalesCheck, { rootDir: root }),
    [],
    root,
  );

  expect(run.stdout).toContain('es-ES: declared in client/locales only');
  expect(run.error).toBeInstanceOf(CommandError);
  expect(run.error).toMatchObject({
    oclif: { exit: 1 },
    suggestions: [expect.stringContaining('copy en-US.ts')],
  });
});
