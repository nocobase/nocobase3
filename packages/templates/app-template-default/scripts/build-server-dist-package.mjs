import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listWorkspacePackages } from './workspace-packages.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const distDir = path.join(rootDir, 'dist');
const rootPackagePath = path.join(rootDir, 'package.json');
const distPackagePath = path.join(distDir, 'package.json');
const vendorDir = path.join(distDir, 'vendor');
const runtimeDirs = ['server', 'database', 'scripts'];
const databaseRuntimeDrivers = [
  'better-sqlite3',
  'pg',
  'mysql2',
  'oracledb',
  'tedious',
];

const toPosix = (value) => value.split(path.sep).join('/');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const writeJson = (file, value) => {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

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

const getInstalledVersion = (packageName, fromDir = rootDir) => {
  const packagePath = path.join(
    fromDir,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );

  if (!fs.existsSync(packagePath)) return undefined;
  return readJson(packagePath).version;
};

const getDeclaredVersion = (packageJson, packageName) => {
  const version =
    packageJson.dependencies?.[packageName] ??
    packageJson.optionalDependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName] ??
    packageJson.peerDependencies?.[packageName];

  if (!version) return undefined;
  return version.replace(/^[~^]/, '');
};

const isWorkspaceVersion = (version) => version?.startsWith('workspace:');

const getVendorPackagePath = (packageName) =>
  path.join(vendorDir, ...packageName.split('/'));

const createRuntimePackageJson = (packageJson) => ({
  name: packageJson.name,
  displayName: packageJson.displayName,
  description: packageJson.description,
  version: packageJson.version ?? '0.0.0',
  private: true,
  type: packageJson.type,
  main: packageJson.main,
  types: packageJson.types,
  exports: packageJson.publishConfig?.exports ?? packageJson.exports,
  engines: packageJson.engines,
  nocobase: packageJson.nocobase,
});

const copyWorkspacePackage = (packageName, packageDir) => {
  const packageJson = readJson(path.join(packageDir, 'package.json'));
  const sourceDistDir = path.join(packageDir, 'dist');

  if (!fs.existsSync(sourceDistDir)) {
    throw new Error(
      `Missing ${path.relative(rootDir, sourceDistDir)}. Build ${packageName} before generating the server package.`,
    );
  }

  const targetDir = getVendorPackagePath(packageName);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceDistDir, path.join(targetDir, 'dist'), { recursive: true });
  writeJson(
    path.join(targetDir, 'package.json'),
    createRuntimePackageJson(packageJson),
  );
};

if (!fs.existsSync(path.join(distDir, 'server'))) {
  throw new Error('Missing dist/server. Run pnpm build first.');
}

const rootPackage = readJson(rootPackagePath);
const configuredPluginNames = Object.keys(rootPackage.nocobase?.plugins ?? {});
const workspacePackages = listWorkspacePackages(rootDir);
const files = runtimeDirs.flatMap((runtimeDir) =>
  walkFiles(path.join(distDir, runtimeDir)).filter((file) =>
    /\.[cm]?js$/.test(file),
  ),
);
const workspacePackageNames = new Set();
const externalPackageNames = new Map();

const addExternalPackage = (
  packageName,
  sourcePackageDir = rootDir,
  sourcePackage = rootPackage,
) => {
  if (externalPackageNames.has(packageName)) return;

  const version =
    getInstalledVersion(packageName, sourcePackageDir) ??
    getInstalledVersion(packageName) ??
    getDeclaredVersion(sourcePackage, packageName) ??
    getDeclaredVersion(rootPackage, packageName);

  if (!version) {
    throw new Error(
      `Could not find a declared or installed version for ${packageName}`,
    );
  }

  externalPackageNames.set(packageName, version);
};

const addPackage = (packageName) => {
  const packageDir = workspacePackages.get(packageName);
  if (!packageDir) {
    addExternalPackage(packageName);
    return;
  }

  if (workspacePackageNames.has(packageName)) return;
  workspacePackageNames.add(packageName);

  const packageJson = readJson(path.join(packageDir, 'package.json'));
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  };

  for (const [dependencyName, dependencyVersion] of Object.entries(
    dependencies,
  )) {
    if (isWorkspaceVersion(dependencyVersion)) {
      addPackage(dependencyName);
    } else {
      addExternalPackage(dependencyName, packageDir, packageJson);
    }
  }

  if (packageName === '@nocobase/db') {
    for (const driver of databaseRuntimeDrivers) {
      addExternalPackage(driver, packageDir, packageJson);
    }
  }
};

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const packageName of findBareImports(content)) {
    addPackage(packageName);
  }
}

for (const packageName of configuredPluginNames) {
  addPackage(packageName);
}

for (const packageName of workspacePackageNames) {
  copyWorkspacePackage(packageName, workspacePackages.get(packageName));
}

const workspaceDependencies = Object.fromEntries(
  [...workspacePackageNames]
    .sort((left, right) => left.localeCompare(right))
    .map((packageName) => [
      packageName,
      `file:${toPosix(path.relative(distDir, getVendorPackagePath(packageName)))}`,
    ]),
);

const dependencies = Object.fromEntries([
  ...[...externalPackageNames.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  ),
  ...Object.entries(workspaceDependencies),
]);

const distPackage = {
  name: rootPackage.name,
  version: rootPackage.version ?? '0.0.0',
  private: true,
  type: 'module',
  nocobase: rootPackage.nocobase,
  main: './server/embedded.js',
  exports: {
    '.': './server/embedded.js',
    './embedded': './server/embedded.js',
    './standalone': './server/standalone.js',
  },
  scripts: {
    start: 'node ./server/standalone.js',
    migrate: 'node ./scripts/migrate.js',
    seed: 'node ./scripts/seed.js',
  },
  engines: rootPackage.engines ?? {
    node: '>=20',
  },
  dependencies,
};

writeJson(distPackagePath, distPackage);

console.log(
  `Generated ${toPosix(path.relative(rootDir, distPackagePath))} with ${
    Object.keys(dependencies).length
  } production dependencies and ${workspacePackageNames.size} vendored workspace packages.`,
);
