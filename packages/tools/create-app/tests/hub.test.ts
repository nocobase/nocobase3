import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHubEnvFile, readEnvExample } from '../src/lib/hub.ts';

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
  'APP_BASE_PATH=/hub',
  '',
  '# Server',
  '# APP_SERVER_HOST=127.0.0.1',
  '# APP_SERVER_PORT=13000',
  '',
].join('\n');

describe('buildHubEnvFile', () => {
  /**
   * The base path is where the hub is served, and its name follows from it, so it stays at the template's `/hub` even
   * when the project is named something else. A deployment that wants the hub elsewhere sets the value itself.
   */
  it('copies the example, base path included', () => {
    expect(buildHubEnvFile({ example: TEMPLATE_ENV_EXAMPLE })).toBe(
      TEMPLATE_ENV_EXAMPLE,
    );
  });

  /** The comments explain each setting, and the commented-out keys are documented defaults. Both must survive. */
  it('keeps the example comments and optional keys', () => {
    const env = buildHubEnvFile({ example: TEMPLATE_ENV_EXAMPLE });

    expect(env).toContain('# Server');
    expect(env).toContain('# APP_SERVER_HOST=127.0.0.1');
  });

  /** A template that ships no example must still yield a hub that knows where it is served. */
  it('falls back to a complete file when the template ships no example', () => {
    expect(buildHubEnvFile()).toBe('# Application\nAPP_BASE_PATH=/hub\n');
  });

  it('ends with exactly one trailing newline', () => {
    const env = buildHubEnvFile({ example: `${TEMPLATE_ENV_EXAMPLE}\n\n` });

    expect(env.endsWith('\n')).toBe(true);
    expect(env.endsWith('\n\n')).toBe(false);
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
