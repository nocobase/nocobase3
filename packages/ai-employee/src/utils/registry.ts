export interface RegistryOptions {
  override: boolean;
}

export class Registry<T> {
  private map = new Map<string, T>();
  options: RegistryOptions;

  constructor(options: RegistryOptions = { override: false }) {
    this.options = options;
  }

  public register(key: string, value: T): void {
    if (!this.options.override && this.map.has(key)) {
      throw new Error(
        `this registry does not allow to override existing keys: "${key}"`,
      );
    }
    this.map.set(key, value);
  }

  public get(key: string): T | undefined {
    return this.map.get(key);
  }

  public getKeys(): Iterable<string> {
    return this.map.keys();
  }

  public getValues(): Iterable<T> {
    return this.map.values();
  }

  public getEntities(): Iterable<[string, T]> {
    return this.map.entries();
  }
  public delete(key: string): boolean {
    return this.map.delete(key);
  }
}
