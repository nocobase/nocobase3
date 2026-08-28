import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..');

describe('package contract', () => {
  it('publishes the executable expected by pnpm create @nocobase/hub', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    );

    expect(manifest).toMatchObject({
      name: '@nocobase/create-hub',
      version: '0.0.1',
      bin: { 'create-hub': './bin/run.js' },
      publishConfig: { access: 'public' },
    });
    expect(manifest.private).not.toBe(true);
    expect(manifest.files).toEqual(
      expect.arrayContaining(['bin', 'dist', 'README.md']),
    );
    await expect(
      access(path.join(packageRoot, 'bin/run.js'), constants.X_OK),
    ).resolves.toBeUndefined();
  });
});
