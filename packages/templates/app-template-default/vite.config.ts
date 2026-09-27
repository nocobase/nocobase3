import { createAppViteConfig } from '@nocobase/dev-config/vite/app';
import agentAnnotations from '@gchust/agent-annotations/vite';
import path from 'path';
import { createDevProxy } from '@nocobase/app-cli/dev/proxy';

const AGENT_ANNOTATIONS_DISABLED_VALUES = new Set(['false', '0', 'no', 'off']);

function isAgentAnnotationsEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return !normalized || !AGENT_ANNOTATIONS_DISABLED_VALUES.has(normalized);
}

const normalizeBase = (base?: string) => {
  const normalized = String(base || '/').trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  return `/${normalized.replace(/^\/+|\/+$/g, '')}/`;
};

const numberFromEnv = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

// https://vite.dev/config/
export default createAppViteConfig(({ command }) => {
  // Configuration is loaded by the application runtime. Vite should only
  // consume the environment explicitly supplied by the invoking process;
  // reading .env here would make the client and server use different paths.
  const env = process.env;
  const appBase = normalizeBase(env.APP_BASE_PATH ?? '/main');
  const viteBase = appBase;
  const annotationsEnabled = isAgentAnnotationsEnabled(
    env.AGENT_ANNOTATIONS_ENABLED,
  );
  const viteHmrHost = env.APP_VITE_HMR_HOST;
  const viteDevPort = numberFromEnv(env.APP_VITE_DEV_PORT) ?? 5173;

  return {
    root: __dirname,
    base: viteBase,
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
      proxy:
        command === 'serve'
          ? createDevProxy(appBase, env.PROXY_TARGET_URL)
          : undefined,
      watch: {
        ignored: [
          '**/.agent-annotations/**',
          '**/storage/**',
          // Vite only excludes dist/client automatically. The server build and
          // vendored packages also live in dist and can exhaust file watchers.
          // Scope this to the app so linked dependencies still receive HMR.
          (filePath: string) => {
            const relativePath = path.relative(__dirname, filePath);
            return (
              relativePath === 'dist' ||
              relativePath.startsWith(`dist${path.sep}`)
            );
          },
        ],
      },
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
