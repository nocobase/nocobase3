import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlugin } from '../src/lib/scaffold.ts';

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTestRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-create-plugin-'),
  );
  createdDirectories.push(repoRoot);
  await mkdir(path.join(repoRoot, 'packages'));
  return repoRoot;
}

describe('createPlugin', () => {
  it('renders the bundled plugin template', async () => {
    const repoRoot = await createTestRepo();
    const synchronize = vi.fn();
    const result = await createPlugin({
      name: 'audit-log',
      now: new Date(2026, 7, 22),
      repoRoot,
      synchronize,
    });
    const manifest = JSON.parse(
      await readFile(path.join(result.targetDirectory, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(result.packageName).toBe('@nocobase/app-plugin-audit-log');
    expect(result.files).toContain('.gitignore');
    expect(result.files).not.toContain('.gitignore.template');
    expect(result.files).toContain('.prettierignore');
    expect(result.files).not.toContain('.prettierignore.template');
    expect(result.files).toContain('CHANGELOG.md');
    expect(result.files).toContain('components.json');
    expect(result.files).toContain('registry.config.json');
    expect(result.files).toContain(
      'registry/component-ui/plugin-feature-card.tsx',
    );
    expect(result.files).toContain('eslint.config.js');
    expect(result.files).not.toContain('eslint.config.template.js');
    expect(result.files).toContain(
      'database/migrations/202608220001_audit_log_create_records.ts.example',
    );
    expect(manifest).toMatchObject({
      name: '@nocobase/app-plugin-audit-log',
      displayName: 'Audit Log App Plugin',
      description: 'Audit Log App Plugin.',
      version: '0.0.1',
      prettier: '@nocobase/dev-config/prettier',
      devDependencies: {
        shadcn: '^4.13.1',
        tailwindcss: 'catalog:',
        'tw-animate-css': '^1.2.5',
      },
      files: expect.arrayContaining([
        'registry',
        'registry.config.json',
        'public/r',
      ]),
      nocobase: {
        registry: {
          items: {
            'component-ui': './registry/component-ui',
          },
        },
      },
      scripts: {
        'registry:build': 'node ../../scripts/registry.mjs build --package .',
        'registry:materialize':
          'node ../../scripts/registry.mjs materialize --package .',
        prepack: 'pnpm registry:build',
      },
    });
    expect(synchronize).toHaveBeenCalledWith(repoRoot, result.targetDirectory);

    const clientPlugin = await readFile(
      path.join(result.targetDirectory, 'client/plugin.ts'),
      'utf8',
    );
    expect(clientPlugin).toContain('interface AuditLogClientOptions');
    expect(clientPlugin).toContain('readonly resourceLabel?: string;');
    expect(clientPlugin).toContain(
      "packageName: '@nocobase/app-plugin-audit-log'",
    );

    const components = JSON.parse(
      await readFile(
        path.join(result.targetDirectory, 'components.json'),
        'utf8',
      ),
    ) as {
      aliases?: Record<string, string>;
      tailwind?: { css?: string };
    };
    expect(components.tailwind?.css).toBe('client/styles.css');
    expect(components.aliases?.ui).toBe('@/components/ui');

    const tsconfig = JSON.parse(
      await readFile(
        path.join(result.targetDirectory, 'tsconfig.json'),
        'utf8',
      ),
    ) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    };
    expect(tsconfig.compilerOptions?.paths?.['@/*']).toEqual(['./client/*']);

    const registryConfig = JSON.parse(
      await readFile(
        path.join(result.targetDirectory, 'registry.config.json'),
        'utf8',
      ),
    ) as {
      name?: string;
      items?: Array<{
        name?: string;
        registryDependencies?: string[];
        source?: { root?: string; target?: string };
      }>;
    };
    expect(registryConfig).toMatchObject({
      name: 'nocobase-audit-log',
      items: [
        {
          name: 'component-ui',
          registryDependencies: ['button'],
          source: {
            root: 'registry/component-ui',
            target: 'client/extensions/nocobase-audit-log-component-ui',
          },
        },
      ],
    });

    const registryComponent = await readFile(
      path.join(
        result.targetDirectory,
        'registry/component-ui/plugin-feature-card.tsx',
      ),
      'utf8',
    );
    expect(registryComponent).toContain(
      "import { Button } from '@/components/ui/button';",
    );
    expect(registryComponent).toContain("eyebrow = 'Audit Log App Plugin'");

    const clientBootstrap = await readFile(
      path.join(result.targetDirectory, 'client/bootstrap.ts'),
      'utf8',
    );
    expect(clientBootstrap).toContain('refine.addResources([');
    expect(clientBootstrap).toContain("name: 'audit-log'");
    expect(clientBootstrap).toContain("list: '/audit-log'");
    expect(clientBootstrap).toContain(
      "label: options.resourceLabel ?? 'Audit Log App Plugin'",
    );

    const clientRoutes = await readFile(
      path.join(result.targetDirectory, 'client/routes.ts'),
      'utf8',
    );
    expect(clientRoutes).toContain("path: '/audit-log'");
    expect(clientRoutes).toContain(
      "componentLoader: () => import('./pages/index.js')",
    );

    const clientSettings = await readFile(
      path.join(result.targetDirectory, 'client/settings.ts'),
      'utf8',
    );
    expect(clientSettings).toContain("id: 'audit-log'");
    expect(clientSettings).toContain("title: 'Audit Log App Plugin'");
    expect(clientSettings).toContain(
      "pageLoader: () => import('./pages/settings.js')",
    );

    const clientProviders = await readFile(
      path.join(result.targetDirectory, 'client/providers.ts'),
      'utf8',
    );
    expect(clientProviders).toContain('component: AuditLogProvider');

    const clientPage = await readFile(
      path.join(result.targetDirectory, 'client/pages/index.tsx'),
      'utf8',
    );
    expect(clientPage).toContain('const appClient = createAppClient();');
    expect(clientPage).toContain("'audit-log'");

    expect(result.files).toEqual(
      expect.arrayContaining([
        'client/components/provider.tsx',
        'client/contexts.ts',
        'client/pages/index.tsx',
        'client/pages/settings.tsx',
      ]),
    );

    const serverPlugin = await readFile(
      path.join(result.targetDirectory, 'server/plugin.ts'),
      'utf8',
    );
    expect(serverPlugin).toContain('const auditLogPlugin: AppServerPlugin');
    expect(serverPlugin).toContain(
      "packageName: '@nocobase/app-plugin-audit-log'",
    );
    expect(serverPlugin).toContain(
      "import providers from './providers/index.js'",
    );
    expect(serverPlugin).toContain('providers,');
    expect(serverPlugin).toContain('routes,');

    const serverRoutes = await readFile(
      path.join(result.targetDirectory, 'server/routes/index.ts'),
      'utf8',
    );
    expect(serverRoutes).toContain('export const apiRoutes:');
    expect(serverRoutes).toContain('const routes: readonly');
    expect(serverRoutes).toContain('apiRoutes,');
    expect(serverRoutes).toContain('defineApiRoutes(');
    expect(serverRoutes).toContain('({ container }) => {');
    expect(serverRoutes).toContain('const router = new Hono();');
    expect(serverRoutes).toContain('container.resolve(');
    expect(serverRoutes).toContain('auditLogServiceToken');
    expect(serverRoutes).toContain('return router;');
    expect(serverRoutes).not.toContain('AppPluginRoutesApplication');

    const serverProvider = await readFile(
      path.join(result.targetDirectory, 'server/providers/audit-log.ts'),
      'utf8',
    );
    expect(serverProvider).toContain('public override register(): void');
    expect(serverProvider).toContain('this.app.container.singleton(');
    expect(serverProvider).toContain('auditLogServiceToken');

    const serverToken = await readFile(
      path.join(result.targetDirectory, 'server/tokens.ts'),
      'utf8',
    );
    expect(serverToken).toContain(
      'export const auditLogServiceToken: ServiceToken<AuditLogService>',
    );
    expect(serverToken).toContain('createServiceToken<AuditLogService>(');
    expect(serverToken).toContain("'@nocobase/app-plugin-audit-log/service'");

    const readme = await readFile(
      path.join(result.targetDirectory, 'README.md'),
      'utf8',
    );
    expect(readme).toContain('# @nocobase/app-plugin-audit-log');
    expect(readme).toContain('Audit Log App Plugin.');

    const changelog = await readFile(
      path.join(result.targetDirectory, 'CHANGELOG.md'),
      'utf8',
    );
    expect(changelog).toContain('# @nocobase/app-plugin-audit-log');

    for (const file of result.files) {
      const contents = await readFile(
        path.join(result.targetDirectory, file),
        'utf8',
      );
      expect(contents).not.toMatch(/NOCOBASE_[A-Z0-9_]+/u);
    }
  });

  it('escapes user-facing text before inserting it into TypeScript', async () => {
    const repoRoot = await createTestRepo();
    const result = await createPlugin({
      description: 'Tracks quoted values.',
      displayName: "Audit's \\ Log\tSuite",
      install: false,
      name: 'audit-log',
      repoRoot,
    });
    const service = await readFile(
      path.join(result.targetDirectory, 'server/services/audit-log.ts'),
      'utf8',
    );
    const registryConfig = JSON.parse(
      await readFile(
        path.join(result.targetDirectory, 'registry.config.json'),
        'utf8',
      ),
    ) as { items?: Array<{ title?: string }> };

    expect(service).toContain('return "Hello from Audit\'s \\\\ Log\\tSuite";');
    expect(registryConfig.items?.[0]?.title).toBe(
      "Audit's \\ Log\tSuite Component",
    );
  });

  it('does not write files during a dry run', async () => {
    const repoRoot = await createTestRepo();
    const result = await createPlugin({
      dryRun: true,
      name: 'audit-log',
      repoRoot,
    });

    expect(result.files).toContain('client/plugin.ts');
    await expect(
      readFile(result.targetDirectory, 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not overwrite an existing plugin', async () => {
    const repoRoot = await createTestRepo();
    const target = path.join(repoRoot, 'packages/app-plugin-audit-log');
    await mkdir(target);
    await writeFile(path.join(target, 'marker.txt'), 'keep\n');

    await expect(
      createPlugin({ install: false, name: 'audit-log', repoRoot }),
    ).rejects.toThrow('Target already exists');
    await expect(
      readFile(path.join(target, 'marker.txt'), 'utf8'),
    ).resolves.toBe('keep\n');
  });

  it('removes a partial target when template rendering fails', async () => {
    const repoRoot = await createTestRepo();
    const templateDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-plugin-template-'),
    );
    createdDirectories.push(templateDirectory);
    await writeFile(
      path.join(templateDirectory, 'broken.ts'),
      'const value = __NOCOBASE_UNKNOWN__;\n',
    );
    const target = path.join(repoRoot, 'packages/app-plugin-audit-log');

    await expect(
      createPlugin({
        install: false,
        name: 'audit-log',
        repoRoot,
        templateDirectory,
      }),
    ).rejects.toThrow('Unknown template placeholder');
    await expect(readFile(target, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
