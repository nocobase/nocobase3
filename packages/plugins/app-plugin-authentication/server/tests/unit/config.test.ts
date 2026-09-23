// @vitest-environment node

import {
  ApplicationNotConfiguredError,
  PLACEHOLDER_SECRET,
} from '@nocobase/app-server/config';
import { describe, expect, it } from 'vitest';
import { resolveAuthSecret } from '../../config.js';

describe('resolveAuthSecret', () => {
  it('returns a configured secret', () => {
    expect(resolveAuthSecret('a-real-secret')).toBe('a-real-secret');
  });

  /**
   * `config.example.yml` declares `auth.secret` as a live key carrying this value, so that `config init` can fill it
   * in by replacing a value. A `config.yml` copied from the example by hand therefore arrives with a secret that is
   * present, non-empty, and identical across every installation — which every other check here would accept.
   */
  it.each([PLACEHOLDER_SECRET, ` ${PLACEHOLDER_SECRET} `])(
    'rejects a placeholder secret: %s',
    (secret) => {
      expect(() => resolveAuthSecret(secret)).toThrow(
        'auth.secret is still set to the placeholder',
      );
    },
  );

  /**
   * An unconfigured application used to be handed a temporary secret so it could boot far enough to serve an
   * installation page. Nothing serves that page now, and a secret regenerated on every boot invalidates every
   * session on restart — so this refuses, and names the command that writes one.
   */
  it.each([undefined, ''])('refuses to invent a secret for %j', (secret) => {
    expect(() => resolveAuthSecret(secret)).toThrow(
      ApplicationNotConfiguredError,
    );
    expect(() => resolveAuthSecret(secret)).toThrow('auth.secret is not set');
    expect(() => resolveAuthSecret(secret)).toThrow('pnpm config:init');
  });
});
