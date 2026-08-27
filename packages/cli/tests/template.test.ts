import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HUB_TEMPLATE,
  DEFAULT_REGISTRY,
  downloadTemplate,
  isLocalTemplateSource,
} from '../src/lib/template.ts';

const workspaceTemplate = path.resolve(
  import.meta.dirname,
  '../../app-template-default',
);

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('isLocalTemplateSource', () => {
  it('treats paths as local', () => {
    expect(isLocalTemplateSource('./packages/app-template-default')).toBe(true);
    expect(isLocalTemplateSource('../template')).toBe(true);
    expect(isLocalTemplateSource('/abs/path')).toBe(true);
    expect(isLocalTemplateSource('~/template')).toBe(true);
    expect(isLocalTemplateSource('C:\\template')).toBe(true);
  });

  it('treats package specifiers as remote', () => {
    expect(isLocalTemplateSource('@nocobase/app-template-default')).toBe(false);
    expect(isLocalTemplateSource('@nocobase/app-template-default@3.1.1')).toBe(
      false,
    );
    expect(isLocalTemplateSource('some-template')).toBe(false);
  });
});

describe('DEFAULT_HUB_TEMPLATE', () => {
  // Pinning an exact version would make `create` reproducible, but there is no stable v3 release to pin to yet. Until
  // one ships the defaults track the `beta` dist-tag, which means two runs a week apart can scaffold different code.
  // The assertion below only guarantees the specifier carries an explicit channel or version — never a bare name that
  // would silently resolve to `latest`.
  it('carries an explicit channel so create never falls back to latest', () => {
    expect(DEFAULT_HUB_TEMPLATE).toMatch(/@(?:\d+\.\d+\.\d+|beta|alpha|next)$/);
  });
});

describe('DEFAULT_REGISTRY', () => {
  it('points at the self-hosted registry that carries the v3 packages', () => {
    expect(DEFAULT_REGISTRY).toBe('https://npm.nocobase.ai');
  });
});

describe('downloadTemplate', () => {
  // Reaches the registry, so it is given room beyond the default per-test budget.
  it(
    'reports the source when a package cannot be fetched',
    { timeout: 60_000 },
    async () => {
      await expect(
        downloadTemplate({ source: '@nocobase/this-template-does-not-exist' }),
      ).rejects.toThrow(/this-template-does-not-exist/);
    },
  );

  it('leaves no extract directory behind when it fails', async () => {
    const notAPackage = await mkdtemp(
      path.join(os.tmpdir(), 'nb3-not-a-package-'),
    );
    created.push(notAPackage);

    const before = await countTempDirectories();
    await downloadTemplate({ source: notAPackage }).catch(() => undefined);

    expect(await countTempDirectories()).toBe(before);
  });

  /**
   * The whole reason a local template goes through `pnpm pack` rather than `npm pack`: only pnpm understands its own
   * `workspace:` and `catalog:` protocols and resolves them into real version ranges. If this ever regressed, the
   * generated project would carry protocols that npm cannot install, and it would fail only at install time.
   */
  it(
    'resolves workspace and catalog protocols when packing a local template',
    { timeout: 120_000 },
    async () => {
      const template = await downloadTemplate({ source: workspaceTemplate });
      created.push(template.directory);

      const manifest = JSON.parse(
        await readFile(path.join(template.directory, 'package.json'), 'utf8'),
      );
      const ranges = Object.values({
        ...manifest.dependencies,
        ...manifest.devDependencies,
      }).map(String);

      expect(ranges.filter((range) => range.startsWith('workspace:'))).toEqual(
        [],
      );
      expect(ranges.filter((range) => range.startsWith('catalog:'))).toEqual(
        [],
      );
      expect(ranges.length).toBeGreaterThan(0);
    },
  );

  it('rejects a local directory that is not a package', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'nb3-not-a-package-'));
    created.push(empty);

    await expect(downloadTemplate({ source: empty })).rejects.toThrow();
  });
});

async function countTempDirectories(): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(os.tmpdir());

  return entries.filter((entry) => entry.startsWith('nb3-template-')).length;
}
