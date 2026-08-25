// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AgentAuthService,
  type AgentApplicationScope,
  type AgentScope,
} from '../../server/hub/agent-auth-service.ts';
import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';

const HASH_SECRET = 'agent-auth-test-hash-secret-'.repeat(2);
const VERIFICATION_URI = 'https://hub.example.com/hub/agent-authorize';

let database: HubDatabaseRuntime;
let service: AgentAuthService;
let currentTime: Date;
let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'nocobase-hub-agent-auth-'),
  );
  database = createHubDatabase({
    filename: path.join(temporaryDirectory, 'hub.sqlite'),
  });
  await database.ready;
  currentTime = new Date('2026-08-25T08:00:00.000Z');
  service = new AgentAuthService(database.connection, {
    tokenHashSecret: HASH_SECRET,
    verificationUri: VERIFICATION_URI,
    clock: () => new Date(currentTime),
  });
});

afterEach(async () => {
  await database.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('AgentAuthService device authorization', () => {
  it('issues user and device codes while persisting only keyed hashes', async () => {
    const result = await service.createDeviceAuthorization({
      clientId: 'nb-cli',
      clientName: 'Codex on Apple-MacBook',
      scopes: ['profile', 'apps:read', 'source:read'],
      applicationScope: selected('app-1'),
    });

    expect(result.deviceCode).toMatch(/^nbd_[A-Za-z0-9_-]{43}$/);
    expect(result.userCode).toMatch(/^NB3-[A-HJ-NP-Z2-9]{4}$/);
    expect(result.verificationUri).toBe(VERIFICATION_URI);
    expect(result.verificationUriComplete).toBe(
      `${VERIFICATION_URI}#code=${result.userCode}`,
    );
    expect(result.expiresIn).toBe(600);
    expect(result.interval).toBe(5);

    const row = await database.connection.query
      .selectFrom('hubAgentDeviceAuthorizations')
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(String(row?.deviceCodeHash)).toMatch(/^hmac-sha256:/);
    expect(String(row?.userCodeHash)).toMatch(/^hmac-sha256:/);
    expect(JSON.stringify(row)).not.toContain(result.deviceCode);
    expect(JSON.stringify(row)).not.toContain(result.userCode);
  });

  it('rejects invalid scope and application-scope combinations', async () => {
    await expect(
      service.createDeviceAuthorization({
        clientId: 'nb-cli',
        clientName: 'Codex',
        scopes: ['apps:read'],
        applicationScope: { mode: 'selected', applicationIds: [] },
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_SCOPE_COMBINATION',
      status: 422,
    });

    await expect(
      service.createDeviceAuthorization({
        clientId: 'nb-cli',
        clientName: 'Codex',
        scopes: ['apps:create'],
        applicationScope: selected('app-1'),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_SCOPE_COMBINATION',
      status: 422,
    });

    await expect(
      service.createDeviceAuthorization({
        clientId: 'nb-cli',
        clientName: 'Codex',
        scopes: ['unknown' as AgentScope],
        applicationScope: { mode: 'all-authorized' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
  });

  it('resolves a user code and allows approval to narrow but never expand access', async () => {
    const created = await service.createDeviceAuthorization({
      clientId: 'nb-cli',
      clientName: 'Codex',
      scopes: ['profile', 'apps:read', 'source:read', 'source:write'],
      applicationScope: selected('app-1', 'app-2'),
    });
    const pending = await service.resolveAuthorization(created.userCode);

    expect(pending).toMatchObject({
      clientName: 'Codex',
      requestedScopes: ['profile', 'apps:read', 'source:read', 'source:write'],
      requestedApplicationScope: selected('app-1', 'app-2'),
      status: 'pending',
    });
    expect(JSON.stringify(pending)).not.toContain(created.deviceCode);

    const approval = {
      userId: 'user-1',
      scopes: ['profile', 'source:write'] as AgentScope[],
      applicationScope: selected('app-1'),
      allowedScopes: [
        'profile',
        'apps:read',
        'source:read',
        'source:write',
      ] as AgentScope[],
      authorizedApplicationIds: ['app-1'],
    };
    const approved = await service.approveAuthorization(pending.id, approval);
    expect(approved).toMatchObject({
      id: pending.id,
      status: 'approved',
      grantedScopes: ['profile', 'source:write'],
      grantedApplicationScope: selected('app-1'),
    });
    await expect(
      service.approveAuthorization(pending.id, approval),
    ).resolves.toEqual(approved);

    const second = await service.createDeviceAuthorization({
      clientId: 'nb-cli',
      clientName: 'Codex',
      scopes: ['apps:read'],
      applicationScope: selected('app-1'),
    });
    const secondPending = await service.resolveAuthorization(second.userCode);
    await expect(
      service.approveAuthorization(secondPending.id, {
        userId: 'user-1',
        scopes: ['apps:read', 'source:write'],
        applicationScope: selected('app-1'),
        allowedScopes: ['apps:read', 'source:write'],
        authorizedApplicationIds: ['app-1'],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_SCOPE_COMBINATION',
      status: 422,
    });
    await expect(
      service.approveAuthorization(secondPending.id, {
        userId: 'user-1',
        scopes: ['apps:read'],
        applicationScope: selected('app-2'),
        allowedScopes: ['apps:read'],
        authorizedApplicationIds: ['app-1', 'app-2'],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_SCOPE_COMBINATION',
      status: 422,
    });
  });

  it('makes approve and deny idempotent but rejects the opposite decision', async () => {
    const created = await service.createDeviceAuthorization({
      clientId: 'nb-cli',
      clientName: 'Codex',
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    });
    const pending = await service.resolveAuthorization(created.userCode);
    const denied = await service.denyAuthorization(pending.id, 'user-1');
    await expect(
      service.denyAuthorization(pending.id, 'user-1'),
    ).resolves.toEqual(denied);
    await expect(
      service.approveAuthorization(pending.id, {
        userId: 'user-1',
        scopes: ['profile'],
        applicationScope: { mode: 'all-authorized' },
        allowedScopes: ['profile'],
        authorizedApplicationIds: [],
      }),
    ).rejects.toMatchObject({
      code: 'DEVICE_AUTHORIZATION_DECIDED',
      status: 409,
    });
    await expect(
      service.exchangeToken({
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        clientId: 'nb-cli',
        deviceCode: created.deviceCode,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED', status: 403 });
  });

  it('enforces polling intervals and authorization expiry', async () => {
    const created = await service.createDeviceAuthorization({
      clientId: 'nb-cli',
      clientName: 'Codex',
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    });
    const request = {
      grantType: 'urn:ietf:params:oauth:grant-type:device_code' as const,
      clientId: 'nb-cli',
      deviceCode: created.deviceCode,
    };

    await expect(service.exchangeToken(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_PENDING',
      status: 428,
      retryable: true,
    });
    await expect(service.exchangeToken(request)).rejects.toMatchObject({
      code: 'SLOW_DOWN',
      status: 429,
      retryable: true,
    });
    advanceSeconds(5);
    await expect(service.exchangeToken(request)).rejects.toMatchObject({
      code: 'AUTHORIZATION_PENDING',
      status: 428,
    });
    advanceSeconds(596);
    await expect(service.exchangeToken(request)).rejects.toMatchObject({
      code: 'DEVICE_AUTHORIZATION_EXPIRED',
      status: 410,
    });
    await expect(
      service.resolveAuthorization(created.userCode),
    ).rejects.toMatchObject({
      code: 'DEVICE_AUTHORIZATION_EXPIRED',
      status: 410,
    });
  });
});

describe('AgentAuthService credentials', () => {
  it('exchanges an approved device code once and enforces scope and APP range', async () => {
    const { created } = await createApprovedAuthorization({
      scopes: ['profile', 'apps:read', 'source:write'],
      applicationScope: selected('app-1'),
    });

    const tokens = await service.exchangeToken({
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      clientId: 'nb-cli',
      deviceCode: created.deviceCode,
    });
    expect(tokens).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshExpiresIn: 2_592_000,
      scope: 'profile apps:read source:write',
      applicationScope: selected('app-1'),
    });
    expect(tokens.accessToken).toMatch(/^nba_[A-Za-z0-9_-]{43}$/);
    expect(tokens.refreshToken).toMatch(/^nbr_[A-Za-z0-9_-]{43}$/);

    const principal = await service.authenticateAccessToken(
      tokens.accessToken,
      { scope: 'source:write', applicationId: 'app-1' },
    );
    expect(principal).toMatchObject({
      credentialId: tokens.credentialId,
      userId: 'user-1',
      scopes: ['profile', 'apps:read', 'source:write'],
      applicationScope: selected('app-1'),
    });
    await expect(
      service.authenticateAccessToken(tokens.accessToken, {
        scope: 'source:write',
        applicationId: 'app-2',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_SCOPE', status: 403 });
    await expect(
      service.exchangeToken({
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        clientId: 'nb-cli',
        deviceCode: created.deviceCode,
      }),
    ).rejects.toMatchObject({
      code: 'DEVICE_AUTHORIZATION_NOT_FOUND',
      status: 404,
    });

    const row = await database.connection.query
      .selectFrom('hubAgentCredentials')
      .selectAll()
      .where('id', '=', tokens.credentialId)
      .executeTakeFirst();
    expect(String(row?.accessTokenHash)).toMatch(/^hmac-sha256:/);
    expect(String(row?.refreshTokenHash)).toMatch(/^hmac-sha256:/);
    expect(String(row?.refreshTokenFamilyHash)).toMatch(/^hmac-sha256:/);
    expect(JSON.stringify(row)).not.toContain(tokens.accessToken);
    expect(JSON.stringify(row)).not.toContain(tokens.refreshToken);
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const { created } = await createApprovedAuthorization({
      scopes: ['profile', 'apps:read'],
      applicationScope: { mode: 'all-authorized' },
    });
    const initial = await service.exchangeToken({
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      clientId: 'nb-cli',
      deviceCode: created.deviceCode,
    });
    advanceSeconds(1);
    const rotated = await service.exchangeToken({
      grantType: 'refresh_token',
      clientId: 'nb-cli',
      refreshToken: initial.refreshToken,
    });
    expect(rotated.credentialId).toBe(initial.credentialId);
    expect(rotated.accessToken).not.toBe(initial.accessToken);
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    await expect(
      service.authenticateAccessToken(initial.accessToken),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: 401 });
    await expect(
      service.authenticateAccessToken(rotated.accessToken),
    ).resolves.toMatchObject({ credentialId: initial.credentialId });

    await expect(
      service.exchangeToken({
        grantType: 'refresh_token',
        clientId: 'nb-cli',
        refreshToken: initial.refreshToken,
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: 401 });
    await expect(
      service.authenticateAccessToken(rotated.accessToken),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: 401 });

    const rows = await database.connection.query
      .selectFrom('hubAgentCredentials')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => String(row.status) === 'revoked')).toBe(true);
    expect((await service.listCredentials('user-1')).items).toHaveLength(1);
    expect((await service.listCredentials('user-1')).items[0]).toMatchObject({
      id: initial.credentialId,
      status: 'revoked',
    });
    expect(JSON.stringify(rows)).not.toContain(initial.refreshToken);
    expect(JSON.stringify(rows)).not.toContain(rotated.refreshToken);
  });

  it('lists only a users device credentials and revokes them idempotently', async () => {
    const { created } = await createApprovedAuthorization({
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
      clientName: 'Codex on Mac',
    });
    const tokens = await service.exchangeToken({
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      clientId: 'nb-cli',
      deviceCode: created.deviceCode,
    });
    const list = await service.listCredentials('user-1', {
      query: 'codex',
      status: 'active',
      sort: '-createdAt',
      limit: 20,
      offset: 0,
    });
    expect(list).toMatchObject({ total: 1, limit: 20, offset: 0 });
    expect(list.items[0]).toMatchObject({
      id: tokens.credentialId,
      clientName: 'Codex on Mac',
      status: 'active',
      scopes: ['profile'],
    });
    expect(JSON.stringify(list)).not.toContain('TokenHash');

    await expect(
      service.revokeCredential('another-user', tokens.credentialId),
    ).resolves.toBe(false);
    await expect(
      service.revokeCredential('user-1', tokens.credentialId),
    ).resolves.toBe(true);
    await expect(
      service.revokeCredential('user-1', tokens.credentialId),
    ).resolves.toBe(true);
    await expect(
      service.authenticateAccessToken(tokens.accessToken),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: 401 });
    await expect(
      service.revokeByRefreshToken('nb-cli', tokens.refreshToken),
    ).resolves.toBeUndefined();
    await expect(
      service.revokeByRefreshToken('nb-cli', 'nbr_unknown'),
    ).resolves.toBeUndefined();
  });

  it('expires access and refresh tokens independently', async () => {
    const { created } = await createApprovedAuthorization({
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    });
    const tokens = await service.exchangeToken({
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      clientId: 'nb-cli',
      deviceCode: created.deviceCode,
    });
    advanceSeconds(901);
    await expect(
      service.authenticateAccessToken(tokens.accessToken),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
    const refreshed = await service.exchangeToken({
      grantType: 'refresh_token',
      clientId: 'nb-cli',
      refreshToken: tokens.refreshToken,
    });
    await expect(
      service.authenticateAccessToken(refreshed.accessToken),
    ).resolves.toMatchObject({ credentialId: tokens.credentialId });

    advanceSeconds(2_592_001);
    await expect(
      service.exchangeToken({
        grantType: 'refresh_token',
        clientId: 'nb-cli',
        refreshToken: refreshed.refreshToken,
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
    await expect(
      service.listCredentials('user-1', { status: 'expired' }),
    ).resolves.toMatchObject({ total: 1, items: [{ status: 'expired' }] });
  });
});

async function createApprovedAuthorization(options: {
  scopes: AgentScope[];
  applicationScope: AgentApplicationScope;
  clientName?: string;
}): Promise<{
  created: Awaited<ReturnType<AgentAuthService['createDeviceAuthorization']>>;
}> {
  const created = await service.createDeviceAuthorization({
    clientId: 'nb-cli',
    clientName: options.clientName ?? 'Codex',
    scopes: options.scopes,
    applicationScope: options.applicationScope,
  });
  const pending = await service.resolveAuthorization(created.userCode);
  await service.approveAuthorization(pending.id, {
    userId: 'user-1',
    scopes: options.scopes,
    applicationScope: options.applicationScope,
    allowedScopes: options.scopes,
    authorizedApplicationIds:
      options.applicationScope.mode === 'selected'
        ? options.applicationScope.applicationIds
        : [],
  });
  return { created };
}

function selected(...applicationIds: string[]): AgentApplicationScope {
  return { mode: 'selected', applicationIds };
}

function advanceSeconds(seconds: number): void {
  currentTime = new Date(currentTime.valueOf() + seconds * 1_000);
}
