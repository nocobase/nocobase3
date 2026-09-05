import {
  defineAppConfigVariant,
  type AppConfigVariantDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';

export const gmailMailProviderConfig: AppConfigVariantDefinition =
  defineAppConfigVariant({
    target: 'mail.providers',
    discriminator: 'type',
    value: 'gmail',
    schema: Type.Object(
      {
        type: Type.Literal('gmail'),
        enabled: Type.Optional(Type.Boolean()),
        clientId: Type.String({ minLength: 1 }),
        clientSecret: Type.String({ minLength: 1 }),
        scopes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
        authorizationEndpoint: Type.Optional(Type.String({ format: 'uri' })),
        tokenEndpoint: Type.Optional(Type.String({ format: 'uri' })),
        apiBaseUrl: Type.Optional(Type.String({ format: 'uri' })),
      },
      { additionalProperties: false },
    ),
  });
