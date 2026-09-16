// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveDevTrustedOrigins } from '../../scripts/dev/trusted-origins.mjs';

describe('development authentication origins', () => {
  it('uses the allocated backend port for both local addresses', () => {
    expect(resolveDevTrustedOrigins(undefined, 13007).split(',')).toEqual([
      'http://localhost:13007',
      'http://127.0.0.1:13007',
    ]);
  });

  it('preserves custom origins and removes empty and duplicate entries', () => {
    expect(
      resolveDevTrustedOrigins(
        ' https://preview.example.com, ,http://localhost:13000,https://preview.example.com ',
        13000,
      ).split(','),
    ).toEqual([
      'https://preview.example.com',
      'http://localhost:13000',
      'http://127.0.0.1:13000',
    ]);
  });
});
