import { describe, expect, it } from 'vitest';

import {
  createAppClient,
  createAppClientServiceRegistry,
} from '../src/client.js';

describe('app client services', () => {
  it('registers and resolves app-scoped services', () => {
    const registry = createAppClientServiceRegistry();
    const service = { value: 'settings' };

    registry.register('settings', service);
    registry.register('settings', service);

    expect(registry.has('settings')).toBe(true);
    expect(registry.get('settings')).toBe(service);
    expect(registry.require('settings')).toBe(service);
  });

  it('rejects ambiguous or missing service registrations', () => {
    const registry = createAppClientServiceRegistry();
    registry.register('settings', { value: 1 });

    expect(() => registry.register('settings', { value: 2 })).toThrow(
      'already registered',
    );
    expect(() => registry.require('missing')).toThrow('is not registered');
    expect(() => registry.get(' ')).toThrow('must define a non-empty name');
  });

  it('creates an isolated registry for every app client', () => {
    const first = createAppClient({ fetch: async () => new Response() });
    const second = createAppClient({ fetch: async () => new Response() });

    first.services.register('settings', 'first');

    expect(first.services.get('settings')).toBe('first');
    expect(second.services.has('settings')).toBe(false);
  });
});
