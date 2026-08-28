// @vitest-environment node

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import tailwindConfig from '../../tailwind.config.mjs';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

describe('tailwind content sources', () => {
  const content = tailwindConfig.content as string[];

  it('scans the client files of every enabled plugin', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
    ) as { nocobase?: { plugins?: Record<string, { enabled?: boolean }> } };
    const plugins = Object.entries(manifest.nocobase?.plugins ?? {})
      .filter(
        ([name, config]) =>
          config.enabled && name.startsWith('@nocobase/app-plugin-'),
      )
      .map(([name]) => name.slice('@nocobase/'.length));

    expect(plugins.length).toBeGreaterThan(0);

    // A plugin with no client surface contributes no files, so only those that ship one are required to appear.
    const withClient = plugins.filter((plugin) =>
      ['client', 'dist/client'].some((directory) =>
        existsSync(
          path.join(appRoot, 'node_modules/@nocobase', plugin, directory),
        ),
      ),
    );
    expect(withClient.length).toBeGreaterThan(0);

    for (const plugin of withClient) {
      expect(
        content.some((file) => file.includes(plugin)),
        `${plugin} contributes no scanned files; its utility classes would be missing from the stylesheet`,
      ).toBe(true);
    }
  });

  it('resolves past the symlinks pnpm installs dependencies as', () => {
    // The bug this guards: a wildcard `@source` matches nothing through a pnpm symlink, so every path here must be a
    // real one that exists. An empty list would mean the whole mechanism silently stopped working.
    expect(content.length).toBeGreaterThan(0);
    for (const file of content.slice(0, 20)) {
      expect(path.isAbsolute(file)).toBe(true);
      expect(existsSync(file)).toBe(true);
    }

    // Every path must be resolved, not merely reachable. A path still routed through `node_modules/@nocobase/<pkg>`
    // is one Tailwind's scanner would refuse to expand a wildcard through, which is exactly how this broke before.
    for (const file of content) {
      expect(file).not.toContain(`node_modules${path.sep}@nocobase${path.sep}`);
    }
  });

  it('scans a plugin that ships only build output, as an installed one does', () => {
    // The original failure was invisible in this repository, where plugins expose TypeScript sources, and only showed
    // up in a generated application, where they ship `dist/client`. Asserting the built layout is covered keeps the
    // configuration honest about the case it exists for.
    const scope = path.join(appRoot, 'node_modules/@nocobase');
    const distOnly = readdirSync(scope).filter(
      (name) =>
        name.startsWith('app-plugin-') &&
        existsSync(path.join(scope, name, 'dist/client')),
    );

    expect(distOnly.length).toBeGreaterThan(0);
    for (const plugin of distOnly) {
      const built = realpathSync(path.join(scope, plugin, 'dist/client'));
      expect(
        content.some((file) => file.startsWith(built + path.sep)),
        `${plugin} ships dist/client, but none of its built files are scanned`,
      ).toBe(true);
    }
  });

  it('is wired into the stylesheet, without the wildcard sources it replaced', () => {
    const styles = readFileSync(
      path.join(appRoot, 'client/styles.css'),
      'utf8',
    );

    expect(styles).toContain('@config "../tailwind.config.mjs"');
    expect(styles).not.toContain('app-plugin-*');
  });

  it('is published, so a generated application has the file @config points at', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
    ) as { files?: string[] };

    expect(packageJson.files).toContain('tailwind.config.mjs');
  });
});
