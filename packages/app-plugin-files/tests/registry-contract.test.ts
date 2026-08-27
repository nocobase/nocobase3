import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface RegistrySource {
  readonly include: readonly string[];
  readonly root: string;
  readonly target: string;
}

interface RegistryItem {
  readonly name: string;
  readonly source: RegistrySource;
}

interface RegistryConfig {
  readonly items: readonly RegistryItem[];
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

describe('files plugin Registry contract', () => {
  it('reserves the two canonical item roots and targets', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'registry.config.json'), 'utf8'),
    ) as RegistryConfig;

    expect(config.items).toEqual([
      expect.objectContaining({
        name: 'file-field-ui',
        source: {
          root: 'registry/file-field-ui',
          target: 'client/extensions/nocobase-files-file-field-ui',
          include: ['.'],
        },
      }),
      expect.objectContaining({
        name: 'demo-page-ui',
        source: {
          root: 'registry/demo-page-ui',
          target: 'client/extensions/nocobase-files-demo-page-ui',
          include: ['.'],
        },
      }),
    ]);

    for (const item of config.items) {
      expect(fs.existsSync(path.join(packageRoot, item.source.root))).toBe(
        true,
      );
    }
  });
});
