import { defineConfig, type ConfigEnv, type ConfigFactory } from '@nocobase/app-server/config';
import type { AppServerConfig } from './types.js';

const serverConfig: ConfigFactory<AppServerConfig> = defineConfig(({ env }): AppServerConfig => ({
  host: env.string('APP_SERVER_HOST', '127.0.0.1'),
  port: env.number('APP_SERVER_PORT', 13000),
  startLog: env.boolean('APP_SERVER_START_LOG', true),
  viteDevUrl: resolveViteDevUrl(env),
}));

export default serverConfig;

function resolveViteDevUrl(env: ConfigEnv): URL | undefined {
  if (env.string('NODE_ENV') === 'production') {
    return undefined;
  }

  const explicit = env.string('APP_VITE_DEV_URL');
  if (explicit) {
    const normalized = explicit.trim();
    if (!normalized || normalized === 'false' || normalized === '0') {
      return undefined;
    }

    return new URL(normalized);
  }

  const host = env.string('APP_VITE_DEV_HOST');
  const port = env.string('APP_VITE_DEV_PORT');
  if (!host && !port) {
    return undefined;
  }

  return new URL(`http://${host ?? '127.0.0.1'}:${port ?? '5173'}`);
}
