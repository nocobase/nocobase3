import type { KeyvStoreAdapter, StoredData } from 'keyv';

export class NullKeyvStore implements KeyvStoreAdapter {
  opts = {};
  namespace?: string;

  async get<Value>(_key: string): Promise<StoredData<Value> | undefined> {
    return undefined;
  }

  async getMany<Value>(keys: string[]): Promise<Array<StoredData<Value> | undefined>> {
    return keys.map(() => undefined);
  }

  async set(_key: string, _value: unknown, _ttl?: number): Promise<void> {
    return undefined;
  }

  async setMany(_values: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    return undefined;
  }

  async delete(_key: string): Promise<boolean> {
    return true;
  }

  async deleteMany(_keys: string[]): Promise<boolean> {
    return true;
  }

  async clear(): Promise<void> {
    return undefined;
  }

  async has(_key: string): Promise<boolean> {
    return false;
  }

  async disconnect(): Promise<void> {
    return undefined;
  }

  on(_event: string, _listener: (...arguments_: unknown[]) => void): this {
    return this;
  }
}
