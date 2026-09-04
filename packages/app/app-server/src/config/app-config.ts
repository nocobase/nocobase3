import { existsSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { Config, type ConfigMap, type ConfigProvider } from '@nocobase/config';
import { jsonParser } from '@nocobase/config/parsers/json';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { fileProvider } from '@nocobase/config/providers/file';
import { objectProvider } from '@nocobase/config/providers/object';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import type {
  AppConfigChangeListener,
  AppConfigContribution,
  AppConfigDefinition,
  AppConfigFileOptions,
  AppConfigLayerFactory,
  AppConfigReloadResult,
  AppConfigSource,
  AppConfigToken,
  AppConfigOptions,
  AppConfigVariantDefinition,
} from './app-config-types.js';

interface ConfigState<TContext> {
  readonly config: AppConfigDefinition<unknown, TContext>;
  readonly validate: ValidateFunction;
}

interface VariantState {
  readonly definition: AppConfigVariantDefinition;
  readonly validate: ValidateFunction;
}

interface VariantGroup {
  readonly target: string;
  readonly namespace: string;
  readonly discriminator: string;
  readonly variants: Map<string, VariantState>;
}

export class AppConfig<TContext = unknown> {
  private readonly configs: ConfigState<TContext>[] = [];
  private readonly variantGroups: VariantGroup[] = [];
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
    contributions: readonly AppConfigContribution<TContext>[] = [],
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
    this.ajv.addKeyword({
      keyword: 'uniqueItemProperties',
      type: 'array',
      schemaType: 'array',
      validate: uniqueItemProperties,
      errors: false,
    });
    for (const contribution of contributions) {
      if (contribution.kind === 'variant') continue;
      const config = contribution;
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
    for (const contribution of contributions) {
      if (contribution.kind === 'config') continue;
      this.registerVariant(contribution);
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

  public loadFile(filePath: string, options: AppConfigFileOptions = {}): this {
    const resolvedPath = resolveConfigFilePath(filePath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const parser =
      extension === '.yml' || extension === '.yaml'
        ? yamlParser()
        : extension === '.json'
          ? jsonParser()
          : undefined;
    if (!parser) {
      throw new Error(
        `Unsupported application config file extension "${extension || '(none)'}". Expected .yml, .yaml, or .json.`,
      );
    }
    return this.load(fileProvider(resolvedPath, options), parser);
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
    for (const group of this.variantGroups) {
      if (namespaces && !namespaces.has(group.namespace)) continue;
      this.validateVariantGroup(config, group);
    }
  }

  private registerVariant(definition: AppConfigVariantDefinition): void {
    const { target, namespace } = parseVariantTarget(definition.target);
    if (!this.configs.some(({ config }) => config.namespace === namespace)) {
      throw new Error(
        `Application config variant target namespace "${namespace}" is not registered.`,
      );
    }
    const discriminator = normalizeVariantDiscriminator(
      definition.discriminator,
    );
    let group = this.variantGroups.find((current) => current.target === target);
    if (group && group.discriminator !== discriminator) {
      throw new Error(
        `Application config variants for "${target}" must use discriminator "${group.discriminator}".`,
      );
    }
    if (!group) {
      group = { target, namespace, discriminator, variants: new Map() };
      this.variantGroups.push(group);
    }
    if (group.variants.has(definition.value)) {
      throw new Error(
        `Application config variant "${target}" ${discriminator} "${definition.value}" is registered more than once.`,
      );
    }
    group.variants.set(definition.value, {
      definition,
      validate: this.ajv.compile(definition.schema),
    });
  }

  private validateVariantGroup(config: Config, group: VariantGroup): void {
    const entries = config.get(group.target);
    if (entries === undefined) return;
    if (!isRecord(entries)) {
      throw new Error(
        `Invalid application config: ${group.target}: must be an object`,
      );
    }
    for (const [name, value] of Object.entries(entries)) {
      const entryPath = `${group.target}.${name}`;
      if (!isRecord(value)) {
        throw new Error(
          `Invalid application config: ${entryPath}: must be an object`,
        );
      }
      const discriminatorValue = value[group.discriminator];
      if (typeof discriminatorValue !== 'string') {
        throw new Error(
          `Invalid application config: ${entryPath}.${group.discriminator}: must be a string`,
        );
      }
      const variant = group.variants.get(discriminatorValue);
      if (!variant) {
        throw new Error(
          `Invalid application config: ${entryPath}.${group.discriminator}: no variant is registered for "${discriminatorValue}"`,
        );
      }
      if (!variant.validate(value)) {
        throw validationError(entryPath, variant.validate.errors ?? []);
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

function resolveConfigFilePath(filePath: string): string {
  if (path.extname(filePath)) return filePath;
  const candidates = ['.yml', '.yaml', '.json'].map(
    (extension) => `${filePath}${extension}`,
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function parseVariantTarget(target: string): {
  target: string;
  namespace: string;
} {
  const normalized = target.trim();
  const segments = normalized.split('.');
  if (
    segments.length < 2 ||
    segments.some(
      (segment) => segment.length === 0 || segment !== segment.trim(),
    )
  ) {
    throw new Error(
      'Application config variant target must be a full config path such as "caching.providers".',
    );
  }
  const [namespace] = segments;
  return {
    target: normalized,
    namespace,
  };
}

function normalizeVariantDiscriminator(discriminator: string): string {
  const normalized = discriminator.trim();
  if (!normalized || normalized.includes('.')) {
    throw new Error(
      'Application config variant discriminator must be a property name.',
    );
  }
  return normalized;
}

function uniqueItemProperties(properties: unknown, value: unknown): boolean {
  if (!Array.isArray(properties) || !Array.isArray(value)) return true;
  for (const property of properties) {
    if (typeof property !== 'string') continue;
    const seen = new Set<unknown>();
    for (const item of value) {
      if (!isRecord(item)) continue;
      const propertyValue = item[property];
      if (seen.has(propertyValue)) return false;
      seen.add(propertyValue);
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
