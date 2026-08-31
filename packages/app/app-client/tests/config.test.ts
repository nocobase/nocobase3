import { describe, expect, it, vi } from 'vitest';

import { createAppClientConfig, defineAppClientConfig } from '../src/config.js';

describe('client config', () => {
  it('merges namespaced defaults before runtime values', async () => {
    const config = await createAppClientConfig({
      configs: [
        defineAppClientConfig({
          namespace: 'map',
          defaults: { defaultZoom: 8, style: 'light' },
        }),
      ],
      rawConfig: { map: { defaultZoom: 12 } },
    });

    expect(config.get('map.defaultZoom')).toBe(12);
    expect(config.get('map.style')).toBe('light');
    expect(config.get('missing', 'fallback')).toBe('fallback');
    expect(config.has('map')).toBe(true);
  });

  it('returns copies and validates the resolved snapshot', async () => {
    const validate = vi.fn();
    const config = await createAppClientConfig({
      configs: [defineAppClientConfig({ namespace: '', validate })],
      rawConfig: { feature: { enabled: true } },
    });
    const raw = config.raw() as { feature: { enabled: boolean } };
    raw.feature.enabled = false;

    expect(validate).toHaveBeenCalledExactlyOnceWith(config);
    expect(config.get('feature.enabled')).toBe(true);
  });

  it('rejects non-JSON values and unsafe object keys', async () => {
    await expect(
      createAppClientConfig({ configs: [], rawConfig: { invalid: Infinity } }),
    ).rejects.toThrow('JSON-compatible');

    const unsafe = Object.create(null) as Record<string, unknown>;
    unsafe.__proto__ = 'unsafe';
    await expect(
      createAppClientConfig({ configs: [], rawConfig: unsafe }),
    ).rejects.toThrow('forbidden key');
  });
});
