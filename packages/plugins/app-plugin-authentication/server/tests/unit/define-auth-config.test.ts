// @vitest-environment node

import { AppConfig, defaultAppConfigs } from '@nocobase/app-server/config';
import { describe, expect, it } from 'vitest';
import { defineAuthConfig } from '../../config.js';

async function validate(
  overrides: Record<string, unknown>,
  extra?: Parameters<typeof defineAuthConfig>[0]['validate'],
): Promise<{ config: AppConfig; issues: readonly unknown[] }> {
  const config = new AppConfig().load({
    name: 'test',
    read: async () => ({ kind: 'map', value: { auth: overrides } }),
  });
  await config.loadAll();
  const defaults = defaultAppConfigs({
    auth: defineAuthConfig({
      defaults: { emailAndPassword: { enabled: true, autoSignIn: false } },
      ...(extra ? { validate: extra } : {}),
    }),
  });
  config.mergeDefaults(defaults({} as never));
  config.defineSections(defaults.sections!);
  return { config, issues: await config.validate() };
}

describe('defineAuthConfig', () => {
  it('publishes whether password sign-up is open, and nothing else', async () => {
    const { config, issues } = await validate({
      secret: 'a-real-secret',
      emailAndPassword: { disableSignUp: true },
    });

    expect(issues).toEqual([]);
    expect(config.publicValues()).toEqual({
      auth: { emailAndPassword: { enabled: true, disableSignUp: true } },
    });
  });

  it('rejects a sign-up switch that is not a boolean', async () => {
    const { issues } = await validate({
      emailAndPassword: { disableSignUp: 'yes' },
    });

    expect(issues).toEqual([
      {
        level: 'error',
        path: 'auth.emailAndPassword.disableSignUp',
        message: 'must be true or false.',
      },
    ]);
  });

  it('warns about a sign-up switch that password authentication being off overrides', async () => {
    const { issues } = await validate({
      emailAndPassword: { enabled: false, disableSignUp: false },
    });

    expect(issues).toEqual([
      {
        level: 'warning',
        path: 'auth.emailAndPassword.disableSignUp',
        message: 'has no effect while emailAndPassword.enabled is false.',
      },
    ]);
  });

  it('runs an application validator after its own', async () => {
    const { issues } = await validate({}, (_auth, context) => {
      context.error('trustedOrigins', 'must list the portal origin.');
    });

    expect(issues).toEqual([
      {
        level: 'error',
        path: 'auth.trustedOrigins',
        message: 'must list the portal origin.',
      },
    ]);
  });
});
