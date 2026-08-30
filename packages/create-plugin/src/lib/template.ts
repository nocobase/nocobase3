import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettierConfig from '@nocobase/dev-config/prettier';
import { format } from 'prettier';

import type { PluginNames } from './names.ts';
import type { PluginCapabilities } from './capabilities.ts';

export const DEFAULT_TEMPLATE_DIRECTORY = fileURLToPath(
  new URL('../../template/', import.meta.url),
);

const placeholderPattern = /__NOCOBASE_[A-Z0-9_]+__/gu;

export interface PluginTemplateContext extends PluginNames {
  readonly datePrefix: string;
  readonly description: string;
  readonly displayName: string;
  readonly migrationName: string;
  readonly seedName: string;
}

interface TemplateFile {
  readonly sourcePath: string;
  readonly outputPath: string;
}

const BASE_TEMPLATE_FILES = new Set([
  '.gitignore.template',
  '.prettierignore.template',
  'CHANGELOG.md',
  'README.md',
  'eslint.config.template.js',
  'package.template.json',
  'package.ts',
  'tsconfig.json',
]);

function hasClientPlugin(capabilities: PluginCapabilities): boolean {
  return (
    capabilities.client.bootstrap ||
    capabilities.client.providers ||
    capabilities.client.routes
  );
}

function hasServerPlugin(capabilities: PluginCapabilities): boolean {
  return (
    capabilities.database ||
    capabilities.server.jobs ||
    capabilities.server.providers ||
    capabilities.server.routes
  );
}

function includeTemplateFile(
  relativePath: string,
  capabilities: PluginCapabilities,
): boolean {
  if (BASE_TEMPLATE_FILES.has(relativePath)) return true;
  if (
    relativePath === 'client/index.ts' ||
    relativePath === 'client/plugin.ts'
  ) {
    return hasClientPlugin(capabilities);
  }
  if (
    relativePath === 'client/bootstrap.ts' ||
    relativePath === 'tests/bootstrap.test.ts'
  ) {
    return capabilities.client.bootstrap;
  }
  if (
    relativePath === 'client/routes.ts' ||
    relativePath === 'tests/client.test.ts'
  ) {
    return capabilities.client.routes;
  }
  if (
    relativePath === 'client/providers.ts' ||
    relativePath === 'client/contexts.ts' ||
    relativePath === 'client/components/provider.tsx' ||
    relativePath === 'tests/client-provider.test.tsx'
  ) {
    return capabilities.client.providers;
  }
  if (
    relativePath === 'client/components/plugin-component.tsx' ||
    relativePath === 'tests/component.test.tsx'
  ) {
    return capabilities.client.components;
  }
  if (relativePath.startsWith('client/pages/')) return false;
  if (
    relativePath === 'server/plugin.ts' ||
    relativePath === 'tests/plugin.test.ts'
  ) {
    return hasServerPlugin(capabilities);
  }
  if (
    relativePath.startsWith('server/providers/') ||
    relativePath.startsWith('server/services/') ||
    relativePath === 'server/tokens.ts' ||
    relativePath === 'tests/server-provider.test.ts'
  ) {
    return capabilities.server.providers;
  }
  if (
    relativePath === 'server/routes/index.ts' ||
    relativePath === 'tests/routes.test.ts'
  ) {
    return capabilities.server.routes;
  }
  if (
    relativePath.startsWith('server/jobs/') ||
    relativePath === 'tests/jobs.test.ts'
  ) {
    return capabilities.server.jobs;
  }
  if (
    relativePath.startsWith('database/') ||
    relativePath === 'tests/database.test.ts'
  ) {
    return capabilities.database;
  }
  if (
    relativePath === 'components.json' ||
    relativePath === 'client/styles.css' ||
    relativePath === 'registry.config.json' ||
    relativePath.startsWith('registry/')
  ) {
    return capabilities.registry;
  }
  if (relativePath.startsWith('skills/')) return capabilities.skills;
  return true;
}

function outputPathForTemplateFile(relativePath: string): string {
  switch (relativePath) {
    case '.gitignore.template':
      return '.gitignore';
    case '.prettierignore.template':
      return '.prettierignore';
    case 'eslint.config.template.js':
      return 'eslint.config.js';
    case 'package.template.json':
      return 'package.json';
    default:
      return relativePath;
  }
}

function literal(value: string): string {
  return `'${JSON.stringify(value)
    .slice(1, -1)
    .replaceAll("'", "\\'")
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`;
}

function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function replacementEntries(
  context: PluginTemplateContext,
): readonly (readonly [string, string])[] {
  return [
    ['__NOCOBASE_COLLECTION_NAME_LITERAL__', literal(context.collectionName)],
    ['__NOCOBASE_DESCRIPTION__', context.description],
    ['__NOCOBASE_DISPLAY_NAME__', jsonStringContent(context.displayName)],
    ['__NOCOBASE_DISPLAY_NAME_LITERAL__', literal(context.displayName)],
    [
      '__NOCOBASE_HELLO_MESSAGE_LITERAL__',
      literal(`Hello from ${context.displayName}`),
    ],
    ['__NOCOBASE_MIGRATION_NAME_LITERAL__', literal(context.migrationName)],
    ['__NOCOBASE_MIGRATION_NAME__', context.migrationName],
    ['__NOCOBASE_MODULE_NAME__', context.moduleName],
    ['__NOCOBASE_PACKAGE_NAME_LITERAL__', literal(context.packageName)],
    ['__NOCOBASE_PACKAGE_NAME__', context.packageName],
    ['__NOCOBASE_ROUTE_PATH_LITERAL__', literal(`/${context.shortName}`)],
    ['__NOCOBASE_SEED_NAME_LITERAL__', literal(context.seedName)],
    ['__NOCOBASE_SEED_NAME__', context.seedName],
    [
      '__NOCOBASE_SERVICE_TOKEN_NAME_LITERAL__',
      literal(`${context.packageName}/service`),
    ],
    ['__NOCOBASE_SHORT_NAME_LITERAL__', literal(context.shortName)],
    ['__NOCOBASE_SHORT_NAME__', context.shortName],
    ['__NOCOBASE_SYMBOL_NAME__', context.symbolName],
    [
      '__NOCOBASE_WELCOME_MESSAGE_LITERAL__',
      literal(`Welcome from ${context.packageName}`),
    ],
  ];
}

export function renderTemplateValue(
  value: string,
  context: PluginTemplateContext,
): string {
  const replacements = new Map(replacementEntries(context));

  return value.replace(placeholderPattern, (placeholder) => {
    const replacement = replacements.get(placeholder);
    if (replacement === undefined) {
      throw new Error(`Unknown template placeholder: ${placeholder}`);
    }
    return replacement;
  });
}

async function collectTemplateFiles(
  templateDirectory: string,
  capabilities?: PluginCapabilities,
  directory = templateDirectory,
): Promise<TemplateFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: TemplateFile[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const sourcePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Template entries must not be symbolic links: ${sourcePath}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(
        ...(await collectTemplateFiles(
          templateDirectory,
          capabilities,
          sourcePath,
        )),
      );
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported template entry: ${sourcePath}`);
    }

    const relativePath = path.relative(templateDirectory, sourcePath);
    if (capabilities && !includeTemplateFile(relativePath, capabilities)) {
      continue;
    }
    files.push({
      sourcePath,
      outputPath: outputPathForTemplateFile(relativePath),
    });
  }

  return files;
}

export async function listTemplateFiles(
  templateDirectory: string = DEFAULT_TEMPLATE_DIRECTORY,
  context?: PluginTemplateContext,
  capabilities?: PluginCapabilities,
): Promise<string[]> {
  await access(templateDirectory, constants.R_OK);
  const files = await collectTemplateFiles(templateDirectory, capabilities);

  return files.map((file) =>
    context ? renderTemplateValue(file.outputPath, context) : file.outputPath,
  );
}

async function renderManifest(
  context: PluginTemplateContext,
  capabilities: PluginCapabilities,
): Promise<string> {
  const clientPlugin = hasClientPlugin(capabilities);
  const serverPlugin = hasServerPlugin(capabilities);
  const react =
    capabilities.client.components ||
    capabilities.client.providers ||
    capabilities.registry;
  const exports: Record<string, unknown> = {};
  const publishExports: Record<string, unknown> = {};
  const addExport = (name: string, source: string, compiled: string): void => {
    exports[name] = { types: source, import: source };
    publishExports[name] = {
      types: compiled.replace(/\.js$/u, '.d.ts'),
      import: compiled,
    };
  };
  if (serverPlugin)
    addExport(
      './server/plugin',
      './server/plugin.ts',
      './dist/server/plugin.js',
    );
  if (capabilities.server.providers)
    addExport(
      './server/tokens',
      './server/tokens.ts',
      './dist/server/tokens.js',
    );
  if (clientPlugin) {
    addExport('./client', './client/index.ts', './dist/client/index.js');
    addExport(
      './client/plugin',
      './client/plugin.ts',
      './dist/client/plugin.js',
    );
  }
  if (capabilities.client.bootstrap)
    addExport(
      './client/bootstrap',
      './client/bootstrap.ts',
      './dist/client/bootstrap.js',
    );
  if (capabilities.client.routes)
    addExport(
      './client/routes',
      './client/routes.ts',
      './dist/client/routes.js',
    );
  if (capabilities.client.providers)
    addExport(
      './client/providers',
      './client/providers.ts',
      './dist/client/providers.js',
    );
  if (capabilities.client.components)
    addExport(
      './client/components/plugin-component',
      './client/components/plugin-component.tsx',
      './dist/client/components/plugin-component.js',
    );
  exports['./package.json'] = './package.json';
  publishExports['./package.json'] = './package.json';

  const scripts: Record<string, string> = {
    build: 'tsc -p tsconfig.json',
    typecheck: 'tsc -p tsconfig.json --noEmit',
    test: 'vitest run --passWithNoTests',
    lint: 'eslint . --max-warnings 0',
    'lint:fix': 'eslint . --fix --max-warnings 0',
    format: 'prettier . --write',
    'format:check': 'prettier . --check',
    check:
      'pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build',
    fix: 'pnpm lint:fix && pnpm format',
  };
  if (capabilities.registry) {
    scripts['registry:build'] =
      'node ../../scripts/registry.mjs build --package .';
    scripts['registry:materialize'] =
      'node ../../scripts/registry.mjs materialize --package .';
    scripts.prepack = 'pnpm registry:build';
    scripts.check =
      'pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm registry:build && pnpm build';
  }

  const dependencies: Record<string, string> = {};
  if (serverPlugin) dependencies['@nocobase/app-server-kit'] = 'workspace:^';
  if (capabilities.database)
    dependencies['@nocobase/app-database'] = 'workspace:^';
  if (capabilities.server.providers)
    dependencies['@nocobase/service-provider'] = 'workspace:^';
  if (capabilities.server.routes) dependencies.hono = 'catalog:';
  if (capabilities.server.jobs) dependencies['@nocobase/queue'] = 'workspace:^';

  const peerDependencies: Record<string, string> = {};
  if (clientPlugin) peerDependencies['@nocobase/app-client'] = 'workspace:^';
  if (react) peerDependencies.react = '^19.0.0';

  const devDependencies: Record<string, string> = {
    '@nocobase/dev-config': 'workspace:*',
    '@types/node': 'catalog:',
    eslint: 'catalog:',
    prettier: 'catalog:',
    typescript: 'catalog:',
    vitest: 'catalog:',
  };
  if (clientPlugin) devDependencies['@nocobase/app-client'] = 'workspace:*';
  if (react) {
    devDependencies['@types/react'] = 'catalog:';
    devDependencies.react = 'catalog:';
  }
  if (capabilities.registry) {
    devDependencies.shadcn = '^4.13.1';
    devDependencies.tailwindcss = 'catalog:';
    devDependencies['tw-animate-css'] = '^1.2.5';
  }

  const files = ['dist', 'README.md', 'CHANGELOG.md'];
  if (capabilities.database) files.push('database');
  if (capabilities.skills) files.push('skills');
  if (capabilities.registry)
    files.push(
      'components.json',
      'registry',
      'registry.config.json',
      'public/r',
    );

  const manifest = {
    name: context.packageName,
    displayName: context.displayName,
    description: context.description,
    version: '0.0.1',
    type: 'module',
    prettier: '@nocobase/dev-config/prettier',
    engines: { node: '>=24.0.0' },
    sideEffects: false,
    exports,
    files,
    ...(capabilities.registry
      ? {
          nocobase: {
            registry: { items: { 'component-ui': './registry/component-ui' } },
          },
        }
      : {}),
    publishConfig: { access: 'public', exports: publishExports },
    scripts,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    ...(Object.keys(peerDependencies).length > 0 ? { peerDependencies } : {}),
    devDependencies,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function renderClientPlugin(
  context: PluginTemplateContext,
  capabilities: PluginCapabilities,
): string {
  const entries = [
    capabilities.client.bootstrap
      ? "  bootstrap: () => import('./bootstrap.js'),"
      : undefined,
    capabilities.client.routes
      ? "  routes: () => import('./routes.js'),"
      : undefined,
    capabilities.client.providers
      ? "  providers: () => import('./providers.js'),"
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  return `import { defineClientPlugin, type AppClientPluginFactory } from '@nocobase/app-client/plugins';\n\nconst ${context.moduleName}: AppClientPluginFactory = defineClientPlugin({\n  packageName: ${literal(context.packageName)},\n${entries}\n});\n\nexport default ${context.moduleName};\n`;
}

function renderServerPlugin(
  context: PluginTemplateContext,
  capabilities: PluginCapabilities,
): string {
  const imports = [
    capabilities.server.providers
      ? "import providers from './providers/index.js';"
      : undefined,
    capabilities.server.routes
      ? "import routes from './routes/index.js';"
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  const entries = [
    capabilities.server.providers ? '  providers,' : undefined,
    capabilities.server.routes ? '  routes,' : undefined,
    capabilities.database
      ? "  database: {\n    migrations: './database/migrations',\n    seeds: './database/seeds',\n  },"
      : undefined,
    capabilities.server.jobs
      ? "  queue: { jobs: ['./server/jobs'] },"
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  return `import { defineServerPlugin, type AppServerPlugin } from '@nocobase/app-server-kit/plugins';\n${imports ? `\n${imports}\n` : ''}\nconst ${context.moduleName}Plugin: AppServerPlugin = defineServerPlugin({\n  packageName: ${literal(context.packageName)},\n${entries}\n});\n\nexport default ${context.moduleName}Plugin;\n`;
}

function renderPluginTest(
  context: PluginTemplateContext,
  capabilities: PluginCapabilities,
): string {
  const checks = [
    capabilities.server.providers
      ? '      providers: expect.any(Array),'
      : undefined,
    capabilities.server.routes ? '      routes: expect.any(Array),' : undefined,
    capabilities.database
      ? "      database: { migrations: './database/migrations', seeds: './database/seeds' },"
      : undefined,
    capabilities.server.jobs
      ? "      queue: { jobs: ['./server/jobs'] },"
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  return `import { describe, expect, it } from 'vitest';\n\nimport plugin from '../server/plugin.js';\n\ndescribe(${literal(context.packageName)}, () => {\n  it('declares only its selected Server capabilities', () => {\n    expect(plugin).toMatchObject({\n      packageName: ${literal(context.packageName)},\n${checks}\n    });\n  });\n});\n`;
}

function renderReadme(
  context: PluginTemplateContext,
  capabilities: PluginCapabilities,
): string {
  const selected = [
    capabilities.database && 'database',
    capabilities.server.providers && 'server.providers',
    capabilities.server.routes && 'server.routes',
    capabilities.server.jobs && 'server.jobs',
    capabilities.client.routes && 'client.routes',
    capabilities.client.components && 'client.components',
    capabilities.client.providers && 'client.providers',
    capabilities.client.bootstrap && 'client.bootstrap',
    capabilities.registry && 'registry',
    capabilities.skills && 'skills',
  ].filter(Boolean);
  const list =
    selected.length > 0
      ? selected.map((value) => `- \`${value}\``).join('\n')
      : '- Package foundation only';
  return `# ${context.packageName}\n\n${context.description}\n\n## Generated capabilities\n\n${list}\n\nImplement only the public behavior this plugin owns. Keep declarations, exports, dependencies, tests, README, and Plugin Skills aligned when capabilities change. Every concrete Server Route must own and test its authentication and authorization boundary.\n\n## Verification\n\n\`\`\`bash\npnpm --filter ${context.packageName} lint\npnpm --filter ${context.packageName} typecheck\npnpm --filter ${context.packageName} test\npnpm --filter ${context.packageName} build\n\`\`\`\n`;
}

function renderSkill(context: PluginTemplateContext): string {
  return `---\nname: nocobase-app-plugin-${context.shortName}\ndescription: Document the implemented App-facing capabilities of ${context.displayName} before synchronizing this Skill.\n---\n\n# ${context.displayName}\n\nThis is a development draft. Replace it with the plugin's actual public capabilities, integration workflow, permissions, constraints, and observable verification steps before registering the plugin with an App.\n`;
}

async function formatRenderedSource(
  contents: string,
  outputPath: string,
): Promise<string> {
  const parser =
    outputPath === 'package.json'
      ? 'json-stringify'
      : /\.(?:ts|tsx)(?:\.example)?$/u.test(outputPath)
        ? 'typescript'
        : /\.(?:js|mjs)$/u.test(outputPath)
          ? 'babel'
          : /\.json$/u.test(outputPath)
            ? 'json'
            : /\.md$/u.test(outputPath)
              ? 'markdown'
              : undefined;

  return parser
    ? format(contents, { ...prettierConfig, filepath: outputPath, parser })
    : contents;
}

export async function renderTemplate(options: {
  readonly capabilities: PluginCapabilities;
  readonly context: PluginTemplateContext;
  readonly targetDirectory: string;
  readonly templateDirectory?: string;
}): Promise<string[]> {
  const templateDirectory =
    options.templateDirectory ?? DEFAULT_TEMPLATE_DIRECTORY;
  const files = await collectTemplateFiles(
    templateDirectory,
    options.capabilities,
  );
  const outputFiles: string[] = [];

  for (const file of files) {
    const outputPath = renderTemplateValue(file.outputPath, options.context);
    const targetPath = path.resolve(options.targetDirectory, outputPath);
    const relativeTarget = path.relative(options.targetDirectory, targetPath);
    if (
      relativeTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeTarget)
    ) {
      throw new Error(`Template output escapes the target: ${outputPath}`);
    }

    const renderedContents =
      file.outputPath === 'package.json'
        ? await renderManifest(options.context, options.capabilities)
        : file.outputPath === 'README.md'
          ? renderReadme(options.context, options.capabilities)
          : file.outputPath === 'client/plugin.ts'
            ? renderClientPlugin(options.context, options.capabilities)
            : file.outputPath === 'server/plugin.ts'
              ? renderServerPlugin(options.context, options.capabilities)
              : file.outputPath === 'tests/plugin.test.ts'
                ? renderPluginTest(options.context, options.capabilities)
                : file.outputPath.startsWith('skills/')
                  ? renderSkill(options.context)
                  : renderTemplateValue(
                      await readFile(file.sourcePath, 'utf8'),
                      options.context,
                    );
    const contents = await formatRenderedSource(renderedContents, outputPath);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, { encoding: 'utf8', flag: 'wx' });
    outputFiles.push(outputPath);
  }

  return outputFiles;
}
