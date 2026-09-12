import { describe, expect, it } from 'vitest';
import { createAppClientConfig } from '../src/config.js';

describe('client config', () => {
  it('merges code defaults below public runtime overrides', () => {
    const onSuccess = () => undefined;
    const plugin = { id: 'example', getActions: () => ({ signIn: onSuccess }) };
    const config = createAppClientConfig({
      rawConfig: { auth: { baseURL: '/main/api/auth' } },
    });
    config.mergeDefaults({
      auth: {
        plugins: [plugin],
        fetchOptions: { onSuccess },
        baseURL: '/default',
      },
    });
    expect(config.get('auth.fetchOptions.onSuccess')).toBe(onSuccess);
    expect(config.get('auth.plugins')).toEqual([plugin]);
    expect(config.get('auth.baseURL')).toBe('/main/api/auth');
    expect(config.get('missing', 'fallback')).toBe('fallback');
    expect(config.has('auth')).toBe(true);
  });

  it('preserves explicit overrides across default merges', () => {
    const config = createAppClientConfig({
      rawConfig: { feature: { enabled: false, items: ['public'] } },
    });
    config.mergeDefaults({
      feature: { enabled: true, items: ['default'], label: 'first' },
    });
    config.mergeDefaults({ feature: { label: 'second' } });
    expect(config.get('feature')).toEqual({
      enabled: false,
      items: ['public'],
      label: 'second',
    });
  });

  it('returns copies without mutating the resolved snapshot', () => {
    const input = { feature: { enabled: true } };
    const config = createAppClientConfig({ rawConfig: input });
    input.feature.enabled = false;
    const raw = config.raw() as { feature: { enabled: boolean } };
    raw.feature.enabled = false;
    expect(config.get('feature.enabled')).toBe(true);
  });

  it('rejects non-JSON values and unsafe object keys in public configuration', () => {
    expect(() =>
      createAppClientConfig({ rawConfig: { invalid: Infinity } }),
    ).toThrow('JSON-compatible');
    const unsafe = Object.create(null) as Record<string, unknown>;
    unsafe.__proto__ = 'unsafe';
    expect(() => createAppClientConfig({ rawConfig: unsafe })).toThrow(
      'forbidden key',
    );
  });
});
