// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveConfigWatch } from '../../scripts/dev-config-watch.mjs';

describe('development config watch', () => {
  it('watches all supported default config filenames', () => {
    const watch = resolveConfigWatch('/app');

    expect(watch.directory).toBe('/app');
    expect([...watch.filenames]).toEqual([
      'config.yml',
      'config.yaml',
      'config.json',
    ]);
  });

  it('watches only the explicitly configured file', () => {
    const watch = resolveConfigWatch('/app', 'settings/custom.json');

    expect(watch.directory).toBe(path.join('/app', 'settings'));
    expect([...watch.filenames]).toEqual(['custom.json']);
  });
});
