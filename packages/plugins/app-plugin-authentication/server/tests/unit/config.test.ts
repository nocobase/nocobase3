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

  /**
   * `config.example.yml` declares `auth.secret` as a live key carrying this value, so that the generator can fill it
   * in by replacing a value. A `config.yml` copied from the example by hand therefore arrives with a secret that is
   * present, non-empty, and identical across every installation — which every other check here would accept.
   */
  it('rejects the placeholder the example ships', async () => {
    const root = await createRoot('config.yml');

    expect(() => resolveAuthSecret(PLACEHOLDER_SECRET, root)).toThrow(
      'auth.secret is still set to the placeholder',
    );
  });

  /** The placeholder is not a way back into install mode, which would hand out a working application instead. */
  it('rejects it even when no configuration file exists', async () => {
    const root = await createRoot();

    expect(() => resolveAuthSecret(PLACEHOLDER_SECRET, root)).toThrow(
      'auth.secret is still set to the placeholder',
    );
  });

  it('rejects it with surrounding whitespace too', async () => {
    const root = await createRoot('config.yml');

    expect(() => resolveAuthSecret(` ${PLACEHOLDER_SECRET} `, root)).toThrow(
      'auth.secret is still set to the placeholder',
    );
  });

  it('still requires a secret when a configuration file exists', async () => {
    const root = await createRoot('config.yml');

    expect(() => resolveAuthSecret(undefined, root)).toThrow(
      'auth.secret is required.',
    );
  });

  /** An application that has not been configured yet runs the installer, which is what sets the secret. */
  it('falls back to an install-mode secret when nothing is configured', async () => {
    const root = await createRoot();

    expect(resolveAuthSecret(undefined, root)).toMatch(
      /^nocobase-install-mode-/u,
    );
  });
});
