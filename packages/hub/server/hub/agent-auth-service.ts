import type { DatabaseConnection, Row } from '@nocobase/app-database';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { HubDomainError } from './store.ts';

export type AgentScope =
  | 'profile'
  | 'apps:create'
  | 'apps:read'
  | 'source:read'
  | 'source:write'
  | 'releases:read'
  | 'releases:publish'
  | 'deployments:read'
  | 'deployments:deploy'
  | 'deployments:rollback'
  | 'deployments:redeploy'
  | 'runtime:read'
  | 'runtime:control';

/** Scopes understood by the Hub device authorization contract. */
export const AGENT_SCOPES: readonly AgentScope[] = [
  'profile',
  'apps:create',
  'apps:read',
  'source:read',
  'source:write',
  'releases:read',
  'releases:publish',
  'deployments:read',
  'deployments:deploy',
  'deployments:rollback',
  'deployments:redeploy',
  'runtime:read',
  'runtime:control',
];

export type AgentApplicationScope =
  | {
      mode: 'selected';
      applicationIds: readonly string[];
    }
  | {
      mode: 'all-authorized';
    };

export type AgentDeviceAuthorizationStatus =
  'pending' | 'approved' | 'denied' | 'consumed' | 'expired';

export type AgentCredentialStatus =
  'active' | 'rotated' | 'revoked' | 'expired';

export interface AgentAuthServiceOptions {
  readonly tokenHashSecret: string;
  readonly verificationUri: string;
  readonly clock?: () => Date;
  readonly deviceAuthorizationTtlSeconds?: number;
  readonly pollingIntervalSeconds?: number;
  readonly accessTokenTtlSeconds?: number;
  readonly refreshTokenTtlSeconds?: number;
}

export interface CreateDeviceAuthorizationInput {
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly AgentScope[];
  readonly applicationScope: AgentApplicationScope;
}

export interface DeviceAuthorizationGrant {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly expiresIn: number;
  readonly interval: number;
}

export interface ResolvedAgentAuthorization {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly requestedScopes: readonly AgentScope[];
  readonly requestedApplicationScope: AgentApplicationScope;
  readonly status: AgentDeviceAuthorizationStatus;
  readonly expiresAt: string;
}

export interface ApproveAgentAuthorizationInput {
  readonly userId: string;
  readonly scopes: readonly AgentScope[];
  readonly applicationScope: AgentApplicationScope;
  /** Scopes allowed by the current Hub capability calculation. */
  readonly allowedScopes: readonly AgentScope[];
  /** APP IDs visible to the approving user; all-authorized is represented by an empty list. */
  readonly authorizedApplicationIds: readonly string[];
}

export interface AgentAuthorizationDecision extends ResolvedAgentAuthorization {
  readonly userId: string | null;
  readonly grantedScopes: readonly AgentScope[] | null;
  readonly grantedApplicationScope: AgentApplicationScope | null;
  readonly decidedAt: string | null;
}

export type AgentTokenGrantType =
  'urn:ietf:params:oauth:grant-type:device_code' | 'refresh_token';

export interface ExchangeAgentTokenInput {
  readonly grantType: AgentTokenGrantType;
  readonly clientId: string;
  readonly deviceCode?: string;
  readonly refreshToken?: string;
}

export interface AgentTokenResponse {
  readonly credentialId: string;
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresIn: number;
  readonly scope: string;
  readonly applicationScope: AgentApplicationScope;
}

export interface AgentAccessRequirement {
  readonly scope?: AgentScope;
  readonly applicationId?: string;
}

export interface AgentPrincipal {
  readonly credentialId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly AgentScope[];
  readonly applicationScope: AgentApplicationScope;
  readonly accessTokenExpiresAt: string;
  readonly lastUsedAt: string | null;
}

export type AgentCredentialListStatus = 'active' | 'revoked' | 'expired';
export type AgentCredentialSort =
  'createdAt' | '-createdAt' | 'lastUsedAt' | '-lastUsedAt';

export interface AgentCredentialListOptions {
  readonly query?: string;
  readonly status?: AgentCredentialListStatus;
  readonly sort?: AgentCredentialSort;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AgentCredentialSummary {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly AgentScope[];
  readonly applicationScope: AgentApplicationScope;
  readonly status: AgentCredentialStatus;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly accessTokenExpiresAt: string;
  readonly refreshTokenExpiresAt: string;
  readonly revokedAt: string | null;
}

export interface AgentCredentialPage {
  readonly items: readonly AgentCredentialSummary[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

interface DeviceAuthorizationRow extends Row {
  id: string;
  deviceCodeHash: string;
  userCodeHash: string;
  clientId: string;
  clientName: string;
  requestedScopes: unknown;
  requestedApplicationScope: unknown;
  grantedScopes: unknown;
  grantedApplicationScope: unknown;
  status: string;
  intervalSeconds: number;
  lastPolledAt: Date | string | null;
  userId: string | null;
  expiresAt: Date | string;
  approvedAt: Date | string | null;
  deniedAt: Date | string | null;
  consumedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface CredentialRow extends Row {
  id: string;
  userId: string;
  clientId: string;
  clientName: string;
  accessTokenHash: string;
  accessTokenExpiresAt: Date | string;
  refreshTokenHash: string;
  refreshTokenFamilyHash: string;
  grantedScopes: unknown;
  applicationScope: unknown;
  status: string;
  lastUsedAt: Date | string | null;
  refreshTokenExpiresAt: Date | string;
  revokedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface NormalizedAgentAuthServiceOptions {
  readonly tokenHashSecret: string;
  readonly verificationUri: string;
  readonly clock: () => Date;
  readonly deviceAuthorizationTtlSeconds: number;
  readonly pollingIntervalSeconds: number;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
}

const DEVICE_CODE_PREFIX = 'nbd_';
const ACCESS_TOKEN_PREFIX = 'nba_';
const REFRESH_TOKEN_PREFIX = 'nbr_';
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_DEVICE_AUTHORIZATION_TTL_SECONDS = 600;
const DEFAULT_POLLING_INTERVAL_SECONDS = 5;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 2_592_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Persists Device Authorization and opaque Agent credentials.
 *
 * This service intentionally has no HTTP or authorization-layer dependency.
 * Callers must pass the approving user's already-calculated scope and APP
 * capabilities to `approveAuthorization`.
 */
export class AgentAuthService {
  private readonly options: NormalizedAgentAuthServiceOptions;

  constructor(
    private readonly connection: DatabaseConnection,
    options: AgentAuthServiceOptions,
  ) {
    if (!options.tokenHashSecret.trim()) {
      throw new HubDomainError(
        'AGENT_TOKEN_HASH_SECRET_REQUIRED',
        'A dedicated Agent token hash secret is required.',
        { status: 500 },
      );
    }
    if (!options.verificationUri.trim()) {
      throw new HubDomainError(
        'AGENT_VERIFICATION_URI_REQUIRED',
        'The Agent verification URI is required.',
        { status: 500 },
      );
    }
    this.options = {
      tokenHashSecret: options.tokenHashSecret,
      verificationUri: options.verificationUri.replace(/#.*$/, ''),
      clock: options.clock ?? (() => new Date()),
      deviceAuthorizationTtlSeconds: positiveInteger(
        options.deviceAuthorizationTtlSeconds,
        DEFAULT_DEVICE_AUTHORIZATION_TTL_SECONDS,
      ),
      pollingIntervalSeconds: positiveInteger(
        options.pollingIntervalSeconds,
        DEFAULT_POLLING_INTERVAL_SECONDS,
      ),
      accessTokenTtlSeconds: positiveInteger(
        options.accessTokenTtlSeconds,
        DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      ),
      refreshTokenTtlSeconds: positiveInteger(
        options.refreshTokenTtlSeconds,
        DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      ),
    };
  }

  async createDeviceAuthorization(
    input: CreateDeviceAuthorizationInput,
  ): Promise<DeviceAuthorizationGrant> {
    const clientId = requiredText(input.clientId, 'clientId', 128);
    const clientName = requiredText(input.clientName, 'clientName', 255);
    const scopes = normalizeScopes(input.scopes);
    const applicationScope = normalizeApplicationScope(input.applicationScope);
    validateScopeCombination(scopes, applicationScope);

    const now = this.now();
    const expiresAt = new Date(
      now.valueOf() + this.options.deviceAuthorizationTtlSeconds * 1_000,
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const deviceCode = createOpaqueCode(DEVICE_CODE_PREFIX);
      const userCode = createUserCode();
      try {
        await this.connection.query
          .insertInto('hubAgentDeviceAuthorizations')
          .values({
            id: randomUUID(),
            deviceCodeHash: this.hashSecret(deviceCode),
            userCodeHash: this.hashSecret(userCode),
            clientId,
            clientName,
            requestedScopes: JSON.stringify(scopes),
            requestedApplicationScope: JSON.stringify(applicationScope),
            grantedScopes: null,
            grantedApplicationScope: null,
            status: 'pending',
            intervalSeconds: this.options.pollingIntervalSeconds,
            lastPolledAt: null,
            userId: null,
            expiresAt,
            approvedAt: null,
            deniedAt: null,
            consumedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        return {
          deviceCode,
          userCode,
          verificationUri: this.options.verificationUri,
          verificationUriComplete: `${this.options.verificationUri}#code=${encodeURIComponent(userCode)}`,
          expiresIn: this.options.deviceAuthorizationTtlSeconds,
          interval: this.options.pollingIntervalSeconds,
        };
      } catch (error) {
        if (isUniqueConstraintError(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new HubDomainError(
      'AGENT_DEVICE_CODE_COLLISION',
      'Unable to allocate a unique device authorization code.',
      { status: 500, retryable: true },
    );
  }

  async resolveAuthorization(
    userCode: string,
  ): Promise<ResolvedAgentAuthorization> {
    const row = await this.findDeviceByUserCode(userCode);
    this.ensureDeviceAvailable(row);
    if (row.status !== 'pending') {
      throw deviceDecided();
    }
    return toResolvedAuthorization(row);
  }

  async approveAuthorization(
    authorizationId: string,
    input: ApproveAgentAuthorizationInput,
  ): Promise<AgentAuthorizationDecision> {
    const row = await this.findDeviceById(authorizationId);
    this.ensureDeviceAvailable(row);
    if (row.status === 'approved') return toDecision(row);
    if (row.status !== 'pending') throw deviceDecided();

    const userId = requiredText(input.userId, 'userId', 64);
    const requestedScopes = parseScopes(row.requestedScopes);
    const requestedApplicationScope = parseApplicationScope(
      row.requestedApplicationScope,
    );
    const scopes = normalizeScopes(input.scopes);
    const applicationScope = normalizeApplicationScope(input.applicationScope);
    validateScopeCombination(scopes, applicationScope);
    if (!isSubset(scopes, requestedScopes)) {
      throw invalidScopeCombination(
        'Approved scopes cannot exceed the requested scopes.',
      );
    }
    if (!isSubset(scopes, normalizeScopes(input.allowedScopes))) {
      throw invalidScopeCombination(
        'Approved scopes exceed the current user capabilities.',
      );
    }
    validateApplicationScopeSubset(
      applicationScope,
      requestedApplicationScope,
      input.authorizedApplicationIds,
    );

    const now = this.now();
    const result = await this.connection.query
      .updateTable('hubAgentDeviceAuthorizations')
      .set({
        grantedScopes: JSON.stringify(scopes),
        grantedApplicationScope: JSON.stringify(applicationScope),
        status: 'approved',
        userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where('id', '=', authorizationId)
      .where('status', '=', 'pending')
      .execute();
    if (updatedCount(result) !== 1) {
      const latest = await this.findDeviceById(authorizationId);
      if (latest.status === 'approved') return toDecision(latest);
      throw deviceDecided();
    }
    return toDecision({
      ...row,
      grantedScopes: JSON.stringify(scopes),
      grantedApplicationScope: JSON.stringify(applicationScope),
      status: 'approved',
      userId,
      approvedAt: now,
      updatedAt: now,
    });
  }

  async denyAuthorization(
    authorizationId: string,
    userId: string,
  ): Promise<AgentAuthorizationDecision> {
    const row = await this.findDeviceById(authorizationId);
    this.ensureDeviceAvailable(row);
    if (row.status === 'denied') return toDecision(row);
    if (row.status !== 'pending') throw deviceDecided();
    const now = this.now();
    const normalizedUserId = requiredText(userId, 'userId', 64);
    const result = await this.connection.query
      .updateTable('hubAgentDeviceAuthorizations')
      .set({
        status: 'denied',
        userId: normalizedUserId,
        deniedAt: now,
        updatedAt: now,
      })
      .where('id', '=', authorizationId)
      .where('status', '=', 'pending')
      .execute();
    if (updatedCount(result) !== 1) {
      const latest = await this.findDeviceById(authorizationId);
      if (latest.status === 'denied') return toDecision(latest);
      throw deviceDecided();
    }
    return toDecision({
      ...row,
      status: 'denied',
      userId: normalizedUserId,
      deniedAt: now,
      updatedAt: now,
    });
  }

  async exchangeToken(
    input: ExchangeAgentTokenInput,
  ): Promise<AgentTokenResponse> {
    const clientId = requiredText(input.clientId, 'clientId', 128);
    if (input.grantType === 'refresh_token') {
      return this.exchangeRefreshToken(clientId, input.refreshToken);
    }
    if (input.grantType !== 'urn:ietf:params:oauth:grant-type:device_code') {
      throw validationError('grantType', 'Unsupported token grant type.');
    }
    return this.exchangeDeviceCode(clientId, input.deviceCode);
  }

  async authenticateAccessToken(
    accessToken: string,
    requirement: AgentAccessRequirement = {},
  ): Promise<AgentPrincipal> {
    const row = await this.findCredentialByAccessToken(accessToken);
    if (!row || row.status !== 'active') throw tokenInvalid();
    const now = this.now();
    const expiresAt = asDate(row.accessTokenExpiresAt);
    if (expiresAt.valueOf() <= now.valueOf()) {
      throw tokenExpired();
    }
    const scopes = parseScopes(row.grantedScopes);
    if (requirement.scope && !scopes.includes(requirement.scope)) {
      throw insufficientScope();
    }
    if (
      requirement.applicationId &&
      !applicationScopeAllows(
        parseApplicationScope(row.applicationScope),
        requirement.applicationId,
      )
    ) {
      throw insufficientScope();
    }
    await this.connection.query
      .updateTable('hubAgentCredentials')
      .set({ lastUsedAt: now, updatedAt: now })
      .where('id', '=', row.id)
      .where('status', '=', 'active')
      .execute();
    return {
      credentialId: String(row.id),
      userId: String(row.userId),
      clientId: String(row.clientId),
      clientName: String(row.clientName),
      scopes,
      applicationScope: parseApplicationScope(row.applicationScope),
      accessTokenExpiresAt: expiresAt.toISOString(),
      lastUsedAt: now.toISOString(),
    };
  }

  async listCredentials(
    userId: string,
    options: AgentCredentialListOptions = {},
  ): Promise<AgentCredentialPage> {
    const normalizedUserId = requiredText(userId, 'userId', 64);
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);
    let rows = await this.connection.query
      .selectFrom<CredentialRow>('hubAgentCredentials')
      .selectAll()
      .where('userId', '=', normalizedUserId)
      .execute<CredentialRow>();
    const query = options.query?.trim().toLowerCase();
    if (query) {
      rows = rows.filter((row) =>
        `${row.clientName} ${row.clientId}`.toLowerCase().includes(query),
      );
    }
    rows = dedupeCredentialFamilies(rows);
    const now = this.now();
    if (options.status) {
      rows = rows.filter(
        (row) => credentialListStatus(row, now) === options.status,
      );
    }
    rows.sort((left, right) =>
      compareCredentialRows(left, right, options.sort),
    );
    const total = rows.length;
    return {
      items: rows
        .slice(offset, offset + limit)
        .map((row) => toCredentialSummary(row, now)),
      total,
      limit,
      offset,
    };
  }

  async revokeCredential(
    userId: string,
    credentialId: string,
  ): Promise<boolean> {
    const normalizedUserId = requiredText(userId, 'userId', 64);
    const row = await this.connection.query
      .selectFrom<CredentialRow>('hubAgentCredentials')
      .selectAll()
      .where('id', '=', credentialId)
      .where('userId', '=', normalizedUserId)
      .executeTakeFirst<CredentialRow>();
    if (!row) return false;
    await this.revokeFamily(row.refreshTokenFamilyHash);
    return true;
  }

  async revokeByRefreshToken(
    clientId: string,
    refreshToken: string,
  ): Promise<void> {
    const row = await this.findCredentialByRefreshToken(refreshToken);
    if (!row || row.clientId !== clientId) return;
    await this.revokeFamily(row.refreshTokenFamilyHash);
  }

  private async exchangeDeviceCode(
    clientId: string,
    deviceCode: string | undefined,
  ): Promise<AgentTokenResponse> {
    const row = await this.findDeviceByDeviceCode(deviceCode);
    if (String(row.clientId) !== clientId) throw deviceNotFound();
    this.ensureDeviceAvailable(row);
    const now = this.now();
    if (row.status === 'pending') {
      const lastPolledAt = row.lastPolledAt
        ? asDate(row.lastPolledAt).valueOf()
        : null;
      if (
        lastPolledAt !== null &&
        now.valueOf() - lastPolledAt < Number(row.intervalSeconds) * 1_000
      ) {
        throw new HubDomainError(
          'SLOW_DOWN',
          'The device authorization is being polled too quickly.',
          { status: 429, retryable: true },
        );
      }
      await this.connection.query
        .updateTable('hubAgentDeviceAuthorizations')
        .set({ lastPolledAt: now, updatedAt: now })
        .where('id', '=', row.id)
        .where('status', '=', 'pending')
        .execute();
      throw new HubDomainError(
        'AUTHORIZATION_PENDING',
        'The user has not approved this device authorization yet.',
        { status: 428, retryable: true },
      );
    }
    if (row.status === 'denied') {
      throw new HubDomainError(
        'AUTHORIZATION_DENIED',
        'The user denied this device authorization.',
        { status: 403 },
      );
    }
    if (row.status !== 'approved') throw deviceNotFound();
    const scopes = parseScopes(row.grantedScopes);
    const applicationScope = parseApplicationScope(row.grantedApplicationScope);
    if (!row.userId || !row.grantedScopes || !row.grantedApplicationScope) {
      throw new HubDomainError(
        'AGENT_AUTHORIZATION_STATE_INVALID',
        'The approved device authorization is incomplete.',
        { status: 500 },
      );
    }
    const response = await this.createCredential({
      userId: String(row.userId),
      clientId,
      clientName: String(row.clientName),
      scopes,
      applicationScope,
      authorizationId: String(row.id),
    });
    return response;
  }

  private async exchangeRefreshToken(
    clientId: string,
    refreshToken: string | undefined,
  ): Promise<AgentTokenResponse> {
    const row = await this.findCredentialByRefreshToken(refreshToken);
    if (!row || row.clientId !== clientId) throw tokenInvalid();
    if (row.status === 'rotated') {
      await this.revokeFamily(row.refreshTokenFamilyHash);
      throw tokenInvalid();
    }
    if (row.status !== 'active') {
      if (row.status === 'expired') throw tokenExpired();
      throw tokenInvalid();
    }
    if (asDate(row.refreshTokenExpiresAt).valueOf() <= this.now().valueOf()) {
      await this.markCredentialExpired(row.id);
      throw tokenExpired();
    }
    return this.rotateCredential(row);
  }

  private async createCredential(input: {
    userId: string;
    clientId: string;
    clientName: string;
    scopes: readonly AgentScope[];
    applicationScope: AgentApplicationScope;
    authorizationId: string;
  }): Promise<AgentTokenResponse> {
    const now = this.now();
    const accessToken = createOpaqueCode(ACCESS_TOKEN_PREFIX);
    const refreshToken = createOpaqueCode(REFRESH_TOKEN_PREFIX);
    const familySecret = createOpaqueCode('nbf_');
    const accessExpiresAt = new Date(
      now.valueOf() + this.options.accessTokenTtlSeconds * 1_000,
    );
    const refreshExpiresAt = new Date(
      now.valueOf() + this.options.refreshTokenTtlSeconds * 1_000,
    );
    const credentialId = randomUUID();
    await this.connection.transaction(async (connection) => {
      const current = await connection.query
        .selectFrom<DeviceAuthorizationRow>('hubAgentDeviceAuthorizations')
        .selectAll()
        .where('id', '=', input.authorizationId)
        .executeTakeFirst<DeviceAuthorizationRow>();
      if (!current || current.status !== 'approved') throw deviceNotFound();
      await connection.query
        .insertInto('hubAgentCredentials')
        .values({
          id: credentialId,
          userId: input.userId,
          clientId: input.clientId,
          clientName: input.clientName,
          accessTokenHash: this.hashSecret(accessToken),
          accessTokenExpiresAt: accessExpiresAt,
          refreshTokenHash: this.hashSecret(refreshToken),
          refreshTokenFamilyHash: this.hashSecret(familySecret),
          grantedScopes: JSON.stringify(input.scopes),
          applicationScope: JSON.stringify(input.applicationScope),
          status: 'active',
          lastUsedAt: null,
          refreshTokenExpiresAt: refreshExpiresAt,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const consumed = await connection.query
        .updateTable('hubAgentDeviceAuthorizations')
        .set({ status: 'consumed', consumedAt: now, updatedAt: now })
        .where('id', '=', input.authorizationId)
        .where('status', '=', 'approved')
        .execute();
      if (updatedCount(consumed) !== 1) throw deviceNotFound();
    });
    return tokenResponse(
      credentialId,
      accessToken,
      refreshToken,
      this.options.accessTokenTtlSeconds,
      this.options.refreshTokenTtlSeconds,
      input.scopes,
      input.applicationScope,
    );
  }

  private async rotateCredential(
    row: CredentialRow,
  ): Promise<AgentTokenResponse> {
    const now = this.now();
    const accessToken = createOpaqueCode(ACCESS_TOKEN_PREFIX);
    const refreshToken = createOpaqueCode(REFRESH_TOKEN_PREFIX);
    const accessExpiresAt = new Date(
      now.valueOf() + this.options.accessTokenTtlSeconds * 1_000,
    );
    const refreshExpiresAt = new Date(
      now.valueOf() + this.options.refreshTokenTtlSeconds * 1_000,
    );
    const oldAccessHash = String(row.accessTokenHash);
    const oldRefreshHash = String(row.refreshTokenHash);
    const scopes = parseScopes(row.grantedScopes);
    const applicationScope = parseApplicationScope(row.applicationScope);
    await this.connection.transaction(async (connection) => {
      const current = await connection.query
        .selectFrom<CredentialRow>('hubAgentCredentials')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirst<CredentialRow>();
      if (!current || current.status !== 'active') throw tokenInvalid();
      const updated = await connection.query
        .updateTable('hubAgentCredentials')
        .set({
          accessTokenHash: this.hashSecret(accessToken),
          accessTokenExpiresAt: accessExpiresAt,
          refreshTokenHash: this.hashSecret(refreshToken),
          status: 'active',
          lastUsedAt: now,
          refreshTokenExpiresAt: refreshExpiresAt,
          updatedAt: now,
        })
        .where('id', '=', row.id)
        .where('status', '=', 'active')
        .where('refreshTokenHash', '=', oldRefreshHash)
        .execute();
      if (updatedCount(updated) !== 1) throw tokenInvalid();
      await connection.query
        .insertInto('hubAgentCredentials')
        .values({
          id: randomUUID(),
          userId: row.userId,
          clientId: row.clientId,
          clientName: row.clientName,
          accessTokenHash: oldAccessHash,
          accessTokenExpiresAt: row.accessTokenExpiresAt,
          refreshTokenHash: oldRefreshHash,
          refreshTokenFamilyHash: row.refreshTokenFamilyHash,
          grantedScopes: JSON.stringify(scopes),
          applicationScope: JSON.stringify(applicationScope),
          status: 'rotated',
          lastUsedAt: row.lastUsedAt,
          refreshTokenExpiresAt: row.refreshTokenExpiresAt,
          revokedAt: null,
          createdAt: new Date(
            Math.max(now.valueOf(), asDate(row.createdAt).valueOf() + 1),
          ),
          updatedAt: now,
        })
        .execute();
    });
    return tokenResponse(
      row.id,
      accessToken,
      refreshToken,
      this.options.accessTokenTtlSeconds,
      this.options.refreshTokenTtlSeconds,
      scopes,
      applicationScope,
    );
  }

  private async revokeFamily(familyHash: string): Promise<void> {
    const now = this.now();
    await this.connection.query
      .updateTable('hubAgentCredentials')
      .set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where('refreshTokenFamilyHash', '=', familyHash)
      .where('status', '!=', 'revoked')
      .execute();
  }

  private async markCredentialExpired(credentialId: string): Promise<void> {
    await this.connection.query
      .updateTable('hubAgentCredentials')
      .set({ status: 'expired', updatedAt: this.now() })
      .where('id', '=', credentialId)
      .where('status', '=', 'active')
      .execute();
  }

  private async findDeviceById(id: string): Promise<DeviceAuthorizationRow> {
    const row = await this.connection.query
      .selectFrom<DeviceAuthorizationRow>('hubAgentDeviceAuthorizations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<DeviceAuthorizationRow>();
    if (!row) throw deviceNotFound();
    return row;
  }

  private async findDeviceByUserCode(
    userCode: string,
  ): Promise<DeviceAuthorizationRow> {
    const normalized = normalizeUserCode(userCode);
    const row = await this.connection.query
      .selectFrom<DeviceAuthorizationRow>('hubAgentDeviceAuthorizations')
      .selectAll()
      .where('userCodeHash', '=', this.hashSecret(normalized))
      .executeTakeFirst<DeviceAuthorizationRow>();
    if (!row) throw deviceNotFound();
    return row;
  }

  private async findDeviceByDeviceCode(
    deviceCode: string | undefined,
  ): Promise<DeviceAuthorizationRow> {
    if (!deviceCode) throw deviceNotFound();
    const row = await this.connection.query
      .selectFrom<DeviceAuthorizationRow>('hubAgentDeviceAuthorizations')
      .selectAll()
      .where('deviceCodeHash', '=', this.hashSecret(deviceCode))
      .executeTakeFirst<DeviceAuthorizationRow>();
    if (!row) throw deviceNotFound();
    return row;
  }

  private async findCredentialByAccessToken(
    accessToken: string,
  ): Promise<CredentialRow | undefined> {
    if (!accessToken) return undefined;
    return this.connection.query
      .selectFrom<CredentialRow>('hubAgentCredentials')
      .selectAll()
      .where('accessTokenHash', '=', this.hashSecret(accessToken))
      .executeTakeFirst<CredentialRow>();
  }

  private async findCredentialByRefreshToken(
    refreshToken: string | undefined,
  ): Promise<CredentialRow | undefined> {
    if (!refreshToken) return undefined;
    return this.connection.query
      .selectFrom<CredentialRow>('hubAgentCredentials')
      .selectAll()
      .where('refreshTokenHash', '=', this.hashSecret(refreshToken))
      .executeTakeFirst<CredentialRow>();
  }

  private ensureDeviceAvailable(row: DeviceAuthorizationRow): void {
    if (asDate(row.expiresAt).valueOf() <= this.now().valueOf()) {
      if (row.status === 'pending') {
        void this.connection.query
          .updateTable('hubAgentDeviceAuthorizations')
          .set({ status: 'expired', updatedAt: this.now() })
          .where('id', '=', row.id)
          .where('status', '=', 'pending')
          .execute();
      }
      throw new HubDomainError(
        'DEVICE_AUTHORIZATION_EXPIRED',
        'The device authorization has expired.',
        { status: 410 },
      );
    }
  }

  private hashSecret(value: string): string {
    return `hmac-sha256:${createHmac('sha256', this.options.tokenHashSecret)
      .update(value, 'utf8')
      .digest('hex')}`;
  }

  private now(): Date {
    return new Date(this.options.clock());
  }
}

function tokenResponse(
  credentialId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  refreshExpiresIn: number,
  scopes: readonly AgentScope[],
  applicationScope: AgentApplicationScope,
): AgentTokenResponse {
  return {
    credentialId,
    accessToken,
    tokenType: 'Bearer',
    expiresIn,
    refreshToken,
    refreshExpiresIn,
    scope: scopes.join(' '),
    applicationScope,
  };
}

function toResolvedAuthorization(
  row: DeviceAuthorizationRow,
): ResolvedAgentAuthorization {
  return {
    id: String(row.id),
    clientId: String(row.clientId),
    clientName: String(row.clientName),
    requestedScopes: parseScopes(row.requestedScopes),
    requestedApplicationScope: parseApplicationScope(
      row.requestedApplicationScope,
    ),
    status: normalizeDeviceStatus(row.status),
    expiresAt: asDate(row.expiresAt).toISOString(),
  };
}

function toDecision(row: DeviceAuthorizationRow): AgentAuthorizationDecision {
  return {
    ...toResolvedAuthorization(row),
    userId: nullableText(row.userId),
    grantedScopes: row.grantedScopes ? parseScopes(row.grantedScopes) : null,
    grantedApplicationScope: row.grantedApplicationScope
      ? parseApplicationScope(row.grantedApplicationScope)
      : null,
    decidedAt: row.approvedAt
      ? asDate(row.approvedAt).toISOString()
      : row.deniedAt
        ? asDate(row.deniedAt).toISOString()
        : null,
  };
}

function toCredentialSummary(
  row: CredentialRow,
  now: Date,
): AgentCredentialSummary {
  return {
    id: String(row.id),
    clientId: String(row.clientId),
    clientName: String(row.clientName),
    scopes: parseScopes(row.grantedScopes),
    applicationScope: parseApplicationScope(row.applicationScope),
    status: credentialListStatus(row, now),
    createdAt: asDate(row.createdAt).toISOString(),
    lastUsedAt: row.lastUsedAt ? asDate(row.lastUsedAt).toISOString() : null,
    accessTokenExpiresAt: asDate(row.accessTokenExpiresAt).toISOString(),
    refreshTokenExpiresAt: asDate(row.refreshTokenExpiresAt).toISOString(),
    revokedAt: row.revokedAt ? asDate(row.revokedAt).toISOString() : null,
  };
}

function normalizeScopes(values: readonly unknown[] | undefined): AgentScope[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw validationError('scopes', 'At least one Agent scope is required.');
  }
  const result: AgentScope[] = [];
  for (const value of values) {
    if (!isAgentScope(value)) {
      throw validationError('scopes', 'An unknown Agent scope was requested.');
    }
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function parseScopes(value: unknown): AgentScope[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return normalizeScopes(parsed);
}

function normalizeApplicationScope(
  value: AgentApplicationScope | undefined,
): AgentApplicationScope {
  if (
    !value ||
    (value.mode !== 'selected' && value.mode !== 'all-authorized')
  ) {
    throw validationError(
      'applicationScope',
      'applicationScope.mode must be selected or all-authorized.',
    );
  }
  if (value.mode === 'all-authorized') {
    if (
      'applicationIds' in value &&
      Array.isArray(value.applicationIds) &&
      value.applicationIds.length > 0
    ) {
      throw invalidScopeCombination(
        'all-authorized scope must not include application IDs.',
      );
    }
    return { mode: 'all-authorized' };
  }
  if (
    !Array.isArray(value.applicationIds) ||
    value.applicationIds.length === 0
  ) {
    throw invalidScopeCombination(
      'selected application scope requires at least one APP ID.',
    );
  }
  if (value.applicationIds.some((id) => typeof id !== 'string')) {
    throw validationError(
      'applicationScope.applicationIds',
      'Application IDs must be strings.',
    );
  }
  const applicationIds = [
    ...new Set((value.applicationIds as string[]).map((id) => id.trim())),
  ];
  if (applicationIds.some((id) => !id || id.length > 64)) {
    throw validationError(
      'applicationScope.applicationIds',
      'Application IDs must be non-empty values up to 64 characters.',
    );
  }
  return { mode: 'selected', applicationIds };
}

function parseApplicationScope(value: unknown): AgentApplicationScope {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      parsed = undefined;
    }
  }
  return normalizeApplicationScope(parsed as AgentApplicationScope);
}

function validateScopeCombination(
  scopes: readonly AgentScope[],
  applicationScope: AgentApplicationScope,
): void {
  if (
    scopes.includes('apps:create') &&
    applicationScope.mode !== 'all-authorized'
  ) {
    throw invalidScopeCombination(
      'apps:create requires an all-authorized application scope.',
    );
  }
}

function validateApplicationScopeSubset(
  granted: AgentApplicationScope,
  requested: AgentApplicationScope,
  authorizedApplicationIds: readonly string[],
): void {
  if (requested.mode === 'selected' && granted.mode === 'all-authorized') {
    throw invalidScopeCombination(
      'Approval cannot expand a selected application scope.',
    );
  }
  if (granted.mode === 'selected') {
    const authorized = new Set(authorizedApplicationIds);
    if (granted.applicationIds.some((id) => !authorized.has(id))) {
      throw invalidScopeCombination(
        'Approval includes an APP outside the current user scope.',
      );
    }
  }
  if (requested.mode === 'selected') {
    const requestedIds = new Set(requested.applicationIds);
    if (
      granted.mode !== 'selected' ||
      granted.applicationIds.some((id) => !requestedIds.has(id))
    ) {
      throw invalidScopeCombination(
        'Approved APP scope must be a subset of the requested scope.',
      );
    }
  }
}

function applicationScopeAllows(
  scope: AgentApplicationScope,
  applicationId: string,
): boolean {
  return (
    scope.mode === 'all-authorized' ||
    scope.applicationIds.includes(applicationId)
  );
}

function isSubset(
  values: readonly AgentScope[],
  superset: readonly AgentScope[],
): boolean {
  const allowed = new Set(superset);
  return values.every((value) => allowed.has(value));
}

function compareCredentialRows(
  left: CredentialRow,
  right: CredentialRow,
  sort: AgentCredentialSort | undefined,
): number {
  const normalizedSort = sort ?? '-createdAt';
  const direction = normalizedSort.startsWith('-') ? -1 : 1;
  const key = normalizedSort.replace(/^-/, '');
  const leftValue = key === 'lastUsedAt' ? left.lastUsedAt : left.createdAt;
  const rightValue = key === 'lastUsedAt' ? right.lastUsedAt : right.createdAt;
  const leftTime = leftValue ? asDate(leftValue).valueOf() : 0;
  const rightTime = rightValue ? asDate(rightValue).valueOf() : 0;
  const timeComparison = (leftTime - rightTime) * direction;
  if (timeComparison !== 0) return timeComparison;
  return String(left.id).localeCompare(String(right.id)) * direction;
}

function dedupeCredentialFamilies(rows: CredentialRow[]): CredentialRow[] {
  const byFamily = new Map<string, CredentialRow>();
  for (const row of rows) {
    const familyHash = String(row.refreshTokenFamilyHash);
    const current = byFamily.get(familyHash);
    if (!current || preferCredentialRow(row, current)) {
      byFamily.set(familyHash, row);
    }
  }
  return [...byFamily.values()].filter((row) => row.status !== 'rotated');
}

function preferCredentialRow(
  candidate: CredentialRow,
  current: CredentialRow,
): boolean {
  if (candidate.status !== 'rotated' && current.status === 'rotated') {
    return true;
  }
  if (candidate.status === 'rotated' && current.status !== 'rotated') {
    return false;
  }
  const createdComparison =
    asDate(candidate.createdAt).valueOf() - asDate(current.createdAt).valueOf();
  if (createdComparison !== 0) return createdComparison < 0;
  const candidateRefreshExpiry = asDate(
    candidate.refreshTokenExpiresAt,
  ).valueOf();
  const currentRefreshExpiry = asDate(current.refreshTokenExpiresAt).valueOf();
  if (candidateRefreshExpiry !== currentRefreshExpiry) {
    return candidateRefreshExpiry > currentRefreshExpiry;
  }
  return String(candidate.id).localeCompare(String(current.id)) < 0;
}

function credentialListStatus(
  row: CredentialRow,
  now: Date,
): AgentCredentialListStatus {
  const status = normalizeCredentialStatus(row.status);
  if (
    status === 'active' &&
    asDate(row.refreshTokenExpiresAt).valueOf() <= now.valueOf()
  ) {
    return 'expired';
  }
  if (status === 'active' || status === 'revoked' || status === 'expired') {
    return status;
  }
  return 'revoked';
}

function createOpaqueCode(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function createUserCode(): string {
  let value = '';
  for (let index = 0; index < 4; index += 1) {
    value += USER_CODE_ALPHABET[randomBytes(1)[0] % USER_CODE_ALPHABET.length];
  }
  return `NB3-${value}`;
}

function normalizeUserCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^NB3-[A-HJ-NP-Z2-9]{4}$/.test(normalized)) throw deviceNotFound();
  return normalized;
}

function requiredText(
  value: string | undefined,
  field: string,
  max: number,
): string {
  const normalized = value?.trim() ?? '';
  if (!normalized || normalized.length > max) {
    throw validationError(
      field,
      `${field} is required and must be at most ${max} characters.`,
    );
  }
  return normalized;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new HubDomainError('INVALID_QUERY', 'limit is out of range.', {
      status: 400,
    });
  }
  return value;
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new HubDomainError('INVALID_QUERY', 'offset is invalid.', {
      status: 400,
    });
  }
  return value;
}

function validationError(field: string, message: string): HubDomainError {
  return new HubDomainError('VALIDATION_ERROR', message, {
    status: 422,
    issues: [{ path: field, code: 'invalid', message }],
  });
}

function invalidScopeCombination(message: string): HubDomainError {
  return new HubDomainError('INVALID_SCOPE_COMBINATION', message, {
    status: 422,
  });
}

function deviceNotFound(): HubDomainError {
  return new HubDomainError(
    'DEVICE_AUTHORIZATION_NOT_FOUND',
    'The device authorization was not found.',
    { status: 404 },
  );
}

function deviceDecided(): HubDomainError {
  return new HubDomainError(
    'DEVICE_AUTHORIZATION_DECIDED',
    'The device authorization has already been decided.',
    { status: 409 },
  );
}

function tokenInvalid(): HubDomainError {
  return new HubDomainError('TOKEN_INVALID', 'The Agent token is invalid.', {
    status: 401,
  });
}

function tokenExpired(): HubDomainError {
  return new HubDomainError('TOKEN_EXPIRED', 'The Agent token has expired.', {
    status: 401,
  });
}

function insufficientScope(): HubDomainError {
  return new HubDomainError(
    'INSUFFICIENT_SCOPE',
    'The Agent token does not grant the requested scope.',
    { status: 403 },
  );
}

function normalizeDeviceStatus(value: unknown): AgentDeviceAuthorizationStatus {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'consumed' ||
    value === 'expired'
  ) {
    return value;
  }
  return 'expired';
}

function normalizeCredentialStatus(value: unknown): AgentCredentialStatus {
  if (
    value === 'active' ||
    value === 'rotated' ||
    value === 'revoked' ||
    value === 'expired'
  ) {
    return value;
  }
  return 'revoked';
}

function asDate(value: unknown): Date {
  let date: Date;
  if (value instanceof Date) {
    date = new Date(value);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    date = new Date(Number(value));
  } else {
    date = new Date(String(value));
  }
  if (!Number.isFinite(date.valueOf())) {
    throw new HubDomainError(
      'AGENT_AUTHORIZATION_STATE_INVALID',
      'The Agent authorization contains an invalid timestamp.',
      { status: 500 },
    );
  }
  return date;
}

function nullableText(value: unknown): string | null {
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

function isAgentScope(value: unknown): value is AgentScope {
  return (
    typeof value === 'string' && AGENT_SCOPES.some((scope) => scope === value)
  );
}

function updatedCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const record = value as { updatedCount?: unknown; numUpdatedRows?: unknown };
  const count = record.updatedCount ?? record.numUpdatedRows;
  return typeof count === 'bigint' ? Number(count) : Number(count ?? 0);
}

function isUniqueConstraintError(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown };
  return (
    value?.code === 'SQLITE_CONSTRAINT' ||
    value?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (typeof value?.message === 'string' &&
      value.message.includes('UNIQUE constraint failed'))
  );
}
