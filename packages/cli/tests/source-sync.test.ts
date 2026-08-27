import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mirrorSourceTree, sourceTreesEqual } from '../src/lib/source-sync.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('source snapshot synchronization', () => {
  it('ignores runtime, dependency, build, secret, and local state files', async () => {
    const [left, right] = await pair();
    await writeSource(left, 'client/page.tsx', 'export const page = 1;\n');
    await writeSource(right, 'client/page.tsx', 'export const page = 1;\n');
    await writeSource(left, 'node_modules/local/index.js', 'left');
    await writeSource(right, 'node_modules/local/index.js', 'right');
    await writeSource(left, 'dist/client/index.js', 'left');
    await writeSource(right, 'dist/client/index.js', 'right');
    await writeSource(left, '.env.local', 'SECRET=left');
    await writeSource(right, '.env.local', 'SECRET=right');
    await writeSource(left, '.env.production', 'SECRET=left');
    await writeSource(right, '.env.production', 'SECRET=right');
    await writeSource(
      left,
      '.npmrc',
      '//registry.example.com/:_authToken=left',
    );
    await writeSource(
      right,
      '.npmrc',
      '//registry.example.com/:_authToken=right',
    );
    await writeSource(left, '.env.example', 'PUBLIC=left');
    await writeSource(right, '.env.example', 'PUBLIC=right');
    await writeSource(left, '.nocobase/config.json', '{"local":1}');
    await writeSource(right, '.nocobase/config.json', '{"local":2}');

    expect(await sourceTreesEqual(left, right)).toBe(false);

    await writeSource(right, '.env.example', 'PUBLIC=left');
    expect(await sourceTreesEqual(left, right)).toBe(true);
  });

  it('does not drop nested source directories with runtime-like names', async () => {
    const [left, right] = await pair();
    await writeSource(left, 'client/storage/index.ts', 'left');
    await writeSource(right, 'client/storage/index.ts', 'right');

    expect(await sourceTreesEqual(left, right)).toBe(false);

    await writeSource(right, 'client/storage/index.ts', 'left');
    expect(await sourceTreesEqual(left, right)).toBe(true);
  });

  it('mirrors source while preserving target-local files', async () => {
    const [source, target] = await pair();
    await writeSource(source, 'client/new.tsx', 'new source\n');
    await writeSource(source, '.env.example', 'APP_BASE_PATH=/main\n');
    await writeSource(target, 'client/old.tsx', 'old source\n');
    await writeSource(target, '.env.local', 'AUTH_SECRET=keep\n');
    await writeSource(target, '.nocobase/config.json', '{"keep":true}\n');
    await writeSource(target, 'dist/client/index.js', 'keep build\n');

    await mirrorSourceTree(source, target);

    await expect(
      readFile(path.join(target, 'client/old.tsx'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(target, 'client/new.tsx'), 'utf8')).toBe(
      'new source\n',
    );
    expect(await readFile(path.join(target, '.env.example'), 'utf8')).toBe(
      'APP_BASE_PATH=/main\n',
    );
    expect(await readFile(path.join(target, '.env.local'), 'utf8')).toBe(
      'AUTH_SECRET=keep\n',
    );
    expect(
      await readFile(path.join(target, '.nocobase/config.json'), 'utf8'),
    ).toBe('{"keep":true}\n');
    expect(
      await readFile(path.join(target, 'dist/client/index.js'), 'utf8'),
    ).toBe('keep build\n');
  });

  it('rolls back source files when applying a snapshot fails', async () => {
    if (process.platform === 'win32') return;
    const [source, target] = await pair();
    await writeSource(source, 'a.ts', 'new a\n');
    await writeSource(source, 'locked/z.ts', 'new z\n');
    await writeSource(target, 'a.ts', 'old a\n');
    await writeSource(target, 'locked/z.ts', 'old z\n');
    await chmod(path.join(target, 'locked'), 0o555);

    await expect(mirrorSourceTree(source, target)).rejects.toThrow();

    await chmod(path.join(target, 'locked'), 0o755);
    expect(await readFile(path.join(target, 'a.ts'), 'utf8')).toBe('old a\n');
    expect(await readFile(path.join(target, 'locked/z.ts'), 'utf8')).toBe(
      'old z\n',
    );
  });

  it('never replaces protected target paths even when the source uses another file type', async () => {
    const [source, target] = await pair();
    await symlink('attacker', path.join(source, '.git'));
    await symlink('attacker', path.join(source, '.nocobase'));
    await writeSource(source, 'storage', 'attacker');
    await writeSource(target, '.git/config', 'keep git\n');
    await writeSource(target, '.nocobase/config.json', 'keep state\n');
    await writeSource(target, 'storage/default.sqlite', 'keep data\n');

    await mirrorSourceTree(source, target);

    expect((await lstat(path.join(target, '.git'))).isDirectory()).toBe(true);
    expect((await lstat(path.join(target, '.nocobase'))).isDirectory()).toBe(
      true,
    );
    expect((await lstat(path.join(target, 'storage'))).isDirectory()).toBe(
      true,
    );
    expect(await readFile(path.join(target, '.git/config'), 'utf8')).toBe(
      'keep git\n',
    );
    expect(
      await readFile(path.join(target, '.nocobase/config.json'), 'utf8'),
    ).toBe('keep state\n');
    expect(
      await readFile(path.join(target, 'storage/default.sqlite'), 'utf8'),
    ).toBe('keep data\n');
  });

  it('preserves executable bits and rejects source symlinks', async () => {
    const [source, target] = await pair();
    await writeSource(source, 'scripts/build.sh', '#!/bin/sh\n');
    await chmod(path.join(source, 'scripts/build.sh'), 0o755);
    await writeSource(target, 'scripts/build.sh', '#!/bin/sh\n');

    expect(await sourceTreesEqual(source, target)).toBe(false);
    await mirrorSourceTree(source, target);
    expect(
      (await lstat(path.join(target, 'scripts/build.sh'))).mode & 0o111,
    ).toBe(0o111);

    await symlink('../../.env.local', path.join(source, 'client-link'));
    await expect(mirrorSourceTree(source, target)).rejects.toThrow(
      /symbolic link/i,
    );
  });
});

async function pair(): Promise<[string, string]> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nocobase-source-sync-'));
  roots.push(root);
  const left = path.join(root, 'left');
  const right = path.join(root, 'right');
  await Promise.all([
    mkdir(left, { recursive: true }),
    mkdir(right, { recursive: true }),
  ]);
  return [left, right];
}

async function writeSource(
  root: string,
  relative: string,
  contents: string,
): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}
