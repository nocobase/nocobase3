import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import { appClientPluginsPlugin } from '@nocobase/app-server-kit/plugins';
import { portalSdkCompatibilityPlugin } from '@nocobase/app-portal-sdk/vite';
import path from 'node:path';
import { loadEnv } from 'vite';

function normalizeBase(value: string): string {
  const normalized = value.trim();
  return normalized === '/' ? '/' : `/${normalized.replace(/^\/+|\/+$/g, '')}/`;
}

export default createPortalViteConfig(
  portalSdkCompatibilityPlugin,
  ({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appName = env.APP_NAME || 'orders';
    return {
      base: normalizeBase(env.APP_BASE_PATH ?? `/${appName}`),
      envPrefix: ['VITE_', 'NOCOBASE_', 'API_CLIENT_'],
      plugins: [appClientPluginsPlugin({ root: __dirname })],
      resolve: { alias: { '@': path.resolve(__dirname, './client') } },
    };
  },
);
