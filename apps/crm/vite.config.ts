import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import { appClientPluginsPlugin } from '@nocobase/app-server/plugins';
import { portalSdkCompatibilityPlugin } from '@nocobase/portal-sdk/vite';
import fs from 'node:fs';
import path from 'path';
import { loadEnv } from 'vite';

const portalTemplate = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { displayName: string; version: string };

const normalizeBase = (base?: string) => {
  const normalized = String(base || '/').trim();
  if (!normalized || normalized === '/') return '/';
  return `/${normalized.replace(/^\/+|\/+$/g, '')}/`;
};

// https://vite.dev/config/
export default createPortalViteConfig(
  portalSdkCompatibilityPlugin,
  ({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appName = env.APP_NAME || 'crm';
    const appBase = normalizeBase(env.APP_BASE_PATH ?? `/${appName}`);
    const registrySourceRoot = path.resolve(__dirname, './registry');
    const extensionsRoot = fs.existsSync(registrySourceRoot)
      ? registrySourceRoot
      : path.resolve(__dirname, './client/extensions');

    return {
      base: appBase,
      define: {
        __PORTAL_DEV_SOURCE_ROOT__: JSON.stringify(
          command === 'serve' ? path.resolve(__dirname) : '',
        ),
        __PORTAL_TEMPLATE_NAME__: JSON.stringify(portalTemplate.displayName),
        __PORTAL_TEMPLATE_VERSION__: JSON.stringify(portalTemplate.version),
      },
      envPrefix: ['VITE_', 'NOCOBASE_', 'API_CLIENT_'],
      plugins: [appClientPluginsPlugin({ root: __dirname })],
      resolve: {
        alias: {
          '@/extensions': extensionsRoot,
          '@': path.resolve(__dirname, './client'),
        },
      },
    };
  },
);
