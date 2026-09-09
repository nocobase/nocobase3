import {
  defineAppConfigVariant,
  type AppConfigVariantDefinition,
} from '@nocobase/app-server/config';
import { Type } from '@sinclair/typebox';

export const microsoftMailProviderConfig: AppConfigVariantDefinition =
  defineAppConfigVariant({
    target: 'mail.providers',
    discriminator: 'type',
    value: 'microsoft',
    schema: Type.Object(
      {
        type: Type.Literal('microsoft'),
        enabled: Type.Optional(Type.Boolean()),
        clientId: Type.String({ minLength: 1 }),
        clientSecret: Type.String({ minLength: 1 }),
        tenant: Type.Optional(Type.String({ minLength: 1 })),
        scopes: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
        authorityBaseUrl: Type.Optional(Type.String({ format: 'uri' })),
        graphBaseUrl: Type.Optional(Type.String({ format: 'uri' })),
      },
      { additionalProperties: false },
    ),
  });
