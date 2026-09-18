// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  readlink,
  stat,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { stableHubStorageRoot } from '../../server/storage.js';
import { copyStorage } from '../../cli/storage-files.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function temporary(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hub-storage-'));
  roots.push(root);
  return root;
}
it('uses the same persistent root before and after build and respects external storage', async () => {
  const root = await temporary();
  expect(stableHubStorageRoot(root)).toBe(path.join(root, 'storage'));
  expect(stableHubStorageRoot(path.join(root, 'dist'))).toBe(
    path.join(root, 'storage'),
  );
  expect(stableHubStorageRoot(path.join(root, 'dist'), '/external/data')).toBe(
    '/external/data',
  );
  await mkdir(path.join(root, 'dist/storage'), { recursive: true });
  expect(() => stableHubStorageRoot(path.join(root, 'dist'))).toThrow(
    'Legacy dist/storage',
  );
});
it('previews, preserves permissions and relative symlinks, resumes and rejects conflicts', async () => {
  const root = await temporary();
  const source = path.join(root, 'old');
  const target = path.join(root, 'new');
  await mkdir(source, { mode: 0o700 });
  await writeFile(path.join(source, 'config.yml'), 'secret: fixture', {
    mode: 0o600,
  });
  await symlink('config.yml', path.join(source, 'current'));
  await copyStorage({ source, target }, false);
  await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  await copyStorage({ source, target }, true);
  await copyStorage({ source, target }, true);
  expect(await readlink(path.join(target, 'current'))).toBe('config.yml');
  expect((await stat(path.join(target, 'config.yml'))).mode & 0o777).toBe(
    0o600,
  );
  expect(await readFile(path.join(source, 'config.yml'), 'utf8')).toBe(
    'secret: fixture',
  );
  await writeFile(path.join(target, 'config.yml'), 'conflicting');
  await expect(copyStorage({ source, target }, false)).rejects.toThrow(
    'conflict',
  );
  await expect(
    copyStorage({ source, target: path.join(source, 'child') }, true),
  ).rejects.toThrow('into itself');
});
