import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type {
  ConfigEnv,
  RenderBuiltAssetUrl,
  Rollup,
  UserConfig,
  UserConfigExport,
} from 'vite';
import { defineConfig, loadEnv, mergeConfig } from 'vite';

// A locale module is a `locales/` sibling named after the locale it provides, such as `en-US.ts` or
// `zh-CN.js`. Both extensions are accepted because a consumer may build from plugin sources or from an
// already compiled package. The locale-shaped filename keeps barrels such as `locales/index.ts` out.
const LOCALE_MODULE_PATTERN =
  /[/\\]locales[/\\][A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*\.[jt]s$/;

// Directories that only describe how a package is laid out, so they never identify the package itself.
const GENERIC_PACKAGE_DIRECTORIES = new Set([
  'build',
  'client',
  'dist',
  'esm',
  'lib',
  'server',
  'src',
]);

const sanitizeOwnerName = (name: string): string =>
  name.replace(/^@[^/\\]+[/\\]/, '').replace(/[^A-Za-z0-9._-]/g, '-');

// Walks up from the `locales/` directory to the nearest ancestor that is not a generic layout directory, so
// both `packages/plugins/app-plugin-workflow/client/locales` and
// `node_modules/@nocobase/app-plugin-workflow/dist/client/locales` resolve to `app-plugin-workflow`.
const resolveLocaleOwner = (moduleId: string): string | undefined => {
  let directory = path.dirname(path.dirname(moduleId));

  while (GENERIC_PACKAGE_DIRECTORIES.has(path.basename(directory))) {
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }

  const owner = sanitizeOwnerName(path.basename(directory));
  return owner.length > 0 ? owner : undefined;
};

// Every plugin ships the same locale filenames, so the default `[name]-[hash].js` produces a directory full
// of indistinguishable `en-US-*.js` chunks. Prefixing with the owning package keeps the output readable.
const resolveChunkFileName = (chunk: Rollup.PreRenderedChunk): string => {
  const moduleId = chunk.facadeModuleId;
  if (!moduleId || !LOCALE_MODULE_PATTERN.test(moduleId)) {
    return 'assets/[name]-[hash].js';
  }

  const owner = resolveLocaleOwner(moduleId);
  return owner
    ? `assets/locales/${owner}.[name]-[hash].js`
    : 'assets/locales/[name]-[hash].js';
};

// Vite bakes `base` into the `__vitePreload` helper it emits, which pins a build to the prefix it was built
// for. A host that mounts the application somewhere else — the Hub serves each application under `/<appId>` —
// rewrites the asset URLs in `index.html` as it serves them, but it cannot reach a string concatenation inside
// a JavaScript chunk. Chunk-to-chunk imports survive because they are relative; the preload dependency list
// does not. The helper awaits every stylesheet link it inserts, so a single 404 CSS dependency rejects the
// dynamic import and the route renders its error state instead of the page. Only a lazy chunk carrying its own
// CSS is affected, so this surfaces as one broken page rather than a broken application, which is what makes it
// hard to recognise: `@nocobase/app-plugin-workflow` was the only such chunk, and its settings page was the only
// thing that failed.
//
// The server injects `window.APP_BASE_PATH` ahead of the entry module, so resolve these URLs from it at runtime
// and fall back to the build-time base when nothing injected one — a standalone deployment then behaves exactly
// as it did before. Only a `js` host may carry a runtime expression; `html` and `css` keep the build-time base,
// which is both what Vite requires and what a host's own HTML rewriting expects to find.
const createRuntimeAssetUrl = (base: string, filename: string): string =>
  `((globalThis.APP_BASE_PATH||${JSON.stringify(base)}).replace(/\\/+$/,"")+"/"+${JSON.stringify(filename)})`;

const createBaseAgnosticAssetUrl =
  (base: string): RenderBuiltAssetUrl =>
  (filename, { hostType, ssr }) =>
    hostType === 'js' && !ssr
      ? { runtime: createRuntimeAssetUrl(base, filename) }
      : undefined;

const positiveInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveLocalConfig = async (
  localConfig: UserConfigExport,
  configEnvironment: ConfigEnv,
): Promise<UserConfig> => {
  const localConfigValue =
    typeof localConfig === 'function'
      ? localConfig(configEnvironment)
      : localConfig;

  return (await localConfigValue) ?? {};
};

export const createPortalViteConfig: (
  localConfig?: UserConfigExport,
) => UserConfigExport = (localConfig = {}) =>
  defineConfig(async (configEnvironment): Promise<UserConfig> => {
    const resolvedLocalConfig = await resolveLocalConfig(
      localConfig,
      configEnvironment,
    );
    const root = path.resolve(resolvedLocalConfig.root ?? process.cwd());
    const envDirectory =
      resolvedLocalConfig.envDir === false
        ? undefined
        : path.resolve(root, resolvedLocalConfig.envDir ?? '.');
    const env: Record<string, string> = envDirectory
      ? loadEnv(configEnvironment.mode, envDirectory, '')
      : {};
    const devHost = env.APP_VITE_DEV_HOST?.trim();
    const devPort = positiveInteger(env.APP_VITE_DEV_PORT) ?? 5173;
    const sharedConfig: UserConfig = {
      root,
      plugins: [react(), tailwindcss()],
      build: {
        outDir: 'dist/client',
        rollupOptions: {
          output: {
            chunkFileNames: resolveChunkFileName,
          },
        },
      },
      server:
        configEnvironment.command === 'serve'
          ? {
              hmr: {
                ...(devHost && devHost !== '0.0.0.0' ? { host: devHost } : {}),
                clientPort: devPort,
              },
            }
          : undefined,
    };

    const merged = mergeConfig(sharedConfig, resolvedLocalConfig);
    const buildBase = typeof merged.base === 'string' ? merged.base : '/';

    return mergeConfig(
      {
        experimental: { renderBuiltUrl: createBaseAgnosticAssetUrl(buildBase) },
      } satisfies UserConfig,
      merged,
    );
  });
