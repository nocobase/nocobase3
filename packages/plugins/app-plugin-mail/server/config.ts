import {
  defineAppConfig,
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
  defaults: { providers: {} },
  envMappings: {
    MAIL_CREDENTIAL_ENCRYPTION_KEY: envString('credentialEncryptionKey'),
  },
});
