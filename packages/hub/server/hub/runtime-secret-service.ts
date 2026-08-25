import type { DatabaseConnection, Row } from '@nocobase/database';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { HubDomainError } from './store.ts';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface RuntimeSecretEncryptionKey {
  key: Buffer;
  keyId: string;
}

export interface ResolveRuntimeSecretEncryptionKeyOptions {
  authoritativeOrigin?: string;
  databasePath: string;
  configuredKey?: string;
  keyFile?: string;
  authSecret?: string;
}

export interface RuntimeSecretSummary {
  configured: boolean;
  version: number;
  createdAt: string | null;
  rotatedAt: string | null;
  lastInjectedAt: string | null;
}

export interface ActiveRuntimeSecret {
  id: string;
  applicationId: string;
  version: number;
  secret: string;
  operationId: string | null;
  createdAt: string;
  rotatedAt: string | null;
  lastInjectedAt: string | null;
}

export async function resolveRuntimeSecretEncryptionKey(
  options: ResolveRuntimeSecretEncryptionKeyOptions,
): Promise<RuntimeSecretEncryptionKey> {
  if (options.configuredKey) {
    const key = decodeKey(options.configuredKey);
    if (
      options.authSecret &&
      sameSecretMaterial(options.configuredKey, key, options.authSecret)
    ) {
      throw new HubDomainError(
        'SECRET_ENCRYPTION_KEY_REUSED',
        'HUB_SECRET_ENCRYPTION_KEY must be different from AUTH_SECRET.',
        { status: 500 },
      );
    }
    return { key, keyId: keyIdentifier(key) };
  }

  if (!isLoopbackOrigin(options.authoritativeOrigin)) {
    throw new HubDomainError(
      'SECRET_ENCRYPTION_KEY_REQUIRED',
      'HUB_SECRET_ENCRYPTION_KEY is required outside loopback development.',
      { status: 500 },
    );
  }

  const keyFile =
    options.keyFile ?? defaultKeyFileForDatabase(options.databasePath);
  const key = await readOrCreatePrivateKeyFile(keyFile);
  return { key, keyId: keyIdentifier(key) };
}

export class RuntimeSecretService {
  private readonly encryptionKey: RuntimeSecretEncryptionKey;

  constructor(
    private readonly connection: DatabaseConnection,
    encryptionKey: RuntimeSecretEncryptionKey,
  ) {
    if (encryptionKey.key.length !== KEY_BYTES) {
      throw new HubDomainError(
        'SECRET_ENCRYPTION_KEY_INVALID',
        'Runtime secret encryption key must contain exactly 32 bytes.',
        { status: 500 },
      );
    }
    this.encryptionKey = {
      key: Buffer.from(encryptionKey.key),
      keyId: encryptionKey.keyId,
    };
  }

  withConnection(connection: DatabaseConnection): RuntimeSecretService {
    return new RuntimeSecretService(connection, this.encryptionKey);
  }

  async ensureInitial(applicationId: string): Promise<RuntimeSecretSummary> {
    const existing = await this.findActiveRow(applicationId);
    if (existing) return toSummary(existing);

    const now = new Date();
    const encrypted = this.encrypt(applicationId, 1, createRuntimeSecret());
    try {
      await this.connection.query
        .insertInto('hubRuntimeSecrets')
        .values({
          id: crypto.randomUUID(),
          applicationId,
          version: 1,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          keyId: this.encryptionKey.keyId,
          state: 'active',
          operationId: null,
          failureCode: null,
          createdAt: now,
          updatedAt: now,
          rotatedAt: null,
          lastInjectedAt: null,
        })
        .execute();
    } catch (error) {
      const raced = await this.findActiveRow(applicationId);
      if (raced) return toSummary(raced);
      throw error;
    }
    return {
      configured: true,
      version: 1,
      createdAt: now.toISOString(),
      rotatedAt: null,
      lastInjectedAt: null,
    };
  }

  async summary(applicationId: string): Promise<RuntimeSecretSummary> {
    const row = await this.findActiveRow(applicationId);
    return row
      ? toSummary(row)
      : {
          configured: false,
          version: 0,
          createdAt: null,
          rotatedAt: null,
          lastInjectedAt: null,
        };
  }

  async getActive(applicationId: string): Promise<ActiveRuntimeSecret> {
    const row = await this.findActiveRow(applicationId);
    if (!row) {
      throw new HubDomainError(
        'RUNTIME_SECRET_NOT_CONFIGURED',
        'The application runtime secret is not configured.',
        { status: 409 },
      );
    }
    return this.decryptRow(row);
  }

  async listPending(): Promise<ActiveRuntimeSecret[]> {
    const rows = await this.connection.query
      .selectFrom('hubRuntimeSecrets')
      .selectAll()
      .where('state', '=', 'pending')
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map((row) => this.decryptRow(row));
  }

  async beginRotation(
    applicationId: string,
    operationId: string,
  ): Promise<ActiveRuntimeSecret> {
    const replay = await this.findOperationRow(applicationId, operationId);
    if (replay) return this.requireReplayableRotation(replay);

    const active = await this.getActive(applicationId);
    const version = active.version + 1;
    const secret = createRuntimeSecret();
    const encrypted = this.encrypt(applicationId, version, secret);
    const now = new Date();
    const row = {
      id: crypto.randomUUID(),
      applicationId,
      version,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      keyId: this.encryptionKey.keyId,
      state: 'pending',
      operationId,
      failureCode: null,
      createdAt: now,
      updatedAt: now,
      rotatedAt: now,
      lastInjectedAt: null,
    };
    try {
      await this.connection.query
        .insertInto('hubRuntimeSecrets')
        .values(row)
        .execute();
    } catch (error) {
      const raced = await this.findOperationRow(applicationId, operationId);
      if (raced) return this.requireReplayableRotation(raced);
      throw error;
    }
    return { ...this.decryptRow(row), secret };
  }

  async activatePending(
    applicationId: string,
    operationId: string,
    injected: boolean,
  ): Promise<RuntimeSecretSummary> {
    return this.connection.transaction(async (connection) => {
      const pending = await connection.query
        .selectFrom('hubRuntimeSecrets')
        .selectAll()
        .where('applicationId', '=', applicationId)
        .where('operationId', '=', operationId)
        .executeTakeFirst();
      if (!pending) {
        throw new HubDomainError(
          'RUNTIME_SECRET_ROTATION_NOT_FOUND',
          'The runtime secret rotation was not found.',
          { status: 404 },
        );
      }
      if (String(pending.state) === 'active') return toSummary(pending);
      if (String(pending.state) !== 'pending') {
        throw new HubDomainError(
          'RUNTIME_SECRET_ROTATION_STATE_CONFLICT',
          'The runtime secret rotation is no longer pending.',
          { status: 409 },
        );
      }
      const now = new Date();
      await connection.query
        .updateTable('hubRuntimeSecrets')
        .set({ state: 'retired', updatedAt: now })
        .where('applicationId', '=', applicationId)
        .where('state', '=', 'active')
        .execute();
      const update = await connection.query
        .updateTable('hubRuntimeSecrets')
        .set({
          state: 'active',
          updatedAt: now,
          rotatedAt: now,
          lastInjectedAt: injected ? now : null,
        })
        .where('id', '=', String(pending.id))
        .where('state', '=', 'pending')
        .execute();
      if (update.updatedCount !== 1) {
        throw new HubDomainError(
          'RUNTIME_SECRET_ROTATION_STATE_CONFLICT',
          'The runtime secret rotation changed concurrently.',
          { status: 409 },
        );
      }
      return toSummary({
        ...pending,
        state: 'active',
        updatedAt: now,
        rotatedAt: now,
        lastInjectedAt: injected ? now : null,
      });
    });
  }

  async failPending(
    applicationId: string,
    operationId: string,
    failureCode: string,
  ): Promise<void> {
    await this.connection.query
      .updateTable('hubRuntimeSecrets')
      .set({
        state: 'failed',
        failureCode,
        updatedAt: new Date(),
      })
      .where('applicationId', '=', applicationId)
      .where('operationId', '=', operationId)
      .where('state', '=', 'pending')
      .execute();
  }

  async markInjected(applicationId: string, version: number): Promise<void> {
    await this.connection.query
      .updateTable('hubRuntimeSecrets')
      .set({ lastInjectedAt: new Date(), updatedAt: new Date() })
      .where('applicationId', '=', applicationId)
      .where('version', '=', version)
      .where('state', '=', 'active')
      .execute();
  }

  private async findActiveRow(applicationId: string): Promise<Row | undefined> {
    return this.connection.query
      .selectFrom('hubRuntimeSecrets')
      .selectAll()
      .where('applicationId', '=', applicationId)
      .where('state', '=', 'active')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  private async findOperationRow(
    applicationId: string,
    operationId: string,
  ): Promise<Row | undefined> {
    return this.connection.query
      .selectFrom('hubRuntimeSecrets')
      .selectAll()
      .where('applicationId', '=', applicationId)
      .where('operationId', '=', operationId)
      .executeTakeFirst();
  }

  private requireReplayableRotation(row: Row): ActiveRuntimeSecret {
    const state = String(row.state);
    if (state === 'pending' || state === 'active') {
      return this.decryptRow(row);
    }
    throw new HubDomainError(
      'RUNTIME_SECRET_ROTATION_STATE_CONFLICT',
      'The runtime secret rotation can no longer be resumed.',
      { status: 409 },
    );
  }

  private encrypt(
    applicationId: string,
    version: number,
    secret: string,
  ): { ciphertext: string; nonce: string } {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey.key, nonce);
    cipher.setAAD(this.aad(applicationId, version));
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return {
      ciphertext: encrypted.toString('base64url'),
      nonce: nonce.toString('base64url'),
    };
  }

  private decryptRow(row: Row): ActiveRuntimeSecret {
    if (String(row.keyId) !== this.encryptionKey.keyId) {
      throw new HubDomainError(
        'RUNTIME_SECRET_KEY_UNAVAILABLE',
        'The runtime secret encryption key is unavailable.',
        { status: 500 },
      );
    }
    try {
      const version = Number(row.version);
      const payload = Buffer.from(String(row.ciphertext), 'base64url');
      const nonce = Buffer.from(String(row.nonce), 'base64url');
      const tag = payload.subarray(payload.length - TAG_BYTES);
      const ciphertext = payload.subarray(0, payload.length - TAG_BYTES);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey.key,
        nonce,
      );
      decipher.setAAD(this.aad(String(row.applicationId), version));
      decipher.setAuthTag(tag);
      const secret = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
      return {
        id: String(row.id),
        applicationId: String(row.applicationId),
        version,
        secret,
        operationId: nullableString(row.operationId),
        createdAt: isoString(row.createdAt),
        rotatedAt: nullableIsoString(row.rotatedAt),
        lastInjectedAt: nullableIsoString(row.lastInjectedAt),
      };
    } catch (error) {
      if (error instanceof HubDomainError) throw error;
      throw new HubDomainError(
        'RUNTIME_SECRET_DECRYPTION_FAILED',
        'The runtime secret could not be decrypted.',
        { status: 500, cause: error },
      );
    }
  }

  private aad(applicationId: string, version: number): Buffer {
    return Buffer.from(
      `nocobase-hub-runtime-secret-v1\0${applicationId}\0${version}\0${this.encryptionKey.keyId}`,
      'utf8',
    );
  }
}

async function readOrCreatePrivateKeyFile(filePath: string): Promise<Buffer> {
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  try {
    const handle = await open(resolved, 'wx', 0o600);
    try {
      const key = randomBytes(KEY_BYTES);
      await handle.writeFile(`${key.toString('base64url')}\n`, {
        encoding: 'utf8',
      });
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }

  const metadata = await stat(resolved);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new HubDomainError(
      'SECRET_KEY_FILE_INSECURE',
      'Runtime secret key file must be a regular file with mode 0600.',
      { status: 500 },
    );
  }
  return decodeKey((await readFile(resolved, 'utf8')).trim());
}

function decodeKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64url');
  if (key.length !== KEY_BYTES) {
    throw new HubDomainError(
      'SECRET_ENCRYPTION_KEY_INVALID',
      'HUB_SECRET_ENCRYPTION_KEY must encode exactly 32 bytes.',
      { status: 500 },
    );
  }
  return key;
}

function defaultKeyFileForDatabase(databasePath: string): string {
  if (
    !databasePath ||
    databasePath === ':memory:' ||
    databasePath.startsWith('file:')
  ) {
    throw new HubDomainError(
      'SECRET_KEY_FILE_REQUIRED',
      'HUB_SECRET_ENCRYPTION_KEY_FILE is required with an in-memory database.',
      { status: 500 },
    );
  }
  return path.join(
    path.dirname(path.resolve(databasePath)),
    'runtime-secret.key',
  );
}

function isLoopbackOrigin(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname;
    return /^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(hostname);
  } catch {
    return false;
  }
}

function sameSecretMaterial(
  configuredValue: string,
  configuredKey: Buffer,
  authSecret: string,
): boolean {
  if (configuredValue.trim() === authSecret.trim()) return true;
  try {
    return decodeKey(authSecret).equals(configuredKey);
  } catch {
    return false;
  }
}

function keyIdentifier(key: Buffer): string {
  return `sha256:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

function createRuntimeSecret(): string {
  return randomBytes(32).toString('hex');
}

function toSummary(row: Row): RuntimeSecretSummary {
  return {
    configured: true,
    version: Number(row.version),
    createdAt: isoString(row.createdAt),
    rotatedAt: nullableIsoString(row.rotatedAt),
    lastInjectedAt: nullableIsoString(row.lastInjectedAt),
  };
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return null;
}

function nullableIsoString(value: unknown): string | null {
  return value === null || value === undefined ? null : isoString(value);
}

function isoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return new Date(Number(value)).toISOString();
  }
  return new Date(String(value)).toISOString();
}

function isAlreadyExists(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 'EEXIST';
}
