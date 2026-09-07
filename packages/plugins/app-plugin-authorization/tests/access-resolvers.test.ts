import { describe, expect, it } from 'vitest';
import { ClientAccessResolvers } from '../client/access-resolvers.js';

describe('App-local access resolver extensions', () => {
  it('gives each registration a distinct lease even when reusing a callback', async () => {
    const registry = new ClientAccessResolvers();
    const resolver = async (): Promise<{ can: boolean }> => ({ can: false });
    const old = registry.register('audit.events', resolver);
    old();
    const current = registry.register('audit.events', resolver);
    old();
    expect(await registry.resolve('audit.events', 'read')).toEqual({
      can: false,
    });
    current();
    expect(await registry.resolve('audit.events', 'read')).toBeUndefined();
  });
  it('keeps matched denial and exceptions closed, detects duplicates and disposes precisely', async () => {
    const registry = new ClientAccessResolvers();
    let permitted = true;
    const dispose = registry.register('synthetic', async () => ({
      can: permitted,
    }));
    expect(await registry.resolve('synthetic', 'read')).toEqual({ can: true });
    permitted = false;
    expect(await registry.resolve('synthetic', 'read')).toEqual({ can: false });
    expect(() =>
      registry.register('synthetic', async () => ({ can: true })),
    ).toThrow();
    registry.register('failed', async () => {
      throw new Error('offline');
    });
    expect(await registry.resolve('failed', 'read')).toEqual({ can: false });
    expect(
      await new ClientAccessResolvers().resolve('synthetic', 'read'),
    ).toBeUndefined();
    dispose();
    registry.register('synthetic', async () => ({ can: true }));
    dispose();
    expect(await registry.resolve('synthetic', 'read')).toEqual({ can: true });
  });
});
