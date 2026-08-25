import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const databaseRuntimeDrivers = ['better-sqlite3', 'pg', 'mysql2'];
const serverRuntimeDirs = ['server', 'database', 'scripts'];
const workspacePackagePatterns = [
  ['packages', '*'],
  ['apps', '*'],
  ['examples', '*'],
  ['examples', '*', 'apps', '*'],
  ['examples', '*', 'packages', '*'],
];

export function buildServerDistPackage(options) {
  const rootDir = path.resolve(options.rootDir);
  const workspaceRoot = findWorkspaceRoot(rootDir);
  const distDir = path.join(rootDir, 'dist');
  const rootPackagePath = path.join(rootDir, 'package.json');
  const distPackagePath = path.join(distDir, 'package.json');
  const vendorDir = path.join(distDir, 'vendor');

  if (!fs.existsSync(path.join(distDir, 'server'))) {
    throw new Error('Missing dist/server. Run pnpm build first.');
  }

  const rootPackage = readJson(rootPackagePath);
  const configuredPluginNames = Object.keys(
    rootPackage.nocobase?.plugins ?? {},
  );
  const workspaceRootPackage = readJson(
    path.join(workspaceRoot, 'package.json'),
  );
  const workspacePackages = listWorkspacePackages(workspaceRoot);
  const files = serverRuntimeDirs.flatMap((runtimeDir) =>
    walkFiles(path.join(distDir, runtimeDir)).filter((file) =>
      /\.[cm]?js$/.test(file),
    ),
  );
  const workspacePackageNames = new Set();
  const externalPackageNames = new Map();

  const getVendorPackagePath = (packageName) =>
    path.join(vendorDir, ...packageName.split('/'));

  const addExternalPackage = (
    packageName,
    sourcePackageDir = rootDir,
    sourcePackage = rootPackage,
  ) => {
    if (externalPackageNames.has(packageName)) return;

    const version =
      getInstalledVersion(packageName, sourcePackageDir) ??
      getInstalledVersion(packageName, rootDir) ??
      getInstalledVersion(packageName, workspaceRoot) ??
      getDeclaredVersion(sourcePackage, packageName) ??
      getDeclaredVersion(rootPackage, packageName) ??
      getDeclaredVersion(workspaceRootPackage, packageName);

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

    if (packageName === '@nocobase/database') {
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

  fs.rmSync(vendorDir, { recursive: true, force: true });
  for (const packageName of workspacePackageNames) {
    copyWorkspacePackage({
      packageName,
      packageDir: workspacePackages.get(packageName),
      rootDir,
      targetDir: getVendorPackagePath(packageName),
    });
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
  const scripts = {
    start: 'node ./server/standalone.js',
  };

  if (fs.existsSync(path.join(distDir, 'scripts', 'migrate.js'))) {
    scripts.migrate = 'node ./scripts/migrate.js';
  }

  if (fs.existsSync(path.join(distDir, 'scripts', 'seed.js'))) {
    scripts.seed = 'node ./scripts/seed.js';
  }

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
    scripts,
    engines: rootPackage.engines ??
      workspaceRootPackage.engines ?? { node: '>=24' },
    dependencies,
  };

  writeJson(distPackagePath, distPackage);

  console.log(
    `Generated ${toPosix(path.relative(rootDir, distPackagePath))} with ${
      Object.keys(dependencies).length
    } production dependencies and ${workspacePackageNames.size} vendored workspace packages.`,
  );

  return {
    dependencies: Object.keys(dependencies),
    distPackagePath,
    workspacePackages: [...workspacePackageNames],
  };
}

export function finalizeServerDistPackage(options) {
  const rootDir = path.resolve(options.rootDir);
  const distDir = path.join(rootDir, 'dist');
  const distPackagePath = path.join(distDir, 'package.json');
  const distPackage = readJson(distPackagePath);
  const dependencies = distPackage.dependencies ?? {};
  const materialized = [];

  for (const [packageName, version] of Object.entries(dependencies)) {
    if (typeof version !== 'string' || !version.startsWith('file:')) continue;

    const sourceDir = path.resolve(distDir, version.slice('file:'.length));
    const targetDir = path.join(
      distDir,
      'node_modules',
      ...packageName.split('/'),
    );
    assertInside(distDir, sourceDir, `Vendored dependency ${packageName}`);
    assertInside(distDir, targetDir, `Installed dependency ${packageName}`);

    if (!fs.statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(
        `Missing vendored dependency ${packageName} at ${sourceDir}`,
      );
    }

    const target = fs.lstatSync(targetDir, { throwIfNoEntry: false });
    if (target?.isSymbolicLink()) {
      fs.rmSync(targetDir);
    } else if (target && !target.isDirectory()) {
      throw new Error(`Installed dependency ${packageName} is not a directory`);
    }

    const sourceSymbolicLinks = listSymbolicLinks(sourceDir);
    if (sourceSymbolicLinks.length) {
      throw new Error(
        `Vendored dependency ${packageName} must not contain symbolic links: ${sourceSymbolicLinks.join(', ')}`,
      );
    }

    const targetNeedsRefresh =
      !fs.existsSync(targetDir) ||
      listSymbolicLinks(targetDir).length > 0 ||
      hashDirectory(targetDir) !== hashDirectory(sourceDir);

    if (targetNeedsRefresh) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(sourceDir, targetDir, {
        recursive: true,
        dereference: true,
        errorOnExist: true,
        force: false,
      });
      materialized.push(packageName);
    }
  }

  fs.rmSync(path.join(distDir, 'node_modules', '.bin'), {
    recursive: true,
    force: true,
  });

  const symbolicLinks = listSymbolicLinks(distDir);
  if (symbolicLinks.length) {
    throw new Error(
      `Server dist must not contain symbolic links: ${symbolicLinks.join(', ')}`,
    );
  }

  console.log(
    `Finalized server dist with ${materialized.length} materialized workspace dependencies.`,
  );
  return { materialized, symbolicLinks };
}

function findWorkspaceRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not find pnpm-workspace.yaml above ${startDir}`);
    }
    currentDir = parentDir;
  }
}

function listWorkspacePackages(workspaceRoot) {
  const packages = new Map();

  for (const pattern of workspacePackagePatterns) {
    for (const packageDir of resolveDirectoryPattern(workspaceRoot, pattern)) {
      const packagePath = path.join(packageDir, 'package.json');
      if (!fs.existsSync(packagePath)) continue;

      const packageName = readJson(packagePath).name;
      if (typeof packageName === 'string') {
        packages.set(packageName, packageDir);
      }
    }
  }

  return packages;
}

function resolveDirectoryPattern(baseDir, pattern) {
  let directories = [baseDir];

  for (const segment of pattern) {
    directories = directories.flatMap((directory) => {
      if (segment !== '*') {
        const nextDirectory = path.join(directory, segment);
        return fs.existsSync(nextDirectory) ? [nextDirectory] : [];
      }

      if (!fs.existsSync(directory)) return [];
      return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(directory, entry.name));
    });
  }

  return directories;
}

function copyWorkspacePackage({ packageName, packageDir, rootDir, targetDir }) {
  const packageJson = readJson(path.join(packageDir, 'package.json'));
  const sourceDistDir = path.join(packageDir, 'dist');

  if (!fs.existsSync(sourceDistDir)) {
    throw new Error(
      `Missing ${path.relative(rootDir, sourceDistDir)}. Build ${packageName} before generating the server package.`,
    );
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceDistDir, path.join(targetDir, 'dist'), { recursive: true });
  writeJson(
    path.join(targetDir, 'package.json'),
    createRuntimePackageJson(packageJson),
  );
}

function createRuntimePackageJson(packageJson) {
  return {
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
  };
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === 'node_modules') return [];

      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
    })
    .sort((left, right) => left.localeCompare(right));
}

function listSymbolicLinks(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) return [entryPath];
      return entry.isDirectory() ? listSymbolicLinks(entryPath) : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function hashDirectory(directory) {
  const hash = createHash('sha256');

  for (const file of walkAllFiles(directory)) {
    const relative = toPosix(path.relative(directory, file));
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function walkAllFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkAllFiles(entryPath) : [entryPath];
    })
    .sort((left, right) => left.localeCompare(right));
}

function findBareImports(content) {
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
}

function getPackageName(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:')
  ) {
    return undefined;
  }

  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function getInstalledVersion(packageName, fromDir) {
  const packagePath = path.join(
    fromDir,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );
  return fs.existsSync(packagePath) ? readJson(packagePath).version : undefined;
}

function getDeclaredVersion(packageJson, packageName) {
  const version =
    packageJson.dependencies?.[packageName] ??
    packageJson.optionalDependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName] ??
    packageJson.peerDependencies?.[packageName];

  if (!version) return undefined;
  return version.replace(/^[~^]/, '');
}

function isWorkspaceVersion(version) {
  return version?.startsWith('workspace:');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function assertInside(rootDir, targetPath, label) {
  const relative = path.relative(rootDir, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside ${rootDir}`);
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
