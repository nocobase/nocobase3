import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('generates an explicit skip for the optional BullMQ native accelerator', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'queue-dist-policy-'));
  const root = path.join(temporary, 'app');
  const scripts = path.join(root, 'scripts/utils');
  const source = path.resolve('scripts/utils');
  try {
    await mkdir(scripts, { recursive: true });
    await mkdir(path.join(root, 'dist/server'), { recursive: true });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'dist-policy-fixture',
        version: '1.0.0',
        type: 'module',
      }),
    );
    for (const filename of [
      'build-server-dist-package.mjs',
      'workspace-packages.mjs',
    ]) {
      await copyFile(path.join(source, filename), path.join(scripts, filename));
    }
    execFileSync(
      process.execPath,
      [path.join(scripts, 'build-server-dist-package.mjs')],
      {
        cwd: root,
        timeout: 10_000,
        stdio: 'pipe',
      },
    );
    const workspace = await readFile(
      path.join(root, 'dist/pnpm-workspace.yaml'),
      'utf8',
    );
    expect(workspace).toContain('  msgpackr-extract: false');
    expect(workspace.match(/msgpackr-extract:/gu)).toHaveLength(1);
    expect(workspace).toContain('autoInstallPeers: false');
    expect(workspace).toContain('  better-sqlite3: true');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
