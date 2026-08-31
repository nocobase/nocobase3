import type { ConfigMap } from '@nocobase/config';
import type {
  ConfigLoadOptions,
  ConfigParser,
  ConfigProvider,
} from '@nocobase/config';
import type {
  Environment,
  EnvironmentMapping,
} from '@nocobase/config/providers/env';
import type { FileProviderOptions } from '@nocobase/config/providers/file';
import type { Static, TSchema } from '@sinclair/typebox';

export type AppConfigLayerFactory<TContext> = (
  context: TContext,
) => object | Promise<object>;

export interface AppConfigDefinitionOptions<
  TSchemaType extends TSchema,
  TContext,
> {
  readonly namespace: string;
  readonly schema: TSchemaType;
  readonly defaults?: object | AppConfigLayerFactory<TContext>;
  readonly envMappings?: Readonly<Record<string, EnvironmentMapping>>;
}

export interface AppConfigVariantDefinitionOptions<
  TSchemaType extends TSchema,
> {
  readonly target: string;
  readonly discriminator: string;
  readonly value: string;
  readonly schema: TSchemaType;
}

export interface AppConfigDefinition<
  TValue = unknown,
  TContext = unknown,
  TSchemaType extends TSchema = TSchema,
> {
  readonly kind: 'config';
  readonly namespace: string;
  readonly schema: TSchemaType;
  readonly defaults?: object | AppConfigLayerFactory<TContext>;
  readonly envMappings?: Readonly<Record<string, EnvironmentMapping>>;
  readonly __value?: TValue;
  readonly __input?: Static<TSchemaType>;
}

export interface AppConfigVariantDefinition<
  TValue = unknown,
  TSchemaType extends TSchema = TSchema,
> {
  readonly kind: 'variant';
  readonly target: string;
  readonly discriminator: string;
  readonly value: string;
  readonly schema: TSchemaType;
  readonly __value?: TValue;
  readonly __input?: Static<TSchemaType>;
}

export type AppConfigContribution<TContext = unknown> =
  AppConfigDefinition<unknown, TContext> | AppConfigVariantDefinition;

export type AppConfigSchemaValue<TSchemaType extends TSchema> =
  Static<TSchemaType>;

export interface AppConfigSource {
  readonly provider: ConfigProvider;
  readonly parser?: ConfigParser;
  readonly options?: ConfigLoadOptions;
}

export type AppConfigFileOptions = FileProviderOptions;

export interface AppConfigChange<TValue> {
  readonly previous: TValue;
  readonly current: TValue;
}

export type AppConfigChangeListener<TValue> = (
  change: AppConfigChange<TValue>,
) => void | Promise<void>;

export interface AppConfigReloadResult {
  readonly changedNamespaces: readonly string[];
}

export interface AppConfigToken<TValue> {
  readonly namespace: string;
  readonly __value?: TValue;
}

export interface AppConfigAccessor {
  get<TValue>(definition: AppConfigToken<TValue>): TValue;
  get<TValue = unknown>(key: string): TValue | undefined;
  raw(): ConfigMap;
  reload(): Promise<AppConfigReloadResult>;
  subscribe<TValue>(
    definition: AppConfigToken<TValue>,
    listener: AppConfigChangeListener<TValue>,
  ): () => void;
}

export interface AppConfigOptions<TContext> {
  readonly context?: TContext;
  readonly environment?: Environment;
}
