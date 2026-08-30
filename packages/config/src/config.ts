import { ConfigView } from './config-view.js';
import { loadConfigProvider } from './load-provider.js';
import { mergeConfigMaps } from './merge.js';
import {
  deleteConfigValue,
  getConfigValue,
  setConfigValue,
  splitConfigPath,
} from './path.js';
import type {
  ConfigLoadOptions,
  ConfigMap,
  ConfigOptions,
  ConfigParser,
  ConfigProvider,
  ConfigValue,
} from './types.js';
import {
  assertConfigMap,
  assertConfigValue,
  cloneConfigValue,
  createConfigRecord,
  isConfigMap,
} from './value.js';

export class Config extends ConfigView {
  private mutableRoot: Record<string, ConfigValue>;
  private readonly strictMerge: boolean;

  constructor(options: ConfigOptions = {}, initial: ConfigMap = {}) {
    const delimiter = options.delimiter ?? '.';
    super(initial, delimiter);
    this.mutableRoot = cloneConfigValue(initial);
    this.strictMerge = options.strictMerge ?? false;
  }

  override get(path: string): ConfigValue | undefined {
    const value = getConfigValue(
      this.mutableRoot,
      splitConfigPath(path, this.delimiter),
    );
    return value === undefined ? undefined : cloneConfigValue(value);
  }

  override has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  override keys(): readonly string[] {
    return new ConfigView(this.mutableRoot, this.delimiter).keys();
  }

  override mapKeys(path: string): readonly string[] {
    const value = this.get(path);
    return isConfigMap(value) ? Object.keys(value).sort() : [];
  }

  override raw(): ConfigMap {
    return cloneConfigValue(this.mutableRoot);
  }

  override all(): Readonly<Record<string, ConfigValue>> {
    return new ConfigView(this.mutableRoot, this.delimiter).all();
  }

  async load(
    provider: ConfigProvider,
    parser?: ConfigParser,
    options: ConfigLoadOptions = {},
  ): Promise<void> {
    const controller = new AbortController();
    const loaded = await loadConfigProvider(
      provider,
      parser,
      controller.signal,
    );
    let source = loaded.value;

    if (options.mountAt) {
      const mounted = createConfigRecord();
      setConfigValue(
        mounted,
        splitConfigPath(options.mountAt, this.delimiter),
        source,
      );
      source = mounted;
    }

    if (options.merge) {
      const result = await options.merge({
        source: cloneConfigValue(source),
        destination: this.raw(),
      });
      this.mutableRoot = cloneConfigValue(assertConfigMap(result));
      return;
    }

    this.mutableRoot = mergeConfigMaps(this.mutableRoot, source, {
      delimiter: this.delimiter,
      strict: this.strictMerge,
    });
  }

  merge(config: Config): void {
    this.mutableRoot = mergeConfigMaps(this.mutableRoot, config.raw(), {
      delimiter: this.delimiter,
      strict: this.strictMerge,
    });
  }

  mergeAt(config: Config, path: string): void {
    const mounted = createConfigRecord();
    setConfigValue(
      mounted,
      splitConfigPath(path, this.delimiter),
      config.raw(),
    );
    this.mutableRoot = mergeConfigMaps(this.mutableRoot, mounted, {
      delimiter: this.delimiter,
      strict: this.strictMerge,
    });
  }

  set(path: string, value: ConfigValue): void {
    assertConfigValue(value, path);
    setConfigValue(
      this.mutableRoot,
      splitConfigPath(path, this.delimiter),
      cloneConfigValue(value),
    );
  }

  delete(path: string): void {
    deleteConfigValue(this.mutableRoot, splitConfigPath(path, this.delimiter));
  }

  cut(path: string): Config {
    const value = this.get(path);
    return new Config(
      { delimiter: this.delimiter, strictMerge: this.strictMerge },
      isConfigMap(value) ? value : {},
    );
  }

  copy(): Config {
    return new Config(
      { delimiter: this.delimiter, strictMerge: this.strictMerge },
      this.raw(),
    );
  }

  serialize(parser: ConfigParser): Uint8Array {
    return parser.serialize(this.raw());
  }
}
