import {
  defineAppConfigVariant,
  type AppConfigVariantDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';
import type { MailProviderConfig } from '@nocobase/app-plugin-mail/server/types';

export interface ImapSmtpEndpointConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly rejectUnauthorized?: boolean;
}

export interface ImapSmtpMailProviderConfig extends MailProviderConfig {
  readonly type: 'imap-smtp';
  readonly enabled?: boolean;
  readonly imap: ImapSmtpEndpointConfig;
  readonly smtp: ImapSmtpEndpointConfig;
  readonly sentFolder?: string;
  readonly trashFolder?: string;
  readonly draftsFolder?: string;
}

export const imapSmtpMailProviderConfig: AppConfigVariantDefinition =
  defineAppConfigVariant({
    target: 'mail.providers',
    discriminator: 'type',
    value: 'imap-smtp',
    schema: Type.Object(
      {
        type: Type.Literal('imap-smtp'),
        enabled: Type.Optional(Type.Boolean()),
        imap: endpointSchema(),
        smtp: endpointSchema(),
        sentFolder: Type.Optional(Type.String({ minLength: 1 })),
        trashFolder: Type.Optional(Type.String({ minLength: 1 })),
        draftsFolder: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  });

function endpointSchema() {
  return Type.Object(
    {
      host: Type.String({ minLength: 1 }),
      port: Type.Integer({ minimum: 1, maximum: 65_535 }),
      secure: Type.Boolean(),
      rejectUnauthorized: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  );
}
