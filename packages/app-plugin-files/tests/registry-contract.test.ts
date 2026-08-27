import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

interface RegistrySource {
  readonly include: readonly string[];
  readonly root: string;
  readonly target: string;
}

interface RegistryItem {
  readonly dependencies: readonly string[];
  readonly description: string;
  readonly docs: string;
  readonly meta: {
    readonly nocobase?: {
      readonly requiresPlugins?: Readonly<Record<string, string>>;
    };
    readonly ownership: string;
    readonly upgradePolicy: string;
  };
  readonly name: string;
  readonly registryDependencies: readonly string[];
  readonly source: RegistrySource;
  readonly title: string;
  readonly type: string;
}

interface RegistryConfig {
  readonly items: readonly RegistryItem[];
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(packageRoot, '../..');
const execFileAsync = promisify(execFile);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
}

function filesUnder(relativeRoot: string): readonly string[] {
  const absoluteRoot = path.join(packageRoot, relativeRoot);
  return fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .flatMap((entry) => {
      const relativeEntry = path.join(relativeRoot, entry.name);
      return entry.isDirectory() ? filesUnder(relativeEntry) : [relativeEntry];
    });
}

function sourceFiles(item: RegistryItem): readonly string[] {
  return filesUnder(item.source.root).filter((file) =>
    /\.[cm]?[jt]sx?$/u.test(file),
  );
}

describe('files plugin Registry contract', () => {
  const config = JSON.parse(read('registry.config.json')) as RegistryConfig;

  it('publishes exactly the two application-owned items with safe mappings', () => {
    expect(config.items.map(({ name }) => name)).toEqual([
      'component-ui',
      'page-ui',
    ]);
    for (const item of config.items) {
      expect(item.source.root.startsWith('registry/')).toBe(true);
      expect(item.source.target.startsWith('client/extensions/')).toBe(true);
      expect(item.source.root).not.toContain('..');
      expect(item.source.target).not.toContain('..');
      expect(item.source.include).toEqual(['.']);
      expect(item.meta.ownership).toBe('application');
      expect(item.meta.upgradePolicy).toBe('three-way-merge');
      expect(item.title).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.docs).toBeTruthy();
      expect(fs.existsSync(path.join(packageRoot, item.source.root))).toBe(
        true,
      );
      expect(filesUnder(item.source.root).length).toBeGreaterThan(0);
      expect(
        item.dependencies.every((dependency) =>
          /^(?:@[^/]+\/[^@]+|[^@]+)@[^\s]+$/u.test(dependency),
        ),
      ).toBe(true);
    }
  });

  it('exposes component UI through a direct import entry without an automatic route', () => {
    const item = config.items.find(({ name }) => name === 'component-ui');
    expect(item).toMatchObject({
      type: 'registry:component',
      registryDependencies: ['button'],
      source: {
        root: 'registry/component-ui',
        target: 'client/extensions/nocobase-files-component-ui',
      },
    });
    expect(item?.dependencies).toContain('@nocobase/app-plugin-files@^0.0.1');
    expect(item?.meta.nocobase?.requiresPlugins).toEqual({
      '@nocobase/app-plugin-files': '>=0.0.1 <0.1.0',
    });
    expect(read('registry/component-ui/index.ts')).toContain(
      "'./components/file-upload-field'",
    );
    expect(read('registry/component-ui/index.ts')).toContain(
      "'@nocobase/app-plugin-files/client'",
    );
    expect(
      fs.existsSync(
        path.join(packageRoot, 'registry/component-ui/files-client.ts'),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(packageRoot, 'registry/component-ui/extension.ts'),
      ),
    ).toBe(false);
  });

  it('overrides the stable Demo route without declaring another route', () => {
    const item = config.items.find(({ name }) => name === 'page-ui');
    const extension = read('registry/page-ui/extension.ts');
    const page = read('registry/page-ui/pages/files-demo-page.tsx');
    expect(item).toMatchObject({
      type: 'registry:block',
      registryDependencies: ['button'],
      source: {
        root: 'registry/page-ui',
        target: 'client/extensions/nocobase-files-page-ui',
      },
    });
    expect(item?.dependencies).toContain('@nocobase/app-client@^1.0.0-beta.2');
    expect(item?.dependencies).toContain('@nocobase/app-portal-sdk@^2.0.0');
    expect(item?.dependencies).toContain('@nocobase/app-plugin-files@^0.0.1');
    expect(item?.meta.nocobase?.requiresPlugins).toEqual({
      '@nocobase/app-plugin-files': '>=0.0.1 <0.1.0',
    });
    expect(extension).toContain('FILES_ROUTE_IDS.demo');
    expect(extension).toContain('routeComponentOverrides');
    expect(extension).not.toContain('defineClientRoutes');
    expect(extension).not.toMatch(/path\s*:\s*['"]\/files-demo['"]/u);
    expect(page).toContain("resolvePortalUrl('/api/attachments/examples'");
    expect(page).toContain('nocobaseClient.getHeaders');
    expect(page).toContain('filesEndpoint');
    expect(page).toContain("'@nocobase/app-plugin-files/client'");
    expect(page).not.toContain('@/extensions/nocobase-files-component-ui');
    expect(page).not.toMatch(/path\s*:\s*['"]\/files-demo['"]/u);
  });

  it('keeps relative imports inside each item root', () => {
    for (const item of config.items) {
      const root = path.resolve(packageRoot, item.source.root);
      for (const relativeFile of sourceFiles(item)) {
        const source = read(relativeFile);
        for (const match of source.matchAll(
          /(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/gu,
        )) {
          const resolved = path.resolve(
            path.dirname(path.join(packageRoot, relativeFile)),
            match[1],
          );
          expect(path.relative(root, resolved).startsWith('..')).toBe(false);
        }
      }
    }
  });

  it('contains no server, security, storage, or legacy implementation', () => {
    const source = config.items
      .flatMap((item) => filesUnder(item.source.root))
      .map(read)
      .join('\n');
    for (const banned of [
      'createFileRoute',
      'DatabaseManager',
      'NocoBaseDriveManager',
      'tokenSecret',
      'HMAC',
      'storages:',
      'storageKey',
      'sessionSecret',
      '@nocobase/app-plugin-files/server',
    ]) {
      expect(source).not.toContain(banned);
    }
  });

  it('builds and materializes both items into a temporary application', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nocobase-files-registry-'),
    );
    try {
      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, 'scripts/registry.mjs'),
          'build',
          '--package',
          packageRoot,
        ],
        { cwd: repoRoot },
      );
      for (const item of config.items) {
        const built = JSON.parse(read(`public/r/${item.name}.json`)) as {
          readonly files: readonly {
            readonly path: string;
            readonly target: string;
          }[];
        };
        expect(built.files).toHaveLength(filesUnder(item.source.root).length);
        for (const file of built.files) {
          expect(fs.existsSync(path.join(packageRoot, file.path))).toBe(true);
          expect(file.target.startsWith(`${item.source.target}/`)).toBe(true);
        }
      }
      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, 'scripts/registry.mjs'),
          'materialize',
          '--package',
          packageRoot,
          '--output-root',
          temporaryRoot,
        ],
        { cwd: repoRoot },
      );
      expect(
        fs.existsSync(
          path.join(
            temporaryRoot,
            'client/extensions/nocobase-files-component-ui/index.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            temporaryRoot,
            'client/extensions/nocobase-files-page-ui/extension.ts',
          ),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('resolves both items from a local HTTP Registry without cross-item requests', async () => {
    const consumerRoot = path.join(repoRoot, 'packages/app-template-default');
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? '');
      const name = request.url?.split('/').pop() ?? '';
      const file = path.join(packageRoot, 'public/r', name);
      if (!fs.existsSync(file)) {
        response.statusCode = 404;
        response.end('not found');
        return;
      }
      response.setHeader('content-type', 'application/json');
      response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Local Registry server did not bind to a TCP port.');
    }
    try {
      for (const name of ['page-ui', 'component-ui']) {
        let output: string;
        try {
          ({ stdout: output } = await execFileAsync(
            'pnpm',
            [
              '--dir',
              packageRoot,
              'exec',
              'shadcn',
              'add',
              `http://127.0.0.1:${address.port}/${name}.json`,
              '--dry-run',
              '-y',
              '--cwd',
              consumerRoot,
            ],
            { cwd: repoRoot, encoding: 'utf8' },
          ));
        } catch (error) {
          const stderr = Reflect.get(error as object, 'stderr');
          const stdout = Reflect.get(error as object, 'stdout');
          throw new Error(
            typeof stderr === 'string' && stderr
              ? stderr
              : typeof stdout === 'string' && stdout
                ? stdout
                : `Unable to resolve ${name}.`,
            { cause: error },
          );
        }
        expect(output).not.toContain('Error:');
        if (name === 'page-ui') {
          expect(output).not.toContain('component-ui.json');
          expect(output).not.toContain(
            'ui.shadcn.com/r/styles/base-nova/component-ui',
          );
        }
      }
      expect(requests).toEqual(
        expect.arrayContaining(['/page-ui.json', '/component-ui.json']),
      );
    } finally {
      server.close();
      await once(server, 'close');
    }
  }, 30_000);
});
