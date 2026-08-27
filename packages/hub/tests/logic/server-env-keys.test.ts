// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { serverEnvKeys } from '../../scripts/server-env-keys.mjs';

describe('Hub server build environment', () => {
  it('never packages runtime credentials into dist/.env', () => {
    expect(serverEnvKeys.has('HUB_DEPLOY_TOKEN')).toBe(false);
    expect(serverEnvKeys.has('APP_HOST_CONTROL_TOKEN')).toBe(false);
    expect(serverEnvKeys.has('HUB_RELEASE_AUDIT_TOKEN')).toBe(false);
    expect(serverEnvKeys.has('HUB_SETTINGS_ENCRYPTION_KEY')).toBe(false);
    expect(serverEnvKeys.has('AUTH_SECRET')).toBe(false);
  });
});
