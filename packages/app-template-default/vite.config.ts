import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import { portalSdkCompatibilityPlugin } from '@nocobase/portal-sdk/vite';
import fs from 'node:fs';
import path from 'path';
import { loadEnv } from 'vite';

const portalTemplate = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { displayName: string; version: string };

const normalizeBase = (base?: string) => {
  const normalized = String(base || '/').trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  return `/${normalized.replace(/^\/+|\/+$/g, '')}/`;
};

const joinBase = (base: string, pathInsideBase: string) => {
  const basePath = normalizeBase(base).replace(/\/$/, '');
  const pathInside = pathInsideBase.replace(/^\/+|\/+$/g, '');
  return `${basePath}/${pathInside}`;
};

const optionalDefineEnv = (
  define: Record<string, string>,
  key: string,
  value: string | undefined,
) => {
  const normalized = value?.trim();
  if (normalized) {
    define[`import.meta.env.${key}`] = JSON.stringify(normalized);
  }
};

// https://vite.dev/config/
export default createPortalViteConfig(
  portalSdkCompatibilityPlugin,
  ({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appBase = normalizeBase(env.APP_BASE_PATH ?? '/app-template-default');
    const viteBase = appBase;
    const publicApiUrl =
      command === 'serve'
        ? mode === 'e2e' && env.NOCOBASE_E2E_API_URL?.trim()
          ? env.NOCOBASE_E2E_API_URL.trim().replace(/\/$/, '')
          : joinBase(appBase, '/v2/api')
        : undefined;
    const registrySourceRoot = path.resolve(__dirname, './registry');
    const clientExtensionsRoot = path.resolve(__dirname, './client/extensions');
    const extensionsRoot = fs.existsSync(registrySourceRoot)
      ? registrySourceRoot
      : clientExtensionsRoot;
    const localExtensionAliases = fs.existsSync(clientExtensionsRoot)
      ? fs
          .readdirSync(clientExtensionsRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({
            find: `@/extensions/${entry.name}`,
            replacement: path.join(clientExtensionsRoot, entry.name),
          }))
      : [];
    const defineEnv: Record<string, string> = {
      __PORTAL_DEV_SOURCE_ROOT__: JSON.stringify(
        command === 'serve' ? path.resolve(__dirname) : '',
      ),
      __PORTAL_TEMPLATE_NAME__: JSON.stringify(portalTemplate.displayName),
      __PORTAL_TEMPLATE_VERSION__: JSON.stringify(portalTemplate.version),
    };

    if (publicApiUrl) {
      defineEnv['import.meta.env.NOCOBASE_API_URL'] =
        JSON.stringify(publicApiUrl);
    }

    optionalDefineEnv(
      defineEnv,
      'NOCOBASE_AUTHENTICATOR',
      env.NOCOBASE_AUTHENTICATOR ?? env.NOCOBASE_E2E_AUTHENTICATOR,
    );
    optionalDefineEnv(defineEnv, 'NOCOBASE_WS_URL', env.NOCOBASE_WS_URL);
    optionalDefineEnv(defineEnv, 'NOCOBASE_WS_PATH', env.NOCOBASE_WS_PATH);

    return {
      root: __dirname,
      base: viteBase,
      define: defineEnv,
      envPrefix: ['VITE_'],
      resolve: {
        alias: [
          ...localExtensionAliases,
          { find: '@/extensions', replacement: extensionsRoot },
          { find: '@', replacement: path.resolve(__dirname, './client') },
        ],
      },
    };
  },
);
