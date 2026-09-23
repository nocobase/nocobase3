// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findConfigurationSource } from '../src/scripts/utils/config-presence.mjs';

const directories: string[] = [];

afterEach(async () => {
  while (directories.length > 0) {
    await rm(directories.pop()!, { recursive: true, force: true });
  }
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'nocobase-config-presence-'));
  directories.push(root);
  return root;
}

describe('findConfigurationSource', () => {
  it.each(['yml', 'yaml', 'toml', 'json'])(
    'finds config.%s beside the application',
    async (extension) => {
      const root = await createRoot();
      await writeFile(path.join(root, `config.${extension}`), '');

      expect(findConfigurationSource(root, {})).toMatchObject({
        kind: 'file',
        file: path.join(root, `config.${extension}`),
        exists: true,
      });
    },
  );

  /**
   * An application whose secrets come from the environment needs no file at all, and the deployment documentation
   * describes exactly that. A check that insisted on a file would refuse to start a perfectly valid deployment.
   */
  it('accepts configuration supplied entirely through the environment', async () => {
    const root = await createRoot();

    expect(
      findConfigurationSource(root, { AUTH_SECRET: 'from-env' }),
    ).toMatchObject({ kind: 'environment', exists: true });
  });

  it('ignores a blank AUTH_SECRET', async () => {
    const root = await createRoot();

    expect(
      findConfigurationSource(root, { AUTH_SECRET: '  ' }),
    ).toBeUndefined();
  });

  it('reports nothing when the application has no configuration at all', async () => {
    const root = await createRoot();

    expect(findConfigurationSource(root, {})).toBeUndefined();
  });

  /**
   * `start` runs under plain Node and cannot import the loader that reads these files, so the secret in a developer's
   * `.env` has to be recognised here or a perfectly runnable application would be refused.
   */
  it.each(['.env', '.env.local'])(
    'accepts AUTH_SECRET from %s',
    async (name) => {
      const root = await createRoot();
      await writeFile(
        path.join(root, name),
        'APP_SERVER_PORT=13000\nAUTH_SECRET="from-dotenv"\n',
      );

      expect(findConfigurationSource(root, {})).toMatchObject({
        kind: 'environment',
      });
    },
  );

  it('ignores an AUTH_SECRET assigned nothing in .env', async () => {
    const root = await createRoot();
    await writeFile(path.join(root, '.env'), 'AUTH_SECRET=\n');

    expect(findConfigurationSource(root, {})).toBeUndefined();
  });

  it('does not mistake a commented-out AUTH_SECRET for a value', async () => {
    const root = await createRoot();
    await writeFile(path.join(root, '.env'), '# AUTH_SECRET=example\n');

    expect(findConfigurationSource(root, {})).toBeUndefined();
  });

  /** A path named in APP_CONFIG_FILE is loaded non-optionally, so pointing at a missing file is itself the error. */
  it('answers APP_CONFIG_FILE even when the file is absent', async () => {
    const root = await createRoot();

    expect(
      findConfigurationSource(root, { APP_CONFIG_FILE: 'etc/app.yml' }),
    ).toMatchObject({
      kind: 'file',
      file: path.join(root, 'etc', 'app.yml'),
      configured: true,
      exists: false,
    });
  });

  it('prefers APP_CONFIG_FILE over a file beside the application', async () => {
    const root = await createRoot();
    await writeFile(path.join(root, 'config.yml'), '');
    const elsewhere = path.join(root, 'other.yml');
    await writeFile(elsewhere, '');

    expect(
      findConfigurationSource(root, { APP_CONFIG_FILE: elsewhere }),
    ).toMatchObject({ file: elsewhere, configured: true, exists: true });
  });

  it('probes the extensions in the order the runtime does', async () => {
    const root = await createRoot();
    await writeFile(path.join(root, 'config.toml'), '');
    await writeFile(path.join(root, 'config.yml'), '');

    expect(findConfigurationSource(root, {})).toMatchObject({
      file: path.join(root, 'config.yml'),
    });
  });
});
