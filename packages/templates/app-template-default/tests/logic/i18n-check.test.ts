// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { checkAppLocales } from '../../cli/commands/i18n-check.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(
  sides: Record<'client' | 'server', readonly string[]>,
): string {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'i18n-check-'));
  roots.push(root);

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

// The failure this command exists for: the picker offers Spanish, and `POST /api/i18n/locale` rejects it.
it('reports a language the browser offers and the server would reject', async () => {
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
