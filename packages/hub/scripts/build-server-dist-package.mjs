import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const databaseRuntimePackages = ['better-sqlite3', 'knex'];

const toPosix = (value) => value.split(path.sep).join('/');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const walkFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === 'node_modules') return [];

      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
    })
    .sort((left, right) => left.localeCompare(right));
};

const getPackageName = (specifier) => {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:')
  ) {
    return undefined;
  }

  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

const findBareImports = (content) => {
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const packageName = getPackageName(match[1]);
      if (packageName) specifiers.add(packageName);
    }
  }

  return specifiers;
};

const getDeclaredVersion = (packageJson, packageName) => {
  const version =
    packageJson.dependencies?.[packageName] ??
    packageJson.optionalDependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName] ??
    packageJson.peerDependencies?.[packageName];

  if (!version || /^(?:workspace|catalog):/.test(version)) return undefined;
  return version.replace(/^[~^]/, '');
};

const findInstalledVersion = (packageName, packageRoot) => {
  const packagePath = path.join(
    packageRoot,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );
  return fs.existsSync(packagePath) ? readJson(packagePath).version : undefined;
};

const listWorkspaceVersions = (workspacePackagesDir) => {
  if (!fs.existsSync(workspacePackagesDir)) return new Map();

  return new Map(
    fs
      .readdirSync(workspacePackagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        path.join(workspacePackagesDir, entry.name, 'package.json'),
      )
      .filter((packagePath) => fs.existsSync(packagePath))
      .map((packagePath) => readJson(packagePath))
      .filter(
        (packageJson) =>
          typeof packageJson.name === 'string' &&
          typeof packageJson.version === 'string',
      )
      .map((packageJson) => [packageJson.name, packageJson.version]),
  );
};

const buildServerDistPackage = ({
  rootDir: packageRoot = rootDir,
  workspacePackagesDir = path.resolve(packageRoot, '..'),
  distDir = path.join(packageRoot, 'dist'),
} = {}) => {
  const rootPackagePath = path.join(packageRoot, 'package.json');
  const distPackagePath = path.join(distDir, 'package.json');

  if (!fs.existsSync(path.join(distDir, 'server'))) {
    throw new Error('Missing dist/server. Run pnpm build first.');
  }

  const rootPackage = readJson(rootPackagePath);
  const workspaceVersions = listWorkspaceVersions(workspacePackagesDir);
  const packageNames = new Set(databaseRuntimePackages);
  const serverFiles = walkFiles(path.join(distDir, 'server')).filter((file) =>
    /\.[cm]?js$/.test(file),
  );

  for (const file of serverFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const packageName of findBareImports(content)) {
      packageNames.add(packageName);
    }
  }

  const dependencies = Object.fromEntries(
    [...packageNames]
      .sort((left, right) => left.localeCompare(right))
      .map((packageName) => {
        const version =
          findInstalledVersion(packageName, packageRoot) ??
          workspaceVersions.get(packageName) ??
          getDeclaredVersion(rootPackage, packageName);

        if (!version) {
          throw new Error(
            `Could not find a declared, installed, or workspace version for ${packageName}`,
          );
        }

        return [packageName, version];
      }),
  );

  fs.rmSync(path.join(distDir, 'vendor'), { recursive: true, force: true });

  const distPackage = {
    name: rootPackage.name,
    version: rootPackage.version ?? '0.0.0',
    type: 'module',
    main: './server/embedded.js',
    exports: {
      '.': './server/embedded.js',
      './embedded': './server/embedded.js',
      './standalone': './server/standalone.js',
    },
    scripts: {
      start: 'node ./server/standalone.js',
    },
    engines: rootPackage.engines ?? {
      node: '>=24.0.0',
    },
    files: ['client', 'server', 'resources/default-app'],
    publishConfig: {
      access: 'public',
    },
    dependencies,
  };

  fs.writeFileSync(
    distPackagePath,
    `${JSON.stringify(distPackage, null, 2)}\n`,
  );
  console.log(
    `Generated ${toPosix(
      path.relative(packageRoot, distPackagePath),
    )} with ${Object.keys(dependencies).length} Registry dependencies.`,
  );

  return distPackage;
};

buildServerDistPackage();
