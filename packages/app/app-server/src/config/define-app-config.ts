import { Type, type TSchema } from '@sinclair/typebox';
import { envString } from '@nocobase/config/providers/env';

import type {
  AppConfigDefinition,
  AppConfigDefinitionOptions,
  AppConfigVariantDefinition,
  AppConfigVariantDefinitionOptions,
  AppConfigSchemaValue,
} from './app-config-types.js';
import type { ResolvedAppRuntimeConfigContext } from '../runtime/definition.js';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '../support/index.js';

export function defineAppConfig<
  TSchemaType extends TSchema,
  TContext = unknown,
>(
  definition: AppConfigDefinitionOptions<TSchemaType, TContext>,
): AppConfigDefinition<
  AppConfigSchemaValue<TSchemaType>,
  TContext,
  TSchemaType
> {
  return Object.freeze({ kind: 'config', ...definition });
}

export function defineAppConfigVariant<
  TSchemaType extends TSchema,
  TValue = AppConfigSchemaValue<TSchemaType>,
>(
  definition: AppConfigVariantDefinitionOptions<TSchemaType>,
): AppConfigVariantDefinition<TValue, TSchemaType> {
  return Object.freeze({ kind: 'variant', ...definition });
}

export interface AppIdentityConfig {
  readonly name: string;
  readonly publicOrigin?: string;
  readonly publicBasePath: string;
  readonly internalBasePath: string;
  readonly publicApiUrl: string;
}

export const appConfig: AppConfigDefinition<
  AppIdentityConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'app',
  schema: Type.Object(
    {
      name: Type.String(),
      publicOrigin: Type.Optional(Type.String({ format: 'uri' })),
      publicBasePath: Type.String(),
      internalBasePath: Type.String(),
      publicApiUrl: Type.String(),
    },
    { additionalProperties: false },
  ),
  defaults: ({ routing }: ResolvedAppRuntimeConfigContext) => {
    const publicBasePath = normalizeBasePath(routing.publicBasePath || '/main');
    return {
      name: routing.name || resolveAppNameFromBasePath(publicBasePath, 'main'),
      publicBasePath,
      internalBasePath: routing.internalBasePath,
      publicApiUrl: joinBasePath(publicBasePath, '/api'),
    };
  },
  envMappings: {
    APP_PUBLIC_ORIGIN: envString('publicOrigin'),
  },
});
