// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PLACEHOLDER_SECRET } from '@nocobase/app-server/config';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveAuthSecret } from '../../config.js';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createRoot(configFile?: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'auth-secret-'));
  created.push(directory);

  if (configFile) {
    await writeFile(path.join(directory, configFile), 'auth:\n', 'utf8');
  }

  return directory;
}

describe('resolveAuthSecret', () => {
  it('returns a configured secret', async () => {
    const root = await createRoot('config.yml');

    expect(resolveAuthSecret('a-real-secret', root)).toBe('a-real-secret');
  });

  it.each([PLACEHOLDER_SECRET, ` ${PLACEHOLDER_SECRET} `])(
    'rejects a placeholder secret: %s',
    async (secret) => {
      const root = await createRoot('config.yml');
      expect(() => resolveAuthSecret(secret, root)).toThrow(
        'auth.secret is still set to the placeholder',
      );
    },
  );

  it('still requires a secret when a configuration file exists', async () => {
    const root = await createRoot('config.yml');

    expect(() => resolveAuthSecret(undefined, root)).toThrow(
      'auth.secret is required.',
    );
  });

  it('falls back to an install-mode secret when nothing is configured', async () => {
    const root = await createRoot();

    expect(resolveAuthSecret(undefined, root)).toMatch(
      /^nocobase-install-mode-/u,
    );
  });
});
