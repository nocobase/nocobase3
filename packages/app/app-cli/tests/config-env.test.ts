import { describe, expect, it } from 'vitest';

import {
  AppConfig,
  defaultAppConfigs,
  defineAppConfig,
  envInteger,
  envString,
} from '@nocobase/app-server/config';

import type { AppCommandRuntime } from '../src/context.js';
import { runConfigEnv } from '../src/lib/config-env.js';

async function createRuntime(env: Record<string, string>): Promise<{
  readonly runtime: AppCommandRuntime;
  readonly destroyed: () => boolean;
}> {
  const config = new AppConfig();
  await config.loadAll();
  const sections = defaultAppConfigs({
    server: defineAppConfig({
      defaults: { port: 13000 },
      env: { APP_SERVER_PORT: envInteger('port') },
    }),
    auth: defineAppConfig({
      defaults: {},
      env: { AUTH_SECRET: envString('secret') },
    }),
  });
  config.mergeDefaults(sections({} as never));
  config.defineSections(sections.sections!);
  let destroyed = false;
  const runtime = {
    config,
    env,
    scope: {
      destroy: async () => {
        destroyed = true;
      },
    },
  } as unknown as AppCommandRuntime;
  return { runtime, destroyed: () => destroyed };
}

describe('runConfigEnv', () => {
  it('lists declared and runtime-read variables, whether each is set, and never a value', async () => {
    const { runtime, destroyed } = await createRuntime({
      AUTH_SECRET: 'a-real-secret',
      APP_BASE_PATH: '/hub',
      APP_SERVER_PORT: '',
    });

    const { variables } = await runConfigEnv({
      loadRuntime: async () => runtime,
    });

    expect(variables.slice(0, 2)).toEqual([
      { name: 'AUTH_SECRET', path: 'auth.secret', set: true },
      { name: 'APP_SERVER_PORT', path: 'server.port', set: false },
    ]);
    expect(variables).toContainEqual(
      expect.objectContaining({ name: 'APP_BASE_PATH', set: true }),
    );
    expect(JSON.stringify(variables)).not.toContain('a-real-secret');
    expect(destroyed()).toBe(true);
  });
});
