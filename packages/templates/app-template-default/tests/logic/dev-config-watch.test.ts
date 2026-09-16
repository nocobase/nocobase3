// @vitest-environment node

import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  resolveConfigWatch,
  watchConfigFiles,
} from '../../scripts/dev/config-watch.mjs';

describe('development config watch', () => {
  it('watches all supported default config filenames', () => {
    const watch = resolveConfigWatch('/app');

    expect(watch.directory).toBe('/app');
    expect([...watch.filenames]).toEqual([
      'config.yml',
      'config.yaml',
      'config.toml',
      'config.json',
    ]);
  });

  it('watches only the explicitly configured file', () => {
    const watch = resolveConfigWatch('/app', 'settings/custom.json');

    expect(watch.directory).toBe(path.join('/app', 'settings'));
    expect([...watch.filenames]).toEqual(['custom.json']);
  });
});

it('observes config creation, atomic replacement, and deletion through polling', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'nocobase-config-watch-'));
  const onChange = vi.fn();
  const watcher = watchConfigFiles(resolveConfigWatch(root), onChange);
  try {
    const config = path.join(root, 'config.yml');
    await writeFile(config, 'value: 1');
    await vi.waitFor(
      () => expect(onChange).toHaveBeenCalledWith('change', 'config.yml'),
      { timeout: 3000 },
    );
    onChange.mockClear();
    const replacement = path.join(root, 'config.tmp');
    await writeFile(replacement, 'value: 2');
    await rename(replacement, config);
    await vi.waitFor(
      () => expect(onChange).toHaveBeenCalledWith('change', 'config.yml'),
      { timeout: 3000 },
    );
    onChange.mockClear();
    await rm(config);
    await vi.waitFor(
      () => expect(onChange).toHaveBeenCalledWith('change', 'config.yml'),
      { timeout: 3000 },
    );
  } finally {
    watcher.close();
    await rm(root, { recursive: true, force: true });
  }
});
