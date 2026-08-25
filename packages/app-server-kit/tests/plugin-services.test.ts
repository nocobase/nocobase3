import { describe, expect, it } from 'vitest';

import {
  createAppPluginServiceRegistry,
  createAppPluginServiceToken,
} from '../src/plugins/index.js';

describe('app plugin service registry', () => {
  it('provides and resolves a typed plugin service', () => {
    const registry = createAppPluginServiceRegistry();
    const token = createAppPluginServiceToken<{ readonly value: string }>(
      'example',
    );
    const service = { value: 'available' };

    registry.provide(token, service);

    expect(registry.get(token)).toBe(service);
    expect(registry.require(token)).toBe(service);
  });

  it('rejects duplicate providers and missing required services', () => {
    const registry = createAppPluginServiceRegistry();
    const token = createAppPluginServiceToken<object>('example');
    registry.provide(token, {});

    expect(() => registry.provide(token, {})).toThrow(
      'App plugin service "example" is already provided.',
    );
    expect(() =>
      registry.require(createAppPluginServiceToken('missing')),
    ).toThrow('App plugin service "missing" is not available.');
  });

  it('notifies consumers regardless of registration order', () => {
    const token = createAppPluginServiceToken<{ readonly value: string }>(
      'example',
    );
    const before = createAppPluginServiceRegistry();
    const after = createAppPluginServiceRegistry();
    const beforeValues: string[] = [];
    const afterValues: string[] = [];

    before.onAvailable(token, (service) => beforeValues.push(service.value));
    before.provide(token, { value: 'before' });
    after.provide(token, { value: 'after' });
    after.onAvailable(token, (service) => afterValues.push(service.value));

    expect(beforeValues).toEqual(['before']);
    expect(afterValues).toEqual(['after']);
  });
});
