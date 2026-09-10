import type { ConfigMap } from '@nocobase/config';
import type {
  ConfigLoadOptions,
  ConfigParser,
  ConfigProvider,
} from '@nocobase/config';
import type { FileProviderOptions } from '@nocobase/config/providers/file';

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

export interface AppConfigAccessor {
  mergeDefaults(values: ConfigMap): void;
  get<TValue = unknown>(key: string): TValue | undefined;
  raw(): ConfigMap;
  reload(): Promise<AppConfigReloadResult>;
  subscribe<TValue>(
    namespace: string,
    listener: AppConfigChangeListener<TValue>,
  ): () => void;
}
