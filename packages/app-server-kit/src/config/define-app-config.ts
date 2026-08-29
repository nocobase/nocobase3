import { Type, type TSchema } from '@sinclair/typebox';
import { envString } from '@nocobase/config/providers/env';

import type {
  AppConfigDefinition,
  AppConfigDefinitionOptions,
  AppConfigSchemaValue,
  DefineTypedAppConfig,
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
  TValue = AppConfigSchemaValue<TSchemaType>,
>(
  definition: AppConfigDefinitionOptions<TSchemaType, TContext>,
): AppConfigDefinition<TValue, TContext, TSchemaType>;
export function defineAppConfig<TValue>(): DefineTypedAppConfig<TValue>;
export function defineAppConfig(
  definition?: AppConfigDefinitionOptions<TSchema, unknown>,
):
  | AppConfigDefinition<unknown, unknown, TSchema>
  | DefineTypedAppConfig<unknown> {
  if (definition) return Object.freeze({ ...definition });
  return <TSchemaType extends TSchema, TContext>(
    typedDefinition: AppConfigDefinitionOptions<TSchemaType, TContext>,
  ): AppConfigDefinition<unknown, TContext, TSchemaType> =>
    Object.freeze({ ...typedDefinition });
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
> = defineAppConfig<AppIdentityConfig>()({
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
