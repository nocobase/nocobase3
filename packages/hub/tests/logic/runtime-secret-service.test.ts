// @vitest-environment node

import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';
import {
  resolveRuntimeSecretEncryptionKey,
  RuntimeSecretService,
} from '../../server/hub/runtime-secret-service.ts';

const databases: HubDatabaseRuntime[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('RuntimeSecretService', () => {
  it('encrypts each application secret and exposes only configuration metadata', async () => {
    const database = createHubDatabase({ filename: ':memory:' });
    databases.push(database);
    await database.ready;
    const key = Buffer.alloc(32, 7);
    const service = new RuntimeSecretService(database.connection, {
      key,
      keyId: 'test-key',
    });

    const first = await service.ensureInitial('app-1');
    const replay = await service.ensureInitial('app-1');
    const active = await service.getActive('app-1');
    const row = await database.connection.query
      .selectFrom('hubRuntimeSecrets')
      .selectAll()
      .where('applicationId', '=', 'app-1')
      .executeTakeFirstOrThrow();

    expect(first).toEqual(replay);
    expect(first).toMatchObject({ configured: true, version: 1 });
    expect(first).not.toHaveProperty('secret');
    expect(active.secret).toHaveLength(64);
    expect(String(row.ciphertext)).not.toContain(active.secret);
    expect(row).toMatchObject({ state: 'active', keyId: 'test-key' });
  });

  it('persists a pending rotation before activating it and replays an operation idempotently', async () => {
    const database = createHubDatabase({ filename: ':memory:' });
    databases.push(database);
    await database.ready;
    const service = new RuntimeSecretService(database.connection, {
      key: Buffer.alloc(32, 9),
      keyId: 'rotation-key',
    });
    await service.ensureInitial('app-1');
    const oldSecret = await service.getActive('app-1');

    const pending = await service.beginRotation('app-1', 'operation-1');
    const replay = await service.beginRotation('app-1', 'operation-1');
    expect(replay).toEqual(pending);
    expect(pending.version).toBe(2);
    expect(pending.secret).not.toBe(oldSecret.secret);
    await expect(service.getActive('app-1')).resolves.toEqual(oldSecret);

    await service.activatePending('app-1', 'operation-1', true);
    await expect(service.getActive('app-1')).resolves.toMatchObject({
      version: 2,
      secret: pending.secret,
    });
    await expect(service.summary('app-1')).resolves.toMatchObject({
      configured: true,
      version: 2,
      lastInjectedAt: expect.any(String),
      rotatedAt: expect.any(String),
    });
  });

  it('creates and reuses a private local key file', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-secret-key-'),
    );
    temporaryDirectories.push(directory);
    const keyFile = path.join(directory, 'keys', 'runtime.key');

    const first = await resolveRuntimeSecretEncryptionKey({
      authoritativeOrigin: 'http://127.0.0.1:13000',
      databasePath: path.join(directory, 'hub.sqlite'),
      keyFile,
    });
    const second = await resolveRuntimeSecretEncryptionKey({
      authoritativeOrigin: 'http://localhost:13000',
      databasePath: path.join(directory, 'hub.sqlite'),
      keyFile,
    });

    expect(first).toEqual(second);
    expect(first.key).toHaveLength(32);
    expect((await stat(keyFile)).mode & 0o777).toBe(0o600);
    expect((await readFile(keyFile, 'utf8')).trim()).toBe(
      first.key.toString('base64url'),
    );

    await chmod(keyFile, 0o644);
    await expect(
      resolveRuntimeSecretEncryptionKey({
        authoritativeOrigin: 'http://localhost:13000',
        databasePath: path.join(directory, 'hub.sqlite'),
        keyFile,
      }),
    ).rejects.toMatchObject({ code: 'SECRET_KEY_FILE_INSECURE' });
  });

  it('requires a dedicated configured key outside loopback', async () => {
    await expect(
      resolveRuntimeSecretEncryptionKey({
        authoritativeOrigin: 'https://hub.example.com',
        databasePath: '/var/lib/nocobase/hub.sqlite',
      }),
    ).rejects.toMatchObject({ code: 'SECRET_ENCRYPTION_KEY_REQUIRED' });

    const raw = Buffer.alloc(32, 3).toString('base64url');
    await expect(
      resolveRuntimeSecretEncryptionKey({
        authoritativeOrigin: 'https://hub.example.com',
        databasePath: '/var/lib/nocobase/hub.sqlite',
        configuredKey: raw,
        authSecret: raw,
      }),
    ).rejects.toMatchObject({ code: 'SECRET_ENCRYPTION_KEY_REUSED' });
  });
});
