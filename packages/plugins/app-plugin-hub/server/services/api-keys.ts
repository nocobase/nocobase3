import type {
  ApiKeyService,
  ServerApiKeySummary,
} from '@nocobase/app-plugin-api-keys/server';
import type { DatabaseManager, Row } from '@nocobase/db';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { HubError } from './hub.js';
import {
  HUB_API_KEY_SCOPES,
  HUB_API_KEY_ACTIONS,
  type HubApiKeyScope,
  type HubApiKeySummary,
  type CreatedHubApiKey,
  type CreateHubApiKeyInput,
} from '../../shared/api-keys.js';

export const hubApiKeyServiceToken: ServiceToken<HubApiKeyService> =
  createServiceToken<HubApiKeyService>('@nocobase/app-plugin-hub/api-keys');

export class HubApiKeyService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: AppAuthorization,
    private readonly apiKeys: ApiKeyService,
  ) {}

  private query() {
    return this.database.connection().query;
  }

  private async requireApp(appId: string): Promise<void> {
    const app = await this.query()
      .selectFrom('hubApps')
      .select('id')
      .where('id', '=', appId)
      .executeTakeFirst();
    if (!app)
      throw new HubError('Application not found.', 'APP_NOT_FOUND', 404);
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.query()
      .selectFrom('user')
      .select(['id', 'disabledAt'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user || user.disabledAt != null)
      throw new HubError(
        'The credential owner is unavailable.',
        'INVALID_API_KEY',
        401,
      );
  }

  async requirePermission(
    userId: string,
    appId: string,
    action: string,
  ): Promise<void> {
    await this.requireUser(userId);
    await this.authorization
      .for({
        principal: { type: 'user', id: userId },
        subjects: [{ type: 'authenticated', id: '*' }],
      })
      .require({ resource: { type: 'hub.app', id: appId }, action });
  }

  async list(
    appId: string,
    userId: string,
  ): Promise<readonly HubApiKeySummary[]> {
    await this.requirePermission(userId, appId, 'manage-api-keys');
    await this.requireApp(appId);
    const rows = await this.query()
      .selectFrom('hubAppApiKeys')
      .selectAll()
      .where('appId', '=', appId)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .execute<Row>();
    const summaries = await Promise.all(
      rows.map(async (row) => {
        const key = await this.apiKeys.get(String(row.id));
        if (!key) return null;
        const user = await this.query()
          .selectFrom('user')
          .select('name')
          .where('id', '=', key.referenceId)
          .executeTakeFirst();
        return summary(
          row,
          key,
          typeof user?.name === 'string' ? user.name : key.referenceId,
        );
      }),
    );
    return summaries.filter((key) => key !== null);
  }

  async create(
    appId: string,
    userId: string,
    input: CreateHubApiKeyInput,
  ): Promise<CreatedHubApiKey> {
    await this.requirePermission(userId, appId, 'manage-api-keys');
    await this.requireApp(appId);
    if (
      !input ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.trim().length > 100 ||
      !Array.isArray(input.scopes) ||
      !input.scopes.length ||
      input.scopes.some(
        (scope: unknown) =>
          typeof scope !== 'string' ||
          !(HUB_API_KEY_SCOPES as readonly string[]).includes(scope),
      )
    ) {
      throw new HubError(
        'A name and at least one supported permission are required.',
        'INVALID_API_KEY_INPUT',
        400,
      );
    }
    const scopes: HubApiKeyScope[] = [...new Set<HubApiKeyScope>(input.scopes)];
    const expiresAt =
      input.expiresAt == null ? null : new Date(input.expiresAt);
    if (
      expiresAt &&
      (typeof input.expiresAt !== 'string' ||
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= Date.now() ||
        expiresAt.getTime() - Date.now() > 36500 * 86400000)
    )
      throw new HubError(
        'Expiration must be a valid future date.',
        'INVALID_API_KEY_INPUT',
        400,
      );
    for (const scope of scopes)
      await this.requirePermission(userId, appId, HUB_API_KEY_ACTIONS[scope]);
    return this.database.transaction(async (connection) => {
      const { key, secret } = await this.apiKeys
        .withConnection(connection)
        .create({
          userId,
          name: input.name.trim(),
          expiresIn: expiresAt
            ? (expiresAt.getTime() - Date.now()) / 1000
            : null,
        });
      const row = {
        id: key.id,
        appId,
        scopes: JSON.stringify(scopes),
        createdAt: new Date(),
        disabledAt: null,
        lastUsedAt: null,
      };
      await connection.query.insertInto('hubAppApiKeys').values(row).execute();
      const user = await connection.query
        .selectFrom('user')
        .select('name')
        .where('id', '=', userId)
        .executeTakeFirst();
      return {
        key: summary(
          row,
          key,
          typeof user?.name === 'string' ? user.name : userId,
        ),
        secret,
      };
    });
  }

  async disable(appId: string, keyId: string, userId: string): Promise<void> {
    await this.requirePermission(userId, appId, 'manage-api-keys');
    await this.requireKey(appId, keyId);
    await this.database.transaction(async (connection) => {
      await this.apiKeys.withConnection(connection).disable(keyId);
      await connection.query
        .updateTable('hubAppApiKeys')
        .set({ disabledAt: new Date() })
        .where('id', '=', keyId)
        .where('appId', '=', appId)
        .where('disabledAt', 'is', null)
        .execute();
    });
  }

  async remove(appId: string, keyId: string, userId: string): Promise<void> {
    await this.requirePermission(userId, appId, 'manage-api-keys');
    await this.requireApp(appId);
    const row = await this.query()
      .selectFrom('hubAppApiKeys')
      .select('id')
      .where('appId', '=', appId)
      .where('id', '=', keyId)
      .executeTakeFirst();
    if (!row) return;
    await this.apiKeys.remove(keyId);
    await this.query()
      .deleteFrom('hubAppApiKeys')
      .where('id', '=', keyId)
      .where('appId', '=', appId)
      .execute();
  }

  /** Called by App removal after its own remove permission check. */
  async removeAppKeys(appId: string): Promise<void> {
    const rows = await this.query()
      .selectFrom('hubAppApiKeys')
      .select('id')
      .where('appId', '=', appId)
      .execute();
    for (const row of rows) await this.apiKeys.remove(String(row.id));
  }

  private async requireKey(appId: string, keyId: string): Promise<void> {
    await this.requireApp(appId);
    const key = await this.query()
      .selectFrom('hubAppApiKeys')
      .select('id')
      .where('id', '=', keyId)
      .where('appId', '=', appId)
      .executeTakeFirst();
    if (!key)
      throw new HubError('API key not found.', 'API_KEY_NOT_FOUND', 404);
  }

  async verify(
    secret: string,
    appId: string,
    scope: HubApiKeyScope,
  ): Promise<{ readonly id: string; readonly createdBy: string }> {
    const key = await this.apiKeys.verify(secret);
    if (!key)
      throw new HubError(
        'API key is invalid, disabled, or expired.',
        'INVALID_API_KEY',
        401,
      );
    const row = await this.query()
      .selectFrom('hubAppApiKeys')
      .selectAll()
      .where('id', '=', key.id)
      .executeTakeFirst<Row>();
    if (!row || row.disabledAt != null)
      throw new HubError('Invalid publishing key.', 'INVALID_API_KEY', 401);
    if (row.appId !== appId || !parseScopes(row.scopes).includes(scope))
      throw new HubError(
        'API key does not allow this application or operation.',
        'API_KEY_FORBIDDEN',
        403,
      );
    await this.requireApp(appId);
    await this.requirePermission(
      key.referenceId,
      appId,
      HUB_API_KEY_ACTIONS[scope],
    );
    await this.query()
      .updateTable('hubAppApiKeys')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', row.id)
      .execute();
    return { id: String(row.id), createdBy: key.referenceId };
  }
}
function date(value: unknown): Date | null {
  return value == null
    ? null
    : value instanceof Date
      ? value
      : new Date(
          typeof value === 'number' || typeof value === 'string'
            ? value
            : Number.NaN,
        );
}
function parseScopes(value: unknown): HubApiKeyScope[] {
  return (
    typeof value === 'string' ? JSON.parse(value) : value
  ) as HubApiKeyScope[];
}
function summary(
  row: Row,
  key: ServerApiKeySummary,
  creatorName: string,
): HubApiKeySummary {
  const expiresAt = date(key.expiresAt);
  return {
    id: String(row.id),
    appId: String(row.appId),
    name: key.name ?? '',
    prefix: key.start ?? key.prefix ?? '',
    scopes: parseScopes(row.scopes),
    status:
      !key.enabled || row.disabledAt != null
        ? 'disabled'
        : expiresAt && expiresAt.getTime() <= Date.now()
          ? 'expired'
          : 'active',
    createdBy: key.referenceId,
    creatorName,
    createdAt: date(row.createdAt)!.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
    lastUsedAt: date(row.lastUsedAt)?.toISOString() ?? null,
  };
}
