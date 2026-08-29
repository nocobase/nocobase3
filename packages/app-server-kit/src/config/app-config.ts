import { isDeepStrictEqual } from 'node:util';

import { Config, type ConfigMap, type ConfigProvider } from '@nocobase/config';
import { objectProvider } from '@nocobase/config/providers/object';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import type {
  AppConfigChangeListener,
  AppConfigDefinition,
  AppConfigLayerFactory,
  AppConfigReloadResult,
  AppConfigSource,
  AppConfigToken,
  AppConfigOptions,
} from './app-config-types.js';

interface ConfigState<TContext> {
  readonly config: AppConfigDefinition<unknown, TContext>;
  readonly validate: ValidateFunction;
}

export class AppConfig<TContext = unknown> {
  private readonly configs: ConfigState<TContext>[] = [];
  private readonly sources: AppConfigSource[] = [];
  private readonly ajv: Ajv;
  private readonly context: TContext | undefined;
  private readonly environment:
    import('@nocobase/config/providers/env').Environment | undefined;
  private readonly listeners = new Map<
    string,
    Set<AppConfigChangeListener<unknown>>
  >();
  private readonly environmentProvider: ConfigProvider;
  private defaultsProvider: ConfigProvider | undefined;
  private current: Config | undefined;
  private reloadPromise: Promise<AppConfigReloadResult> | undefined;

  public constructor(
    configs: readonly AppConfigDefinition<unknown, TContext>[] = [],
    options: AppConfigOptions<TContext> = {},
  ) {
    this.context = options.context;
    this.environment = options.environment;
    this.ajv = new Ajv({
      allErrors: true,
      coerceTypes: false,
      formats: {
        uri: {
          type: 'string',
          validate: isUri,
        },
      },
      removeAdditional: false,
      // Accept schemas from third-party packages that may use custom keywords.
      strictSchema: false,
      useDefaults: false,
    });
    for (const config of configs) {
      if (
        this.configs.some(
          ({ config: current }) => current.namespace === config.namespace,
        )
      ) {
        throw new Error(
          `Application config namespace "${config.namespace}" is registered more than once.`,
        );
      }
      this.configs.push({ config, validate: this.ajv.compile(config.schema) });
    }
    this.environmentProvider = this.createEnvironmentProvider();
  }

  public load(
    provider: AppConfigSource['provider'],
    parser?: AppConfigSource['parser'],
    options?: AppConfigSource['options'],
  ): this {
    if (this.current) {
      throw new Error('Config sources cannot be added after loading.');
    }
    this.sources.push({ provider, parser, options });
    return this;
  }

  public async loadAll(): Promise<void> {
    const next = await this.loadConfig();
    this.validate(next);
    this.current = next;
  }

  public get<TValue>(definition: AppConfigToken<TValue>): TValue;
  public get<TValue = unknown>(key: string): TValue | undefined;
  public get<TValue>(
    definitionOrKey: AppConfigToken<TValue> | string,
  ): TValue | undefined {
    const current = this.requireCurrent();
    if (typeof definitionOrKey === 'string') {
      return current.get(definitionOrKey) as TValue | undefined;
    }
    const definition = definitionOrKey;
    if (
      !this.configs.some(
        ({ config }) => config.namespace === definition.namespace,
      )
    ) {
      throw new Error(
        `Application config namespace "${definition.namespace}" is not registered.`,
      );
    }
    return current.get(definition.namespace) as TValue;
  }

  public raw(): ConfigMap {
    return this.requireCurrent().raw();
  }

  public subscribe<TValue>(
    definition: AppConfigToken<TValue>,
    listener: AppConfigChangeListener<TValue>,
  ): () => void {
    const listeners = this.listeners.get(definition.namespace) ?? new Set();
    listeners.add(listener as AppConfigChangeListener<unknown>);
    this.listeners.set(definition.namespace, listeners);
    return (): void => {
      listeners.delete(listener as AppConfigChangeListener<unknown>);
    };
  }

  public reload(): Promise<AppConfigReloadResult> {
    this.reloadPromise ??= this.performReload().finally(() => {
      this.reloadPromise = undefined;
    });
    return this.reloadPromise;
  }

  private async performReload(): Promise<AppConfigReloadResult> {
    const previous = this.requireCurrent();
    const next = await this.loadConfig();
    const namespaces = new Set([...previous.mapKeys(''), ...next.mapKeys('')]);
    const changedNamespaces = [...namespaces]
      .filter(
        (namespace) =>
          !isDeepStrictEqual(previous.get(namespace), next.get(namespace)),
      )
      .sort();
    if (changedNamespaces.length === 0) {
      return { changedNamespaces };
    }

    this.validate(next, new Set(changedNamespaces));
    this.current = next;

    for (const namespace of changedNamespaces) {
      const listeners = this.listeners.get(namespace);
      if (!listeners) continue;
      for (const listener of listeners) {
        await listener({
          previous: previous.get(namespace),
          current: next.get(namespace),
        });
      }
    }

    return { changedNamespaces };
  }

  private async loadConfig(): Promise<Config> {
    this.defaultsProvider ??= await this.createDefaultsProvider();
    const config = new Config();
    await config.load(this.defaultsProvider);
    for (const source of this.sources) {
      await config.load(source.provider, source.parser, source.options);
    }
    await config.load(this.environmentProvider);
    return config;
  }

  private async createDefaultsProvider(): Promise<ConfigProvider> {
    const defaults: Record<string, object> = {};
    for (const { config } of this.configs) {
      const value =
        typeof config.defaults === 'function'
          ? await (config.defaults as AppConfigLayerFactory<TContext>)(
              this.context as TContext,
            )
          : config.defaults;
      if (value !== undefined) {
        defaults[config.namespace] = value;
      }
    }
    return objectProvider(defaults as ConfigMap, { name: 'app-defaults' });
  }

  private createEnvironmentProvider(): ConfigProvider {
    const config = new Config();
    const environment = this.environment ?? process.env;
    for (const { config: definition } of this.configs) {
      for (const [name, mapping] of Object.entries(
        definition.envMappings ?? {},
      )) {
        const value = environment[name];
        if (value === undefined) continue;
        config.set(
          `${definition.namespace}.${mapping.path}`,
          mapping.parse ? mapping.parse(value) : value,
        );
      }
    }
    return objectProvider(config.raw(), { name: 'app-environment' });
  }

  private validate(config: Config, namespaces?: ReadonlySet<string>): void {
    for (const { config: definition, validate } of this.configs) {
      if (namespaces && !namespaces.has(definition.namespace)) continue;
      const value = config.get(definition.namespace);
      if (!validate(value)) {
        throw validationError(definition.namespace, validate.errors ?? []);
      }
    }
  }

  private requireCurrent(): Config {
    if (!this.current) {
      throw new Error('Application config has not been initialized.');
    }
    return this.current;
  }
}

function isUri(value: string): boolean {
  return URL.canParse(value);
}

function validationError(
  namespace: string,
  errors: readonly ErrorObject[],
): Error {
  const details = errors
    .map(
      (error) =>
        `${namespace}${error.instancePath.replaceAll('/', '.')}: ${error.message ?? 'is invalid'}`,
    )
    .join('; ');
  return new Error(`Invalid application config: ${details}`);
}
