/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { AppRuntimeRegistry } from '../dist/app-registry.js';

const registries: AppRuntimeRegistry[] = [];

afterEach(async () => {
  await Promise.all(
    registries.splice(0).map((registry) => registry.destroyAll('test cleanup')),
  );
});

function createRegistry(events: string[]): AppRuntimeRegistry {
  const registry = new AppRuntimeRegistry({
    startEvictionLoop: false,
    resolveFactory: (definition) => async (scope) => {
      const version = definition.desiredVersion;
      events.push(`start:${version}`);
      if (version === 'broken') {
        throw new Error('replacement failed');
      }
      scope.registerDisposer('test runtime', () => {
        events.push(`stop:${version}`);
      });
      return { fetch: () => new Response(version) };
    },
  });
  registries.push(registry);
  return registry;
}

describe('AppRuntimeRegistry runtime replacement', () => {
  it('stops the current runtime before activating its replacement', async () => {
    const events: string[] = [];
    const registry = createRegistry(events);
    await registry.create('customer', { desiredVersion: '1.0.0' });

    await registry.replaceDefinition({
      ...registry.requireDefinition('customer'),
      desiredVersion: '2.0.0',
    });

    expect(events).toEqual(['start:1.0.0', 'stop:1.0.0', 'start:2.0.0']);
    expect(registry.requireSnapshot('customer').desiredVersion).toBe('2.0.0');
  });

  it('restores the previous runtime when replacement activation fails', async () => {
    const events: string[] = [];
    const registry = createRegistry(events);
    await registry.create('customer', { desiredVersion: '1.0.0' });

    await expect(
      registry.replaceDefinition({
        ...registry.requireDefinition('customer'),
        desiredVersion: 'broken',
      }),
    ).rejects.toThrow('App "customer" failed to reload');

    expect(events).toEqual([
      'start:1.0.0',
      'stop:1.0.0',
      'start:broken',
      'start:1.0.0',
    ]);
    expect(registry.requireDefinition('customer').desiredVersion).toBe('1.0.0');
    expect(registry.requireSnapshot('customer').desiredVersion).toBe('1.0.0');
  });

  it('preserves both errors when replacement and restoration fail', async () => {
    const events: string[] = [];
    let oldVersionStarts = 0;
    const registry = new AppRuntimeRegistry({
      startEvictionLoop: false,
      resolveFactory: (definition) => async (scope) => {
        const version = definition.desiredVersion;
        events.push(`start:${version}`);
        if (
          version === 'broken' ||
          (version === '1.0.0' && oldVersionStarts++ > 0)
        ) {
          throw new Error(`${version} failed`);
        }
        scope.registerDisposer('test runtime', () => {
          events.push(`stop:${version}`);
        });
        return { fetch: () => new Response(version) };
      },
    });
    registries.push(registry);
    await registry.create('customer', { desiredVersion: '1.0.0' });

    let failure: unknown;
    try {
      await registry.replaceDefinition({
        ...registry.requireDefinition('customer'),
        desiredVersion: 'broken',
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      message: 'App "customer" failed to reload',
      cause: {
        message:
          'App "customer" failed to activate the replacement and restore the previous runtime',
        errors: [
          { message: 'App "customer" failed to initialize' },
          { message: 'App "customer" failed to initialize' },
        ],
      },
    });
    expect(events).toEqual([
      'start:1.0.0',
      'stop:1.0.0',
      'start:broken',
      'start:1.0.0',
    ]);
    expect(registry.isActive('customer')).toBe(false);
    expect(registry.requireDefinition('customer').desiredVersion).toBe('1.0.0');
  });
});
