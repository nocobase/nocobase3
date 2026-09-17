import type { ApiKey } from '@better-auth/api-key';
import type { Auth } from '@nocobase/app-plugin-authentication/server';
import type { ApiKeysPlugin } from './api-keys.js';
import type { DatabaseConnection } from '@nocobase/db';

export type ServerApiKeySummary = Omit<ApiKey, 'key'>;
export interface CreateServerApiKeyInput {
  readonly userId: string;
  readonly name: string;
  readonly expiresIn?: number | null;
}

/** Trusted, database-backed operations. Callers must enforce their own authorization. */
export class ApiKeyService {
  constructor(
    private readonly auth: Pick<Auth, 'pluginApi' | 'forConnection'>,
    private readonly configId: string,
  ) {}

  withConnection(connection: DatabaseConnection): ApiKeyService {
    return new ApiKeyService(
      this.auth.forConnection(connection),
      this.configId,
    );
  }

  private async runtime() {
    const endpoints = this.auth.pluginApi<ApiKeysPlugin>('api-key');
    // Validate the configuration rather than accepting Better Auth's fallback to default.
    await endpoints.getServerApiKey({ query: { configId: this.configId } });
    return endpoints;
  }

  async create(
    input: CreateServerApiKeyInput,
  ): Promise<{ key: ServerApiKeySummary; secret: string }> {
    const endpoints = await this.runtime();
    const { key: secret, ...key } = await endpoints.createApiKey({
      body: { ...input, configId: this.configId },
    });
    return { key, secret };
  }

  async verify(secret: string): Promise<ServerApiKeySummary | null> {
    const endpoints = await this.runtime();
    const result = await endpoints.verifyApiKey({
      body: { configId: this.configId, key: secret },
    });
    return result.valid ? result.key : null;
  }

  async get(id: string): Promise<ServerApiKeySummary | null> {
    const endpoints = await this.runtime();
    return endpoints.getServerApiKey({
      query: { id, configId: this.configId },
    });
  }

  async disable(id: string): Promise<void> {
    const key = await this.get(id);
    if (!key || !key.enabled) return;
    const endpoints = await this.runtime();
    await endpoints.updateApiKey({
      body: {
        configId: this.configId,
        keyId: id,
        userId: key.referenceId,
        enabled: false,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const endpoints = await this.runtime();
    await endpoints.deleteServerApiKey({
      body: { keyId: id, configId: this.configId },
    });
  }
}

/** Remove database-backed user credentials in the caller's deletion transaction. */
export async function removeUserApiKeys(
  connection: DatabaseConnection,
  userId: string,
  configIds: readonly string[],
): Promise<void> {
  if (!configIds.length) return;
  await connection.query
    .deleteFrom('apikey')
    .where('referenceId', '=', userId)
    .where('configId', 'in', [...configIds])
    .execute();
}
