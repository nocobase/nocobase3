import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildHubConfigFile,
  buildHubEnvFile,
  DEFAULT_HUB_HOST,
  DEFAULT_HUB_PORT,
  finalizeHub,
  HUB_STATE_DIR,
  readEnvExample,
} from '../src/lib/hub.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'create-hub-test-'));
  created.push(directory);

  return directory;
}

/** What the hub template ships today, so the tests exercise the real shape rather than an idealized one. */
const TEMPLATE_ENV_EXAMPLE = [
  '# Application',
  'APP_NAME=hub',
  'APP_BASE_PATH=/hub',
  '',
  '# Browser-facing NocoBase REST API root. The Hub server proxies this path.',
  'NOCOBASE_API_URL=/hub/v2/api',
  '',
  '# Upstream NocoBase REST API root. The /api suffix is required.',
  'NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:13000/api',
  '',
  '# Keep these aligned with the main NocoBase frontend when customized.',
  '# API_CLIENT_STORAGE_PREFIX=NOCOBASE_',
  '# API_CLIENT_STORAGE_TYPE=localStorage',
  '# API_CLIENT_SHARE_TOKEN=false',
  '',
].join('\n');

describe('buildHubEnvFile', () => {
  it('names the hub after the directory it was created in', () => {
    const env = buildHubEnvFile({
      example: TEMPLATE_ENV_EXAMPLE,
      name: 'my-hub',
    });

    expect(env).toContain('APP_NAME=my-hub');
    expect(env).not.toContain('APP_NAME=hub\n');
  });

  /**
   * The base path is where the hub is served, not what it is called, and `NOCOBASE_API_URL` spells it out a second
   * time. Renaming it per project would have to rewrite both or leave the client requesting its API under a path the
   * server does not route — which is exactly the mismatch this test pins down.
   */
  it('leaves the base path and the API url agreeing with each other', () => {
    const env = buildHubEnvFile({
      example: TEMPLATE_ENV_EXAMPLE,
      name: 'my-hub',
    });

    expect(env).toContain('APP_BASE_PATH=/hub');
    expect(env).toContain('NOCOBASE_API_URL=/hub/v2/api');
  });

  /**
   * Only the user knows where their NocoBase instance is, so the proxy target is left exactly as the template shipped
   * it — a placeholder the next steps tell them to edit, not a value this command can guess.
   */
  it('leaves the upstream API target alone', () => {
    const env = buildHubEnvFile({
      example: TEMPLATE_ENV_EXAMPLE,
      name: 'my-hub',
    });

    expect(env).toContain(
      'NOCOBASE_API_PROXY_TARGET=http://127.0.0.1:13000/api',
    );
  });

  /** The comments explain each setting, and the commented-out keys are documented defaults. Both must survive. */
  it('keeps the example comments and optional keys', () => {
    const env = buildHubEnvFile({
      example: TEMPLATE_ENV_EXAMPLE,
      name: 'my-hub',
    });

    expect(env).toContain('# Upstream NocoBase REST API root.');
    expect(env).toContain('# API_CLIENT_STORAGE_PREFIX=NOCOBASE_');
  });

  /** Uncommenting an optional key would silently switch on a setting the user never chose. */
  it('does not uncomment a commented-out assignment', () => {
    const env = buildHubEnvFile({
      example: '# APP_NAME=hub\n',
      name: 'my-hub',
    });

    expect(env).toContain('# APP_NAME=hub');
    expect(env).toContain('APP_NAME=my-hub');
  });

  /** A template that ships no example must still yield a hub that knows its own name. */
  it('falls back to a complete file when the template ships no example', () => {
    const env = buildHubEnvFile({ name: 'my-hub' });

    expect(env).toContain('APP_NAME=my-hub');
    expect(env).toContain('APP_BASE_PATH=/hub');
    expect(env).toContain('NOCOBASE_API_PROXY_TARGET=');
  });

  it('ends with exactly one trailing newline', () => {
    const env = buildHubEnvFile({
      example: TEMPLATE_ENV_EXAMPLE,
      name: 'my-hub',
    });

    expect(env.endsWith('\n')).toBe(true);
    expect(env.endsWith('\n\n')).toBe(false);
  });
});

describe('buildHubConfigFile', () => {
  /** `.nb3/hub.json` is what the `nb3 hub` commands walk up the tree looking for. */
  it('writes the config the nb3 hub commands look for', () => {
    const contents = buildHubConfigFile({
      host: DEFAULT_HUB_HOST,
      name: 'my-hub',
      port: DEFAULT_HUB_PORT,
    });

    expect(JSON.parse(contents)).toEqual({
      host: '127.0.0.1',
      name: 'my-hub',
      port: 3000,
    });
    expect(contents.endsWith('\n')).toBe(true);
  });
});

describe('readEnvExample', () => {
  it('reads the template example when there is one', async () => {
    const directory = await createTempDirectory();
    await writeFile(
      path.join(directory, '.env.example'),
      TEMPLATE_ENV_EXAMPLE,
      'utf8',
    );

    expect(await readEnvExample(directory)).toBe(TEMPLATE_ENV_EXAMPLE);
  });

  it('returns undefined when the template ships none', async () => {
    expect(await readEnvExample(await createTempDirectory())).toBeUndefined();
  });
});

describe('finalizeHub', () => {
  it('creates the runtime directories the hub writes into', async () => {
    const directory = await createTempDirectory();

    await finalizeHub(directory);

    for (const relative of ['logs', 'cache']) {
      const target = path.join(directory, HUB_STATE_DIR, relative);
      await expect(readFile(target).catch((error) => error.code)).resolves.toBe(
        'EISDIR',
      );
    }
  });

  it('ignores the runtime state it just made room for', async () => {
    const directory = await createTempDirectory();
    await writeFile(
      path.join(directory, '.gitignore'),
      'node_modules\ndist\n',
      'utf8',
    );

    await finalizeHub(directory);

    const contents = await readFile(path.join(directory, '.gitignore'), 'utf8');

    expect(contents).toContain('node_modules');
    expect(contents).toContain(`${HUB_STATE_DIR}/logs/`);
    expect(contents).toContain(`${HUB_STATE_DIR}/cache/`);
    expect(contents).toContain(`${HUB_STATE_DIR}/*.pid`);
  });

  /** Running twice must not stack duplicate blocks, since the entries are appended rather than rewritten. */
  it('is safe to run twice', async () => {
    const directory = await createTempDirectory();
    await writeFile(path.join(directory, '.gitignore'), 'node_modules\n');

    await finalizeHub(directory);
    await finalizeHub(directory);

    const contents = await readFile(path.join(directory, '.gitignore'), 'utf8');

    expect(contents.split(`${HUB_STATE_DIR}/logs/`)).toHaveLength(2);
  });

  it('writes a gitignore when the template shipped none', async () => {
    const directory = await createTempDirectory();

    await finalizeHub(directory);

    const contents = await readFile(path.join(directory, '.gitignore'), 'utf8');

    expect(contents).toContain(`${HUB_STATE_DIR}/logs/`);
  });

  it('leaves an existing nested state directory alone', async () => {
    const directory = await createTempDirectory();
    await mkdir(path.join(directory, HUB_STATE_DIR, 'logs'), {
      recursive: true,
    });
    await writeFile(
      path.join(directory, HUB_STATE_DIR, 'logs', 'keep.log'),
      'kept',
      'utf8',
    );

    await finalizeHub(directory);

    expect(
      await readFile(
        path.join(directory, HUB_STATE_DIR, 'logs', 'keep.log'),
        'utf8',
      ),
    ).toBe('kept');
  });
});
