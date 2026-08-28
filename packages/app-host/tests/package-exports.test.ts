// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

describe('app-host package exports', () => {
  it('resolves source in the workspace and compiled files when published', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      exports: Record<string, { import: string; types: string }>;
      publishConfig: {
        exports: Record<string, { import: string; types: string }>;
      };
    };

    expect(manifest.exports).toEqual({
      '.': { types: './src/index.ts', import: './src/index.ts' },
      './supervisor': {
        types: './src/supervisor.ts',
        import: './src/supervisor.ts',
      },
      './catalog': {
        types: './src/app-catalog.ts',
        import: './src/app-catalog.ts',
      },
      './registry': {
        types: './src/app-registry.ts',
        import: './src/app-registry.ts',
      },
      './types': {
        types: './src/app-types.ts',
        import: './src/app-types.ts',
      },
    });
    expect(manifest.publishConfig.exports).toEqual({
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './supervisor': {
        types: './dist/supervisor.d.ts',
        import: './dist/supervisor.js',
      },
      './catalog': {
        types: './dist/app-catalog.d.ts',
        import: './dist/app-catalog.js',
      },
      './registry': {
        types: './dist/app-registry.d.ts',
        import: './dist/app-registry.js',
      },
      './types': {
        types: './dist/app-types.d.ts',
        import: './dist/app-types.js',
      },
    });
  });
});
