import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packagePrefix = '@nocobase/app-plugin-';
const directoryPrefix = 'app-plugin-';
const pluginNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');

const help = `Create a NocoBase application plugin in packages/.

Usage:
  pnpm plugin:create <name> [options]

Arguments:
  <name>                       Short kebab-case name, for example audit-log
                               (full @nocobase/app-plugin-* names also work)

Options:
  --display-name <name>        Human-readable package display name
  --description <description>  Package description
  --no-install                 Do not synchronize pnpm-lock.yaml
  --dry-run                    Validate and print the target without writing
  -h, --help                   Show this help

The generated plugin uses @nocobase/dev-config, has no src/ directory, and
includes database, server, client contribution entries, and matching tests.
Registering or enabling the plugin in an application remains an explicit step.`;

export function parseCreatePluginArgs(args) {
  const options = {
    description: undefined,
    displayName: undefined,
    dryRun: false,
    help: false,
    install: true,
    name: undefined,
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--no-install') {
      options.install = false;
      continue;
    }
    if (argument === '--display-name' || argument === '--description') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--display-name') {
        options.displayName = value;
      } else {
        options.description = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    positionals.push(argument);
  }

  if (positionals.length > 1) {
    throw new Error('Expected exactly one plugin name.');
  }
  options.name = positionals[0];

  if (!options.help && options.name === undefined) {
    throw new Error('A plugin name is required.');
  }

  return options;
}

export async function createPlugin({
  description,
  displayName,
  dryRun = false,
  install = true,
  name,
  now = new Date(),
  repoRoot = defaultRepoRoot,
}) {
  const shortName = normalizePluginName(name);
  const packageName = `${packagePrefix}${shortName}`;
  const directoryName = `${directoryPrefix}${shortName}`;
  const resolvedRepoRoot = path.resolve(repoRoot);
  const packagesDirectory = path.join(resolvedRepoRoot, 'packages');
  const targetDirectory = path.join(packagesDirectory, directoryName);
  const resolvedDisplayName = validateTextOption(
    displayName ?? `${toTitleCase(shortName)} App Plugin`,
    '--display-name',
  );
  const resolvedDescription = validateTextOption(
    description ?? `${resolvedDisplayName}.`,
    '--description',
  );

  await access(packagesDirectory, constants.W_OK);
  if (await pathExists(targetDirectory)) {
    throw new Error(`Target already exists: ${targetDirectory}`);
  }

  const files = createScaffoldFiles({
    packageName,
    shortName,
    displayName: resolvedDisplayName,
    description: resolvedDescription,
    datePrefix: formatDatePrefix(now),
  });

  if (dryRun) {
    return {
      directoryName,
      files: [...files.keys()],
      packageName,
      shortName,
      targetDirectory,
    };
  }

  let targetCreated = false;
  try {
    await mkdir(targetDirectory);
    targetCreated = true;
    await Promise.all(
      [...new Set([...files.keys()].map((file) => path.dirname(file)))]
        .filter((directory) => directory !== '.')
        .map((directory) =>
          mkdir(path.join(targetDirectory, directory), { recursive: true }),
        ),
    );
    await Promise.all(
      [...files].map(([file, contents]) =>
        writeFile(path.join(targetDirectory, file), contents, {
          encoding: 'utf8',
          flag: 'wx',
        }),
      ),
    );
  } catch (error) {
    if (targetCreated) {
      await rm(targetDirectory, { force: true, recursive: true });
    }
    throw error;
  }

  if (install) {
    synchronizeWorkspace(resolvedRepoRoot, targetDirectory);
  }

  return {
    directoryName,
    files: [...files.keys()],
    packageName,
    shortName,
    targetDirectory,
  };
}

export function normalizePluginName(value) {
  if (typeof value !== 'string') {
    throw new Error('A plugin name is required.');
  }

  let shortName = value.trim();
  if (shortName.startsWith(packagePrefix)) {
    shortName = shortName.slice(packagePrefix.length);
  } else if (shortName.startsWith(directoryPrefix)) {
    shortName = shortName.slice(directoryPrefix.length);
  }

  if (!pluginNamePattern.test(shortName)) {
    throw new Error(
      'Plugin name must start with a lowercase letter and contain only lowercase letters, numbers, and single hyphens.',
    );
  }

  return shortName;
}

function validateTextOption(value, option) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${option} cannot be empty.`);
  }
  if (/\r|\n/u.test(normalized)) {
    throw new Error(`${option} must be a single line.`);
  }
  return normalized;
}

function toTitleCase(value) {
  return value
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function toPascalCase(value) {
  return value
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function formatDatePrefix(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('The scaffold date must be a valid Date.');
  }

  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('');
}

function createScaffoldFiles({
  packageName,
  shortName,
  displayName,
  description,
  datePrefix,
}) {
  const symbolName = toPascalCase(shortName);
  const collectionName = `appPlugin${symbolName}Records`;
  const migrationName = `${datePrefix}0001_${shortName.replaceAll('-', '_')}_create_records`;
  const seedName = `${datePrefix}0002_${shortName.replaceAll('-', '_')}_create_welcome_record`;
  const packageJson = {
    name: packageName,
    displayName,
    description,
    version: '0.0.1',
    type: 'module',
    prettier: '@nocobase/dev-config/prettier',
    engines: {
      node: '>=24.0.0',
    },
    exports: {
      './client/bootstrap': {
        types: './client/bootstrap.ts',
        import: './client/bootstrap.ts',
      },
      './client/routes': {
        types: './client/routes.ts',
        import: './client/routes.ts',
      },
      './client/providers': {
        types: './client/providers.ts',
        import: './client/providers.ts',
      },
      './package.json': './package.json',
    },
    publishConfig: {
      access: 'public',
      exports: {
        './client/bootstrap': {
          types: './dist/client/bootstrap.d.ts',
          import: './dist/client/bootstrap.js',
        },
        './client/routes': {
          types: './dist/client/routes.d.ts',
          import: './dist/client/routes.js',
        },
        './client/providers': {
          types: './dist/client/providers.d.ts',
          import: './dist/client/providers.js',
        },
        './package.json': './package.json',
      },
    },
    nocobase: {
      plugin: {
        client: {
          bootstrap: './client/bootstrap',
          routes: './client/routes',
          providers: './client/providers',
        },
        database: {
          migrations: './database/migrations',
          seeds: './database/seeds',
        },
      },
    },
    scripts: {
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
    },
    dependencies: {
      '@nocobase/app-server-kit': 'workspace:^',
      '@nocobase/app-database': 'workspace:^',
      '@nocobase/service-provider': 'workspace:^',
      hono: 'catalog:',
    },
    peerDependencies: {
      '@nocobase/app-client': '^0.1.0',
      react: '^19.0.0',
    },
    devDependencies: {
      '@nocobase/app-client': 'workspace:*',
      '@nocobase/dev-config': 'workspace:*',
      '@types/node': 'catalog:',
      '@types/react': 'catalog:',
      eslint: 'catalog:',
      prettier: 'catalog:',
      react: 'catalog:',
      typescript: 'catalog:',
      vitest: 'catalog:',
    },
  };

  return new Map([
    ['.prettierignore', 'dist/\n'],
    [
      'README.md',
      `# ${packageName}\n\n${description}\n\nThis scaffold includes disabled database migration and seed examples, a convention-based server ServiceProvider, an HTTP route at \`/${shortName}\`, and empty client bootstrap, routes, and providers entries. See [database/README.md](database/README.md) to enable the database examples.\n`,
    ],
    [
      'database/README.md',
      `# Database examples\n\nThe files in \`migrations/\` and \`seeds/\` end in \`.ts.example\`, so NocoBase does not load or execute them.\n\nTo enable an example, remove only the final \`.example\` suffix:\n\n\`\`\`text\n${migrationName}.ts.example\n${migrationName}.ts\n\n${seedName}.ts.example\n${seedName}.ts\n\`\`\`\n\nThe exported \`name\` must match the filename without the executable extension. If you rename an enabled \`.ts\` file, update its \`name\` as well.\n`,
    ],
    [
      `database/migrations/${migrationName}.ts.example`,
      `import { defineMigration, type MigrationDefinition } from '@nocobase/app-database';\n\nconst migration: MigrationDefinition = defineMigration({\n  name: '${migrationName}',\n\n  async up({ builder }) {\n    await builder.createCollection(\n      '${collectionName}',\n      (collection) => {\n        collection.increments('id');\n        collection.string('name', { length: 255, nullable: false });\n        collection.datetime('createdAt', { nullable: false });\n      },\n    );\n  },\n\n  async down({ builder }) {\n    await builder.dropCollection('${collectionName}');\n  },\n});\n\nexport default migration;\n`,
    ],
    [
      `database/seeds/${seedName}.ts.example`,
      `import { defineSeed, type SeedDefinition } from '@nocobase/app-database';\n\nconst seed: SeedDefinition = defineSeed({\n  name: '${seedName}',\n\n  async run({ query }) {\n    await query\n      .insertInto('${collectionName}')\n      .values({\n        name: 'Welcome from ${packageName}',\n        createdAt: new Date(),\n      })\n      .execute();\n  },\n});\n\nexport default seed;\n`,
    ],
    [
      'eslint.config.js',
      `import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';\n\nexport default createClientLibraryConfig({\n  tsconfigRootDir: import.meta.dirname,\n});\n`,
    ],
    ['package.json', `${JSON.stringify(packageJson, null, 2)}\n`],
    [
      'client/bootstrap.ts',
      `import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';\n\nconst bootstrap: AppClientPluginBootstrap = () => {\n  // Register imperative client capabilities here.\n};\n\nexport default bootstrap;\n`,
    ],
    [
      'client/routes.ts',
      `import {\n  defineClientRoutes,\n  type AppClientRouteDefinition,\n} from '@nocobase/app-client/plugins';\n\nconst routes: readonly AppClientRouteDefinition[] = defineClientRoutes([]);\n\nexport default routes;\n`,
    ],
    [
      'client/providers.ts',
      `import {\n  defineClientProviders,\n  type AppClientProviderDefinition,\n} from '@nocobase/app-client/plugins';\n\nconst providers: readonly AppClientProviderDefinition[] = defineClientProviders(\n  [],\n);\n\nexport default providers;\n`,
    ],
    [
      'server/provider.ts',
      `import {\n  ServiceProvider,\n  type ServiceContainer,\n} from '@nocobase/service-provider';\n\nexport interface ${symbolName}ProviderApplication {\n  readonly container: ServiceContainer;\n}\n\nexport default class ${symbolName}Provider extends ServiceProvider<${symbolName}ProviderApplication> {\n  public readonly name: string = '${packageName}';\n}\n`,
    ],
    [
      'server/routes/index.ts',
      `import type { AppPluginRoutesApplication } from '@nocobase/app-server-kit/plugins';\nimport { Hono } from 'hono';\n\nexport default function register${symbolName}Routes({\n  router,\n}: AppPluginRoutesApplication): void {\n  const routes = new Hono();\n\n  routes.get('/', (context) =>\n    context.json({\n      plugin: '${packageName}',\n      message: 'Hello from ${displayName}',\n    }),\n  );\n\n  router.route('/${shortName}', routes);\n}\n`,
    ],
    [
      'tests/provider.test.ts',
      `import { ServiceContainer } from '@nocobase/service-provider';\nimport { describe, expect, it } from 'vitest';\n\nimport ${symbolName}Provider from '../server/provider.js';\n\ndescribe('${packageName} provider', () => {\n  it('uses the plugin package name', () => {\n    const provider = new ${symbolName}Provider({\n      container: new ServiceContainer(),\n    });\n\n    expect(provider.name).toBe('${packageName}');\n  });\n});\n`,
    ],
    [
      'tests/database.test.ts',
      `import { fileURLToPath } from 'node:url';\n\nimport { validateMigrations, validateSeeds } from '@nocobase/app-database';\nimport { describe, expect, it } from 'vitest';\n\ndescribe('${packageName} database', () => {\n  it('keeps database examples disabled by default', async () => {\n    const migrationsDirectory = fileURLToPath(\n      new URL('../database/migrations', import.meta.url),\n    );\n    const seedsDirectory = fileURLToPath(\n      new URL('../database/seeds', import.meta.url),\n    );\n\n    await expect(validateMigrations(migrationsDirectory)).resolves.toEqual([]);\n    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);\n  });\n});\n`,
    ],
    [
      'tests/client.test.ts',
      `import { describe, expect, it } from 'vitest';\n\nimport bootstrap from '../client/bootstrap.js';\nimport providers from '../client/providers.js';\nimport routes from '../client/routes.js';\n\ndescribe('${packageName} client', () => {\n  it('starts with empty client contributions', () => {\n    expect(bootstrap).toBeTypeOf('function');\n    expect(routes).toEqual([]);\n    expect(providers).toEqual([]);\n  });\n});\n`,
    ],
    [
      'tests/routes.test.ts',
      `import { createConfigPaths } from '@nocobase/app-server-kit/config';\nimport { ServiceContainer } from '@nocobase/service-provider';\nimport { Hono } from 'hono';\nimport { describe, expect, it } from 'vitest';\n\nimport register${symbolName}Routes from '../server/routes/index.js';\n\ndescribe('${packageName} routes', () => {\n  it('registers its HTTP route', async () => {\n    const router = new Hono();\n\n    register${symbolName}Routes({\n      appName: 'main',\n      publicBasePath: '',\n      config: { app: { name: 'main', publicBasePath: '' } },\n      paths: createConfigPaths({ rootDir: '/missing' }),\n      router,\n      container: new ServiceContainer(),\n    });\n\n    const response = await router.request('/${shortName}');\n\n    expect(response.status).toBe(200);\n    await expect(response.json()).resolves.toEqual({\n      plugin: '${packageName}',\n      message: 'Hello from ${displayName}',\n    });\n  });\n});\n`,
    ],
    [
      'tsconfig.json',
      `{\n  "extends": "@nocobase/dev-config/tsconfig/server-library.json",\n  "compilerOptions": {\n    "jsx": "react-jsx",\n    "lib": ["ES2022", "DOM", "DOM.Iterable"],\n    "rootDir": ".",\n    "outDir": "dist"\n  },\n  "include": [\n    "database/**/*.ts",\n    "server/**/*.ts",\n    "client/**/*.ts",\n    "client/**/*.tsx"\n  ]\n}\n`,
    ],
  ]);
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function synchronizeWorkspace(repoRoot, targetDirectory) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpm, ['install', '--no-frozen-lockfile'], {
    cwd: repoRoot,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `pnpm install failed. The generated plugin was kept at ${targetDirectory}.`,
    );
  }
}

async function main() {
  try {
    const options = parseCreatePluginArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const result = await createPlugin(options);
    if (options.dryRun) {
      console.log(
        `Would create ${result.packageName} at ${result.targetDirectory}`,
      );
      for (const file of result.files) {
        console.log(`  ${file}`);
      }
      return;
    }

    console.log(`Created ${result.packageName} at ${result.targetDirectory}`);
    if (!options.install) {
      console.log(
        'Skipped dependency installation. Run CI=true pnpm install --no-frozen-lockfile before committing.',
      );
    }
    console.log(
      `Next: register ${result.packageName} in the target application's package.json.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run pnpm plugin:create --help for usage.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === scriptPath) {
  await main();
}
