import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_REGISTRY,
  DEFAULT_TEMPLATE,
  downloadTemplate,
  isLocalTemplateSource,
  isTemplateAlias,
  resolveTemplateSource,
  TEMPLATE_ALIASES,
} from '../src/lib/template.ts';

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
    expect(isLocalTemplateSource('@nocobase/app-template-default@beta')).toBe(
      false,
    );
    expect(isLocalTemplateSource('some-template')).toBe(false);
  });
});

describe('DEFAULT_TEMPLATE', () => {
  it('is a name rather than a package specifier', () => {
    expect(DEFAULT_TEMPLATE).toBe('default');
    expect(isTemplateAlias(DEFAULT_TEMPLATE)).toBe(true);
  });
});

describe('TEMPLATE_ALIASES', () => {
  it('maps the default name to the app template', () => {
    expect(TEMPLATE_ALIASES.default).toContain(
      '@nocobase/app-template-default',
    );
  });

  /**
   * Pinning an exact version would make `create` reproducible, but there is no stable v3 release to pin to yet. The
   * assertion only guarantees every alias names its channel outright, so which versions an alias resolves to is a
   * decision recorded here rather than whatever a bare package name happens to resolve to.
   */
  it('gives every alias an explicit channel or version', () => {
    for (const specifier of Object.values(TEMPLATE_ALIASES)) {
      expect(specifier).toMatch(/@(?:\d+\.\d+\.\d+|latest|beta|alpha|next)$/u);
    }
  });

  /**
   * changesets leaves the `beta` dist-tag on a package's first published version and tags every release since as
   * `latest`, so `beta` points at the oldest template rather than the newest. Pointing `default` there handed everyone
   * a stale template — an app scaffolded from it missed settings later releases added to `.env.example`.
   */
  it('tracks latest rather than the stale beta tag', () => {
    expect(TEMPLATE_ALIASES.default).toBe(
      '@nocobase/app-template-default@latest',
    );
  });
});

describe('resolveTemplateSource', () => {
  it('expands a known name into its package', () => {
    expect(resolveTemplateSource('default')).toBe(TEMPLATE_ALIASES.default);
  });

  it('ignores surrounding whitespace', () => {
    expect(resolveTemplateSource('  default  ')).toBe(TEMPLATE_ALIASES.default);
  });

  /**
   * An alias table that swallowed package specifiers and paths would make the flag less capable than it was, so
   * anything unknown passes through untouched.
   */
  it('passes a package specifier through untouched', () => {
    expect(resolveTemplateSource('@nocobase/app-template-default@0.0.1')).toBe(
      '@nocobase/app-template-default@0.0.1',
    );
    expect(resolveTemplateSource('some-other-template')).toBe(
      'some-other-template',
    );
  });

  it('passes a local path through untouched', () => {
    expect(resolveTemplateSource('./packages/app-template-default')).toBe(
      './packages/app-template-default',
    );
  });
});

describe('isTemplateAlias', () => {
  it('recognizes only the names in the table', () => {
    expect(isTemplateAlias('default')).toBe(true);
    expect(isTemplateAlias('@nocobase/app-template-default')).toBe(false);
    expect(isTemplateAlias('./local')).toBe(false);
  });

  /** Inherited Object properties must not read as templates. */
  it('is not fooled by inherited properties', () => {
    expect(isTemplateAlias('constructor')).toBe(false);
    expect(isTemplateAlias('toString')).toBe(false);
  });
});

describe('DEFAULT_REGISTRY', () => {
  /**
   * `pnpm create` resolves this package from whichever registry the user configured, but the template lives only on
   * the self-hosted one. The two are independent, and this default is what makes the documented invocation work.
   */
  it('points at the self-hosted registry that carries the v3 packages', () => {
    expect(DEFAULT_REGISTRY).toBe('https://npm.nocobase.ai');
  });
});

describe('downloadTemplate', () => {
  it(
    'reports the source when a package cannot be fetched',
    { timeout: 60_000 },
    async () => {
      await expect(
        downloadTemplate({ source: '@nocobase/this-template-does-not-exist' }),
      ).rejects.toThrow(/this-template-does-not-exist/u);
    },
  );

  it('leaves no extract directory behind when it fails', async () => {
    const notAPackage = await mkdtemp(
      path.join(os.tmpdir(), 'create-app-not-a-package-'),
    );
    created.push(notAPackage);

    const before = await countTempDirectories();
    await downloadTemplate({ source: notAPackage }).catch(() => undefined);

    expect(await countTempDirectories()).toBe(before);
  });

  it('rejects a local directory that is not a package', async () => {
    const empty = await mkdtemp(
      path.join(os.tmpdir(), 'create-app-not-a-package-'),
    );
    created.push(empty);

    await expect(downloadTemplate({ source: empty })).rejects.toThrow();
  });
});

async function countTempDirectories(): Promise<number> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(os.tmpdir());

  return entries.filter((entry) => entry.startsWith('nocobase-template-'))
    .length;
}
