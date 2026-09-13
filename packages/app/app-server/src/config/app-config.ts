import { existsSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { Config, type ConfigMap } from '@nocobase/config';
import { jsonParser } from '@nocobase/config/parsers/json';
import { tomlParser } from '@nocobase/config/parsers/toml';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { fileProvider } from '@nocobase/config/providers/file';

import type {
  AppConfigChangeListener,
  AppConfigFileOptions,
  AppConfigReloadResult,
  AppConfigSource,
} from './app-config-types.js';

export class AppConfig {
  private readonly sources: AppConfigSource[] = [];
  private readonly listeners = new Map<
    string,
    Set<AppConfigChangeListener<unknown>>
  >();
  private current: Config | undefined;
  private defaults = new Config();
  private overrides = new Config();
  private reloadPromise: Promise<AppConfigReloadResult> | undefined;

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
      extension === '.toml'
        ? tomlParser()
        : extension === '.yml' || extension === '.yaml'
          ? yamlParser()
          : extension === '.json'
            ? jsonParser()
            : undefined;
    if (!parser) {
      throw new Error(
        `Unsupported application config file extension "${extension || '(none)'}". Expected .toml, .yml, .yaml, or .json.`,
      );
    }
    return this.load(fileProvider(resolvedPath, options), parser);
  }

  public async loadAll(): Promise<void> {
    const startedAt = Date.now();
    const next = await this.loadConfig();
    this.current = next;
    // Configuration diagnostics must not corrupt machine-readable CLI stdout.
    console.error('App configuration loaded', {
      durationMs: Date.now() - startedAt,
    });
  }

  public get<TValue = unknown>(key: string): TValue | undefined {
    return this.requireCurrent().get(key) as TValue | undefined;
  }

  public mergeDefaults(values: ConfigMap): void {
    this.requireCurrent();
    const defaults = this.defaults.copy();
    defaults.merge(new Config({}, values));
    const next = defaults.copy();
    next.merge(this.overrides);
    this.defaults = defaults;
    this.current = next;
  }

  public raw(): ConfigMap {
    return this.requireCurrent().raw();
  }

  public subscribe<TValue>(
    namespace: string,
    listener: AppConfigChangeListener<TValue>,
  ): () => void {
    const listeners = this.listeners.get(namespace) ?? new Set();
    listeners.add(listener as AppConfigChangeListener<unknown>);
    this.listeners.set(namespace, listeners);
    return (): void => {
      listeners.delete(listener as AppConfigChangeListener<unknown>);
    };
  }

  public reload(): Promise<AppConfigReloadResult> {
    const startedAt = Date.now();
    this.reloadPromise ??= this.performReload()
      .then((result) => {
        console.error('App configuration reloaded', {
          changedNamespaces: result.changedNamespaces,
          durationMs: Date.now() - startedAt,
        });
        return result;
      })
      .finally(() => {
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
    const overrides = new Config();
    for (const source of this.sources) {
      await overrides.load(source.provider, source.parser, source.options);
    }
    const next = this.defaults.copy();
    next.merge(overrides);
    this.overrides = overrides;
    return next;
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
  const candidates = ['.yml', '.yaml', '.toml', '.json'].map(
    (extension) => `${filePath}${extension}`,
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}
