// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
const template = path.resolve(import.meta.dirname, '../..');
it('previews without writing, then migrates persisted configuration bindings and retains rollback data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hub-storage-command-'));
  const storage = path.join(root, 'storage');
  const config = path.join(root, 'config.json');
  const desired = path.join(
    storage,
    'hub/app-configs/customer/configs/config.deploy1.yml',
  );
  const checksum = 'a'.repeat(64);
  try {
    await mkdir(path.dirname(desired), { recursive: true });
    await writeFile(desired, 'feature: fixture\n', { mode: 0o600 });
    const revision = path.join(
      storage,
      `app-deployments/customer/revisions/${checksum}`,
    );
    await mkdir(revision, { recursive: true });
    await writeFile(path.join(revision, '.nocobase-artifact.json'), '{}');
    await mkdir(path.join(storage, 'app-volumes/customer/storage'), {
      recursive: true,
    });
    await writeFile(
      path.join(storage, 'app-volumes/customer/storage/business.txt'),
      'persistent',
    );
    const db = new DatabaseSync(path.join(storage, 'database.sqlite'));
    db.exec(
      'CREATE TABLE hub_app_deployments (id TEXT PRIMARY KEY, config TEXT)',
    );
    db.prepare('INSERT INTO hub_app_deployments VALUES (?, ?)').run(
      'deploy1',
      JSON.stringify({ mode: 'file', path: desired }),
    );
    db.close();
    const contents = JSON.stringify({
      hub: { storageLayout: 'legacy', host: { enabled: false } },
      database: { connections: { main: { database: 'database.sqlite' } } },
    });
    await writeFile(config, contents);
    const args = [
      '--import',
      'tsx',
      'cli/index.ts',
      'app',
      'storage',
      'migrate',
      `--config-file=${config}`,
      `--source=${storage}`,
    ];
    const preview = await exec(process.execPath, [...args, '--json'], {
      cwd: template,
      timeout: 30000,
    });
    expect(preview.stdout).toContain('bindingMappings');
    expect(await readFile(config, 'utf8')).toBe(contents);
    await expect(stat(path.join(storage, 'apps'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await exec(process.execPath, [...args, '--apply', '--stopped'], {
      cwd: template,
      timeout: 30000,
    });
    const repeated = await exec(
      process.execPath,
      [...args, '--apply', '--stopped', '--json'],
      { cwd: template, timeout: 30000 },
    );
    expect(repeated.stdout).toContain('already-configured');
    const updated = JSON.parse(await readFile(config, 'utf8'));
    expect(updated.hub.storageLayout).toBe('v2');
    expect(updated.hub.host.appDeploymentsDir).toBeUndefined();
    expect(
      await readFile(
        path.join(storage, 'apps/volumes/customer/storage/business.txt'),
        'utf8',
      ),
    ).toBe('persistent');
    expect(
      await readFile(
        path.join(storage, 'hub/storage-migration/config.before'),
        'utf8',
      ),
    ).toBe(contents);
    const migrated = new DatabaseSync(
      path.join(storage, 'hub/database/main.sqlite'),
      { readOnly: true },
    );
    try {
      const row = migrated
        .prepare('SELECT config FROM hub_app_deployments')
        .get()!;
      expect(JSON.parse(String(row.config)).path).toBe(
        path.join(storage, 'hub/desired-configs/customer/deploy1.yml'),
      );
    } finally {
      migrated.close();
    }
    expect(await readFile(desired, 'utf8')).toBe('feature: fixture\n');
    expect(
      await stat(
        path.join(
          storage,
          `apps/revisions/customer/${checksum}/.nocobase-artifact.json`,
        ),
      ),
    ).toBeDefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
