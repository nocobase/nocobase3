export type ConfigPrimitive = string | number | boolean | null;

export type ConfigValue = ConfigPrimitive | readonly ConfigValue[] | ConfigMap;

export interface ConfigMap {
  readonly [key: string]: ConfigValue;
}

export interface ConfigOptions {
  readonly delimiter?: string;
  readonly strictMerge?: boolean;
}

export interface ConfigDecoder<T> {
  decode(value: ConfigValue): T;
}

export interface ConfigProviderContext {
  readonly signal: AbortSignal;
}

export interface ConfigProviderMetadata {
  readonly revision?: string;
  readonly etag?: string;
  readonly lastModified?: Date;
}

export type ConfigProviderResult =
  | {
      readonly kind: 'map';
      readonly value: ConfigMap;
      readonly metadata?: ConfigProviderMetadata;
    }
  | {
      readonly kind: 'bytes';
      readonly value: Uint8Array;
      readonly metadata?: ConfigProviderMetadata;
    };

export interface ConfigProvider {
  readonly name: string;
  read(context: ConfigProviderContext): Promise<ConfigProviderResult>;
}

export interface ConfigParser {
  readonly name: string;
  parse(input: Uint8Array): ConfigMap;
  serialize(value: ConfigMap): Uint8Array;
}

export type ConfigWatchEvent =
  | { readonly type: 'changed'; readonly detail?: unknown }
  | { readonly type: 'error'; readonly error: Error };

export type ConfigWatchListener = (
  event: ConfigWatchEvent,
) => void | Promise<void>;

export interface ConfigWatchContext {
  readonly signal: AbortSignal;
}

export interface WatchableConfigProvider extends ConfigProvider {
  watch(
    listener: ConfigWatchListener,
    context: ConfigWatchContext,
  ): Promise<void>;
}

export interface ConfigMergeContext {
  readonly source: ConfigMap;
  readonly destination: ConfigMap;
}

export type ConfigMerge = (
  context: ConfigMergeContext,
) => ConfigMap | Promise<ConfigMap>;

export interface ConfigLoadOptions {
  readonly merge?: ConfigMerge;
  readonly mountAt?: string;
}
