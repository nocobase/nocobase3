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

export interface MailConfig {
  readonly credentialEncryptionKey?: string;
  readonly automaticSyncIntervalMs: number;
  readonly pushWebhookUrl?: string;
  readonly pushWebhookSecret?: string;
  readonly providers: Readonly<Record<string, MailProviderConfigEntry>>;
}

export const mailConfig: AppConfigDefinition<MailConfig> = defineAppConfig({
  namespace: 'mail',
  schema: Type.Object(
    {
      credentialEncryptionKey: Type.Optional(
        Type.String({
          minLength: 32,
          description: 'Key used to encrypt OAuth credentials at rest.',
        }),
      ),
      automaticSyncIntervalMs: Type.Integer({ minimum: 60_000 }),
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
  defaults: { automaticSyncIntervalMs: 300_000, providers: {} },
  envMappings: {
    MAIL_CREDENTIAL_ENCRYPTION_KEY: envString('credentialEncryptionKey'),
    MAIL_AUTOMATIC_SYNC_INTERVAL_MS: envInteger('automaticSyncIntervalMs'),
    MAIL_PUSH_WEBHOOK_URL: envString('pushWebhookUrl'),
    MAIL_PUSH_WEBHOOK_SECRET: envString('pushWebhookSecret'),
  },
});
