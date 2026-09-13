import {
  defineAppConfig,
  envInteger,
  envString,
  type AppConfigDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';

export interface MailProviderConfigEntry {
  readonly type: string;
  readonly enabled?: boolean;
}

export const DEFAULT_MAIL_SYNC_BATCH_SIZE = 100;
export const MAX_MAIL_SYNC_BATCH_SIZE = 200;

export interface MailConfig {
  readonly automaticSyncIntervalMs: number;
  readonly syncBatchSize: number;
  readonly pushWebhookUrl?: string;
  readonly pushWebhookSecret?: string;
  readonly providers: Readonly<Record<string, MailProviderConfigEntry>>;
}

export const mailConfig: AppConfigDefinition<MailConfig> = defineAppConfig({
  namespace: 'mail',
  schema: Type.Object(
    {
      automaticSyncIntervalMs: Type.Integer({ minimum: 60_000 }),
      syncBatchSize: Type.Integer({
        minimum: 1,
        maximum: MAX_MAIL_SYNC_BATCH_SIZE,
        description:
          'Number of messages requested per Provider sync page. Lower values reduce memory usage.',
      }),
      pushWebhookUrl: Type.Optional(
        Type.String({
          format: 'uri',
          description:
            'Public base URL for Mail push callbacks, ending in /mail/webhooks.',
        }),
      ),
      pushWebhookSecret: Type.Optional(
        Type.String({
          minLength: 32,
          maxLength: 128,
          pattern: '^[A-Za-z0-9_-]+$',
          description: 'Shared secret embedded in Mail push callback URLs.',
        }),
      ),
      providers: Type.Record(
        Type.String(),
        Type.Object(
          {
            type: Type.String(),
            enabled: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: true },
        ),
      ),
    },
    { additionalProperties: false },
  ),
  defaults: {
    automaticSyncIntervalMs: 300_000,
    syncBatchSize: DEFAULT_MAIL_SYNC_BATCH_SIZE,
    providers: {},
  },
  envMappings: {
    MAIL_AUTOMATIC_SYNC_INTERVAL_MS: envInteger('automaticSyncIntervalMs'),
    MAIL_SYNC_BATCH_SIZE: envInteger('syncBatchSize'),
    MAIL_PUSH_WEBHOOK_URL: envString('pushWebhookUrl'),
    MAIL_PUSH_WEBHOOK_SECRET: envString('pushWebhookSecret'),
  },
});

export function resolveMailSyncBatchSize(value?: number): number {
  const resolved = value ?? DEFAULT_MAIL_SYNC_BATCH_SIZE;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < 1 ||
    resolved > MAX_MAIL_SYNC_BATCH_SIZE
  ) {
    throw new TypeError(
      `Mail syncBatchSize must be an integer from 1 through ${MAX_MAIL_SYNC_BATCH_SIZE}.`,
    );
  }
  return resolved;
}
