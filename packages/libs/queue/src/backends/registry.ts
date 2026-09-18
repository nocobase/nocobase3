import { createServiceRedisBackend } from './redis.js';
import type { BackendFactory } from 'bullmq';
import { createInMemoryBackendFactory } from './in-memory/index.js';

export interface BackendRegistry {
  register(name: string, factory: BackendFactory): void;
  freeze(): void;
  resolve(name: string): BackendFactory;
}

export function createBackendRegistry(): BackendRegistry {
  const factories = new Map<string, BackendFactory>([
    ['redis', createServiceRedisBackend],
    ['inMemory', createInMemoryBackendFactory()],
  ]);
  let frozen = false;
  return {
    register(name, factory): void {
      if (frozen)
        throw new Error('Backend registration is frozen after setup begins');
      if (typeof name !== 'string' || !name.trim())
        throw new TypeError('Backend name must be nonempty');
      if (typeof factory !== 'function')
        throw new TypeError('Backend factory must be a function');
      if (factories.has(name))
        throw new Error(`Backend ${name} is already registered`);
      factories.set(name, factory);
    },
    freeze(): void {
      frozen = true;
    },
    resolve(name): BackendFactory {
      const factory = factories.get(name);
      if (!factory) throw new Error(`Unknown queue backend: ${name}`);
      return factory;
    },
  };
}
