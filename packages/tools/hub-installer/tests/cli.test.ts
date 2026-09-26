import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import packageMetadata from '../package.json' with { type: 'json' };
import { runInstaller } from '../src/cli.ts';
import type { Pm2 } from '../src/lib/pm2.ts';

function capture(): { stream: Writable; text: () => string } {
  let buffer = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });
  return { stream, text: () => buffer };
}

const noPm2: Pm2 = {
  version: async () => '7.0.0',
  start: async () => undefined,
  stop: async () => undefined,
  remove: async () => undefined,
  save: async () => undefined,
  describe: async () => undefined,
};

async function run(argv: string[], cwd?: string) {
  const stdout = capture();
  const stderr = capture();
  const code = await runInstaller({
    argv,
    binary: 'hub-installer',
    version: packageMetadata.version,
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd,
    pm2: noPm2,
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'hub-installer-cli-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runInstaller', () => {
  it('prints help without a command', async () => {
    const result = await run([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('hub-installer install DIRECTORY');
  });

  it('prints its version', async () => {
    const result = await run(['--version', '--json']);
    expect(JSON.parse(result.stdout)).toEqual({
      status: 'success',
      version: packageMetadata.version,
    });
  });

  it('answers an unknown command with exit code 2 and one JSON document', async () => {
    const result = await run(['upgrad', '--json']);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_USAGE' },
    });
  });

  it('requires the install directory', async () => {
    const result = await run(['install', '--json']);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.message).toContain('directory');
  });

  it('rejects an origin with a path before touching anything', async () => {
    const target = path.join(dir, 'hub');
    const result = await run([
      'install',
      target,
      '--origin',
      'https://apps.example.com/hub',
      '--json',
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe('INVALID_USAGE');
  });

  it('refuses a target that already holds files', async () => {
    await writeFile(path.join(dir, 'keep.txt'), 'mine');
    const result = await run(['install', dir, '--json']);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe('TARGET_NOT_EMPTY');
  });

  it('rejects a malformed --set before touching anything', async () => {
    const result = await run([
      'install',
      path.join(dir, 'hub'),
      '--set',
      'novalue',
      '--json',
    ]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.message).toContain(
      '--set expects key=value',
    );
  });

  it('reports status for a root it does not manage as not installed', async () => {
    const result = await run(['status', '--dir', dir, '--json']);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe('NOT_INSTALLED');
  });

  it('keeps stdout to the JSON document and writes progress to stderr', async () => {
    const result = await run(['status', '--dir', dir]);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Error:');
  });
});
