import { createPortalViteConfig } from '@nocobase/dev-config/vite/portal';
import agentAnnotations from '@gchust/agent-annotations/vite';
import fs from 'node:fs';
import path from 'path';

import { isAgentAnnotationsEnabled } from './scripts/agent-annotations.js';

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

const numberFromEnv = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// https://vite.dev/config/
export default createPortalViteConfig(({ command }) => {
  // Configuration is loaded by the application runtime. Vite should only
  // consume the environment explicitly supplied by the invoking process;
  // reading .env here would make the client and server use different paths.
  const env = process.env;
  const appBase = normalizeBase(env.APP_BASE_PATH ?? '/main');
  const viteBase = appBase;
  const annotationsEnabled = isAgentAnnotationsEnabled(
    env.AGENT_ANNOTATIONS_ENABLED,
  );
  const publicApiUrl =
    command === 'serve' ? joinBase(appBase, '/api') : undefined;
  const viteHmrHost = env.APP_VITE_HMR_HOST;
  const viteDevPort = numberFromEnv(env.APP_VITE_DEV_PORT) ?? 5173;
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
    env.NOCOBASE_AUTHENTICATOR,
  );
  optionalDefineEnv(defineEnv, 'NOCOBASE_WS_URL', env.NOCOBASE_WS_URL);
  optionalDefineEnv(defineEnv, 'NOCOBASE_WS_PATH', env.NOCOBASE_WS_PATH);

  return {
    root: __dirname,
    base: viteBase,
    define: defineEnv,
    envPrefix: ['VITE_'],
    plugins: [
      ...(annotationsEnabled
        ? [
            agentAnnotations({
              root: __dirname,
              clientExtensions: [
                path.resolve(__dirname, 'client/agent-annotations-host.ts'),
              ],
            }),
          ]
        : []),
    ],
    server: {
      watch: { ignored: ['**/.agent-annotations/**'] },
      ...(command === 'serve'
        ? {
            hmr: {
              ...(viteHmrHost ? { host: viteHmrHost } : {}),
              clientPort: viteDevPort,
            },
          }
        : {}),
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router'],
      alias: [{ find: '@', replacement: path.resolve(__dirname, './client') }],
    },
  };
});
