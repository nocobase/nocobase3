import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..');
const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('create-hub executable', () => {
  it('fails fast with a copyable command when no directory can be prompted for', async () => {
    const result = await run([path.join(packageRoot, 'bin/run.js')]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'pnpm create @nocobase/hub my-hub',
    );
  });

  it('scaffolds a local production Hub package non-interactively', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'create-hub-command-'));
    created.push(root);
    const template = path.join(root, 'template');
    const target = path.join(root, 'generated-hub');
    await mkdir(path.join(template, 'server'), { recursive: true });
    await writeFile(
      path.join(template, 'server/standalone.js'),
      'export {};\n',
    );
    await writeFile(
      path.join(template, 'package.json'),
      JSON.stringify({
        name: '@nocobase/hub',
        version: '1.0.0',
        files: ['server'],
        scripts: { start: 'node ./server/standalone.js' },
      }),
    );

    const result = await run([
      path.join(packageRoot, 'bin/run.js'),
      target,
      `--template=${template}`,
      '--no-install',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('pnpm start');
    await expect(
      access(path.join(target, '.env.local'), constants.R_OK),
    ).resolves.toBeUndefined();
    const manifest = JSON.parse(
      await readFile(path.join(target, 'package.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({ name: 'generated-hub', private: true });
  });
});

function run(args: string[]): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}
