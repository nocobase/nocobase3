// @vitest-environment node
// Vite's esbuild dependency asserts that `new TextEncoder().encode('')` yields a real Uint8Array, which jsdom's
// globals break. This file drives an actual production build, so it runs under Node rather than the shared jsdom
// environment the React tests use.
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The guarantee under test is a build-time one: nothing a plugin declares through `defineDevRoutes()` may reach a
 * production bundle. A unit test cannot show that — only a real production build can, because the guarantee comes
 * from Vite replacing `import.meta.env.PROD` with `true` and then dropping the branch that becomes unreachable.
 *
 * The fixture builds against the real `@nocobase/app-client` helpers rather than a stand-in, so the test fails if the
 * guard inside `defineDevRoutes()` is ever weakened.
 */

const repositoryRoot = fileURLToPath(
  new URL('../../../../..', import.meta.url),
);
const appClientPlugins = path.join(
  repositoryRoot,
  'packages/app/app-client/src/plugins.ts',
);

const DEV_PAGE_MARKER = 'dev_page_marker_a7f3c1';
const DEV_ONLY_DEPENDENCY_MARKER = 'dev_only_dependency_marker_a7f3c1';
const SETTINGS_PAGE_MARKER = 'settings_page_marker_a7f3c1';

let workspace: string;
let bundle: string;

async function readBundle(outputDirectory: string): Promise<string> {
  const entries = await readdir(outputDirectory, {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter((entry) => entry.isFile());
  const contents = await Promise.all(
    files.map((entry) =>
      readFile(path.join(entry.parentPath, entry.name), 'utf8'),
    ),
  );
  return contents.join('\n');
}

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nocobase-dev-routes-'));
  const source = path.join(workspace, 'src');
  await mkdir(source, { recursive: true });

  await writeFile(
    path.join(source, 'dev-only-dependency.ts'),
    `export const devOnlyDependency = '${DEV_ONLY_DEPENDENCY_MARKER}';\n`,
  );
  await writeFile(
    path.join(source, 'dev-page.tsx'),
    `import { devOnlyDependency } from './dev-only-dependency.js';\n\n` +
      `export default function DevPage() {\n` +
      `  return '${DEV_PAGE_MARKER}' + devOnlyDependency;\n` +
      `}\n`,
  );
  await writeFile(
    path.join(source, 'settings-page.tsx'),
    `export default function SettingsPage() {\n` +
      `  return '${SETTINGS_PAGE_MARKER}';\n` +
      `}\n`,
  );
  // The entry mirrors how a plugin declares both surfaces side by side, so the settings page acts as the control: it
  // must survive exactly the build that drops the dev page.
  await writeFile(
    path.join(source, 'main.ts'),
    `import { defineDevRoutes, defineSettingsRoutes } from '@nocobase/app-client/plugins';\n\n` +
      `const routes = [\n` +
      `  defineSettingsRoutes([\n` +
      `    {\n` +
      `      name: 'settings-page',\n` +
      `      path: '/settings-page',\n` +
      `      navigation: { title: 'Settings page' },\n` +
      `      componentLoader: () => import('./settings-page.js'),\n` +
      `    },\n` +
      `  ]),\n` +
      `  defineDevRoutes([\n` +
      `    {\n` +
      `      name: 'dev-page',\n` +
      `      path: '/dev-page',\n` +
      `      navigation: { title: 'Dev page' },\n` +
      `      componentLoader: () => import('./dev-page.js'),\n` +
      `    },\n` +
      `  ]),\n` +
      `];\n\n` +
      `globalThis.__routes = routes;\n`,
  );

  // Vite decides `import.meta.env.PROD` from NODE_ENV, not from the build mode. Vitest sets NODE_ENV=test, under
  // which Vite treats even `mode: 'production'` as a non-production build and leaves the dev branch in place — so the
  // variable has to be set for the duration of the build, or this test would assert against a development bundle.
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await build({
      root: workspace,
      logLevel: 'silent',
      resolve: {
        alias: [
          {
            find: '@nocobase/app-client/plugins',
            replacement: appClientPlugins,
          },
        ],
      },
      build: {
        outDir: 'dist',
        rollupOptions: { input: path.join(source, 'main.ts') },
      },
    });
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }

  bundle = await readBundle(path.join(workspace, 'dist'));
}, 120_000);

afterAll(async () => {
  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
  }
});

describe('dev routes in a production build', () => {
  it('builds the settings page that acts as the control', () => {
    expect(bundle).toContain(SETTINGS_PAGE_MARKER);
  });

  it('drops the dev page component', () => {
    expect(bundle).not.toContain(DEV_PAGE_MARKER);
  });

  it('drops a module only a dev page imports', () => {
    expect(bundle).not.toContain(DEV_ONLY_DEPENDENCY_MARKER);
  });
});
