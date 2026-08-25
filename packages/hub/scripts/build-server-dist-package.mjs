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

const getDeclaredVersion = (packageJson, packageName) => {
  const version =
    packageJson.dependencies?.[packageName] ??
    packageJson.optionalDependencies?.[packageName] ??
    packageJson.devDependencies?.[packageName] ??
    packageJson.peerDependencies?.[packageName];

  if (!version || version.startsWith('workspace:')) return undefined;
  return version.replace(/^[~^]/, '');
};

const findInstalledPackageJson = (packageName, fromDir, stopDir) => {
  let directory = path.resolve(fromDir);
  const boundary = path.resolve(stopDir);

  while (directory.startsWith(boundary)) {
    const packagePath = path.join(
      directory,
      'node_modules',
      ...packageName.split('/'),
      'package.json',
    );
    if (fs.existsSync(packagePath)) return packagePath;

    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  return undefined;
};

const createRuntimePackageJson = (packageJson, dependencies) => {
  const runtimePackage = {
    name: packageJson.name,
    version: packageJson.version ?? '0.0.0',
    private: true,
    type: packageJson.type,
    main: packageJson.main,
    types: packageJson.types,
    exports: packageJson.publishConfig?.exports ?? packageJson.exports,
    engines: packageJson.engines,
    dependencies,
  };

  return Object.fromEntries(
    Object.entries(runtimePackage).filter(([, value]) => value !== undefined),
  );
};

const buildServerDistPackage = ({
  rootDir: packageRoot = rootDir,
  workspacePackagesDir = path.resolve(packageRoot, '..'),
  distDir = path.join(packageRoot, 'dist'),
} = {}) => {
  const rootPackagePath = path.join(packageRoot, 'package.json');
  const distPackagePath = path.join(distDir, 'package.json');
  const vendorDir = path.join(distDir, 'vendor');

  if (!fs.existsSync(path.join(distDir, 'server'))) {
    throw new Error('Missing dist/server. Run pnpm build first.');
  }

  const rootPackage = readJson(rootPackagePath);
  const workspacePackages = listWorkspacePackages(workspacePackagesDir);
  const workspacePackageNames = new Set();
  const externalPackageVersions = new Map();
  const packageJsonByName = new Map([[rootPackage.name, rootPackage]]);
  const packageDirByName = new Map([[rootPackage.name, packageRoot]]);

  const addExternalPackage = (
    packageName,
    sourcePackageDir = packageRoot,
    sourcePackage = rootPackage,
  ) => {
    if (externalPackageVersions.has(packageName)) return;

    const installedPackagePath =
      findInstalledPackageJson(
        packageName,
        sourcePackageDir,
        path.dirname(workspacePackagesDir),
      ) ??
      findInstalledPackageJson(
        packageName,
        packageRoot,
        path.dirname(workspacePackagesDir),
      );
    const version =
      (installedPackagePath
        ? readJson(installedPackagePath).version
        : undefined) ??
      getDeclaredVersion(sourcePackage, packageName) ??
      getDeclaredVersion(rootPackage, packageName);

    if (!version) {
      throw new Error(
        `Could not find a declared or installed version for ${packageName}`,
      );
    }

    externalPackageVersions.set(packageName, version);
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
    packageJsonByName.set(packageName, packageJson);
    packageDirByName.set(packageName, packageDir);

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
    };
    for (const dependencyName of Object.keys(dependencies)) {
      if (workspacePackages.has(dependencyName)) {
        addPackage(dependencyName);
      } else {
        addExternalPackage(dependencyName, packageDir, packageJson);
      }
    }
  };

  const serverFiles = walkFiles(path.join(distDir, 'server')).filter((file) =>
    /\.[cm]?js$/.test(file),
  );
  for (const file of serverFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const packageName of findBareImports(content)) {
      addPackage(packageName);
    }
  }

  // Knex loads dialects dynamically, so a static import scan cannot discover
  // the SQLite native driver.  Hub's built-in database is SQLite; pin both
  // parts of that runtime explicitly in the deployable package.
  for (const packageName of databaseRuntimePackages) {
    addExternalPackage(packageName);
  }

  fs.rmSync(vendorDir, { recursive: true, force: true });
  for (const packageName of [...workspacePackageNames].sort()) {
    const packageDir = packageDirByName.get(packageName);
    const packageJson = packageJsonByName.get(packageName);
    const sourceDistDir = path.join(packageDir, 'dist');
    if (!fs.existsSync(sourceDistDir)) {
      throw new Error(
        `Missing ${path.relative(packageRoot, sourceDistDir)}. Build ${packageName} before generating the server package.`,
      );
    }

    const targetDir = path.join(vendorDir, ...packageName.split('/'));
    const runtimeDependencies = {};
    for (const dependencyName of Object.keys({
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
    }).sort()) {
      if (workspacePackages.has(dependencyName)) {
        runtimeDependencies[dependencyName] = toRelativeFileDependency(
          targetDir,
          path.join(vendorDir, ...dependencyName.split('/')),
        );
      } else {
        runtimeDependencies[dependencyName] =
          externalPackageVersions.get(dependencyName);
      }
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(sourceDistDir, path.join(targetDir, 'dist'), {
      recursive: true,
      filter: (source) =>
        !isExcludedPackagedPath(path.relative(sourceDistDir, source)),
    });
    writeJson(
      path.join(targetDir, 'package.json'),
      createRuntimePackageJson(packageJson, runtimeDependencies),
    );
  }

  const dependencies = Object.fromEntries([
    ...[...externalPackageVersions.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    ...[...workspacePackageNames]
      .sort((left, right) => left.localeCompare(right))
      .map((packageName) => [
        packageName,
        `file:${toPosix(
          path.relative(
            distDir,
            path.join(vendorDir, ...packageName.split('/')),
          ),
        )}`,
      ]),
  ]);

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
    files: ['client', 'server', 'vendor', 'resources/default-app'],
    publishConfig: {
      access: 'public',
    },
    dependencies,
  };

  writeJson(distPackagePath, distPackage);
  console.log(
    `Generated ${toPosix(
      path.relative(packageRoot, distPackagePath),
    )} with ${Object.keys(dependencies).length} production dependencies and ${workspacePackageNames.size} vendored workspace packages.`,
  );

  return distPackage;
};

const listWorkspacePackages = (workspacePackagesDir) => {
  if (!fs.existsSync(workspacePackagesDir)) return new Map();

  return new Map(
    fs
      .readdirSync(workspacePackagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(workspacePackagesDir, entry.name))
      .filter((packageDir) =>
        fs.existsSync(path.join(packageDir, 'package.json')),
      )
      .map((packageDir) => [
        readJson(path.join(packageDir, 'package.json')).name,
        packageDir,
      ])
      .filter(([name]) => typeof name === 'string'),
  );
};

const toRelativeFileDependency = (fromPackageDir, targetPackageDir) => {
  const relativePath = toPosix(path.relative(fromPackageDir, targetPackageDir));
  return `file:${relativePath.startsWith('.') ? relativePath : `./${relativePath}`}`;
};

const isExcludedPackagedPath = (relativePath) => {
  const normalized = toPosix(relativePath);
  if (!normalized) return false;
  const basename = path.posix.basename(normalized);
  return (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    ['tests', 'e2e', 'coverage', 'test-results'].some(
      (directory) =>
        normalized === directory || normalized.startsWith(`${directory}/`),
    )
  );
};

buildServerDistPackage();
