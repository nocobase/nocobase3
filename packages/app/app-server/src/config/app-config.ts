import { existsSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { Config, type ConfigMap } from '@nocobase/config';
import { jsonParser } from '@nocobase/config/parsers/json';
import { tomlParser } from '@nocobase/config/parsers/toml';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import type { Logger } from '@nocobase/logging';
import { fileProvider } from '@nocobase/config/providers/file';

import type {
  AppConfigChangeListener,
  AppConfigFileOptions,
  AppConfigReloadResult,
  AppConfigSource,
} from './app-config-types.js';
import type { ConfigPaths } from './types.js';

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
  private logger?: Pick<Logger, 'debug'>;
  private loadDurationMs?: number;

  /** Attach diagnostics after the logging configuration has been resolved. */
  public setLogger(logger: Pick<Logger, 'debug'>): void {
    this.logger = logger;
    if (this.loadDurationMs !== undefined) {
      logger.debug(
        { durationMs: this.loadDurationMs },
        'App configuration loaded',
      );
      this.loadDurationMs = undefined;
    }
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
    this.loadDurationMs = Date.now() - startedAt;
    if (this.logger) this.setLogger(this.logger);
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
        this.logger?.debug(
          {
            changedNamespaces: result.changedNamespaces,
            durationMs: Date.now() - startedAt,
          },
          'App configuration reloaded',
        );
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

/**
 * Locate the application config file when no path was configured explicitly.
 *
 * A source checkout keeps `config.yml` at the application root. A built application runs with its root pointing at
 * `dist/`, while `pnpm build --tar` packs `config.example.yml` next to `dist/` rather than inside it, so a deployment
 * writes its `config.yml` there. The root is searched first so a file inside `dist/` keeps working, then the parent of
 * a `dist/` root. When no file exists anywhere the in-root candidate is returned, which keeps the install flow writing
 * to the location it has always used.
 *
 * The returned path carries no extension unless a file was found; `AppConfig.loadFile` completes it.
 */
export function resolveDefaultAppConfigFile(
  paths: Pick<ConfigPaths, 'root'>,
): string {
  const rootDir = paths.root();
  const candidates = [path.join(rootDir, 'config')];
  if (path.basename(rootDir) === 'dist') {
    candidates.push(path.join(path.dirname(rootDir), 'config'));
  }

  for (const candidate of candidates) {
    const resolved = resolveConfigFilePath(candidate);
    if (existsSync(resolved)) return resolved;
  }

  return candidates[0];
}
