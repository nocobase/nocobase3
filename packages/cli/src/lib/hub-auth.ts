import {
  CredentialStore,
  type CredentialStorage,
  type StoredCredential,
} from './credential-store.ts';
import {
  HubApiError,
  HubClient,
  normalizeHubUrl,
  type AgentScope,
} from './hub-client.ts';
import { formatShellCommand } from './shell.ts';

export const HUB_CLI_CLIENT_ID = 'nb3-cli';
const EXPIRY_SKEW_MS = 30_000;

export class HubCredentialError extends Error {
  public readonly code: 'NOT_LOGGED_IN' | 'INSUFFICIENT_SCOPE';
  public readonly hint: string;

  public constructor(
    code: 'NOT_LOGGED_IN' | 'INSUFFICIENT_SCOPE',
    message: string,
    hint: string,
  ) {
    super(message);
    this.name = 'HubCredentialError';
    this.code = code;
    this.hint = hint;
  }
}

export interface HubCredentialManagerOptions {
  store?: CredentialStorage;
  clock?: () => number;
}

export class HubCredentialManager {
  public readonly hub: string;
  private readonly store: CredentialStorage;
  private readonly clock: () => number;

  public constructor(hub: string, options: HubCredentialManagerOptions = {}) {
    this.hub = normalizeHubUrl(hub);
    this.store = options.store ?? new CredentialStore();
    this.clock = options.clock ?? Date.now;
  }

  public async requireCredential(
    requiredScopes: readonly AgentScope[],
  ): Promise<StoredCredential> {
    let credential = await this.store.get(this.hub);
    if (!credential) throw this.notLoggedIn(requiredScopes);
    this.assertScopes(credential, requiredScopes);
    if (
      credential.accessTokenExpiresAt !== null &&
      credential.accessTokenExpiresAt <= this.clock() + EXPIRY_SKEW_MS
    ) {
      credential = await this.refresh(credential, requiredScopes);
    }
    return credential;
  }

  public async authorized<T>(
    requiredScopes: readonly AgentScope[],
    operation: (client: HubClient, credential: StoredCredential) => Promise<T>,
  ): Promise<T> {
    let credential = await this.requireCredential(requiredScopes);
    try {
      return await operation(
        new HubClient(this.hub, { accessToken: credential.accessToken }),
        credential,
      );
    } catch (error) {
      if (
        !(error instanceof HubApiError) ||
        !['TOKEN_EXPIRED', 'TOKEN_INVALID', 'UNAUTHORIZED'].includes(error.code)
      ) {
        throw error;
      }
      const latest = await this.store.get(this.hub);
      if (latest && latest.accessToken !== credential.accessToken) {
        this.assertScopes(latest, requiredScopes);
        credential = latest;
      } else {
        credential = await this.refresh(credential, requiredScopes);
      }
      return await operation(
        new HubClient(this.hub, { accessToken: credential.accessToken }),
        credential,
      );
    }
  }

  private async refresh(
    credential: StoredCredential,
    requiredScopes: readonly AgentScope[],
  ): Promise<StoredCredential> {
    if (
      credential.refreshTokenExpiresAt !== null &&
      credential.refreshTokenExpiresAt <= this.clock()
    ) {
      await this.store.remove(this.hub);
      throw this.notLoggedIn(requiredScopes);
    }
    let token;
    try {
      token = await new HubClient(this.hub).exchangeToken({
        grantType: 'refresh_token',
        clientId: credential.clientId ?? HUB_CLI_CLIENT_ID,
        refreshToken: credential.refreshToken,
      });
    } catch (error) {
      if (
        error instanceof HubApiError &&
        ['TOKEN_EXPIRED', 'TOKEN_INVALID', 'UNAUTHORIZED'].includes(error.code)
      ) {
        await this.store.remove(this.hub);
        throw this.notLoggedIn(requiredScopes);
      }
      throw error;
    }
    const now = this.clock();
    const updated: StoredCredential = {
      hub: this.hub,
      clientId: credential.clientId ?? HUB_CLI_CLIENT_ID,
      credentialId: token.credentialId,
      accessToken: token.accessToken,
      accessTokenExpiresAt: now + token.expiresIn * 1000,
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt: now + token.refreshExpiresIn * 1000,
      scopes: parseScope(token.scope),
      applicationScope: token.applicationScope,
    };
    this.assertScopes(updated, requiredScopes);
    await this.store.set(updated);
    return updated;
  }

  private assertScopes(
    credential: StoredCredential,
    requiredScopes: readonly AgentScope[],
  ): void {
    const missing = requiredScopes.filter(
      (scope) => !credential.scopes.includes(scope),
    );
    if (missing.length === 0) return;
    throw new HubCredentialError(
      'INSUFFICIENT_SCOPE',
      `The saved Hub credential is missing scope${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`,
      loginHint(this.hub, requiredScopes),
    );
  }

  private notLoggedIn(
    requiredScopes: readonly AgentScope[],
  ): HubCredentialError {
    return new HubCredentialError(
      'NOT_LOGGED_IN',
      `No usable credential is saved for Hub ${this.hub}.`,
      loginHint(this.hub, requiredScopes),
    );
  }
}

export function parseScope(value: string): AgentScope[] {
  return value.trim().split(/\s+/).filter(Boolean) as AgentScope[];
}

export function loginHint(hub: string, scopes: readonly AgentScope[]): string {
  return formatShellCommand([
    'nb3',
    'hub',
    'login',
    '--hub',
    hub,
    ...scopes.flatMap((scope) => ['--scope', scope]),
  ]);
}
