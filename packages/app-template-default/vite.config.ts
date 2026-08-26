import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import agentAnnotations from '@gchust/agent-annotations/vite';
import { portalSdkCompatibilityPlugin } from '@nocobase/app-portal-sdk/vite';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

import { appClientPluginsPlugin } from './scripts/client-plugins.js';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const portalTemplate = JSON.parse(
  fs.readFileSync(path.resolve(packageRoot, 'package.json'), 'utf8'),
) as { displayName: string; version: string };
const filesRegistryRoot = process.env.NOCOBASE_E2E_REGISTRY_ROOT?.trim();

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
    const appBase = normalizeBase(env.APP_BASE_PATH ?? '/main');
    const viteBase = appBase;
    const publicApiUrl =
      command === 'serve'
        ? mode === 'e2e' && env.NOCOBASE_E2E_API_URL?.trim()
          ? env.NOCOBASE_E2E_API_URL.trim().replace(/\/$/, '')
          : joinBase(appBase, '/v2/api')
        : undefined;
    const defineEnv: Record<string, string> = {
      __PORTAL_DEV_SOURCE_ROOT__: JSON.stringify(
        command === 'serve' ? path.resolve(packageRoot) : '',
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
      root: packageRoot,
      base: viteBase,
      define: defineEnv,
      envPrefix: ['VITE_'],
      plugins: [
        agentAnnotations({
          root: packageRoot,
          clientExtensions: [
            path.resolve(packageRoot, 'client/agent-annotations-host.ts'),
          ],
        }),
        appClientPluginsPlugin({ root: packageRoot }),
      ],
      server: {
        watch: { ignored: ['**/.agent-annotations/**'] },
        ...(mode === 'e2e'
          ? {
              proxy: {
                '/api/e2e': {
                  target:
                    env.NOCOBASE_E2E_FILES_SERVER_URL?.trim() ||
                    'http://127.0.0.1:4174',
                },
              },
            }
          : {}),
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'react-router'],
        alias: [
          { find: '@', replacement: path.resolve(packageRoot, './client') },
          ...(filesRegistryRoot
            ? [
                {
                  find: '@nocobase/e2e-file-upload',
                  replacement: path.join(
                    filesRegistryRoot,
                    'client/extensions/nocobase-file-upload',
                  ),
                },
              ]
            : []),
        ],
      },
    };
  },
);
