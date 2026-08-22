import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePluginName } from './create-plugin.mjs';

const packagePrefix = '@nocobase/app-plugin-';
const directoryPrefix = 'app-plugin-';
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const skippedDirectoryNames = new Set([
  '.git',
  '.pnpm',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

const help = `Remove a NocoBase plugin package from packages/.

Usage:
  pnpm plugin:remove <name> [options]

Arguments:
  <name>        Short kebab-case name, for example audit-log
                (full @nocobase/app-plugin-* names also work)

Options:
  --no-install  Do not synchronize pnpm-lock.yaml after removal
  --dry-run     Validate and print the target without removing it
  -h, --help    Show this help

Removal is refused while another workspace package references the plugin in a
dependency field or nocobase.plugins. Remove those registrations first.`;

export function parseRemovePluginArgs(args) {
  const options = {
    dryRun: false,
    help: false,
    install: true,
    name: undefined,
  };
  const positionals = [];

  for (const argument of args) {
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

export async function removePlugin({
  dryRun = false,
  install = true,
  name,
  repoRoot = defaultRepoRoot,
  synchronize = synchronizeWorkspace,
}) {
  const shortName = normalizePluginName(name);
  const packageName = `${packagePrefix}${shortName}`;
  const directoryName = `${directoryPrefix}${shortName}`;
  const resolvedRepoRoot = path.resolve(repoRoot);
  const packagesDirectory = path.join(resolvedRepoRoot, 'packages');
  const targetDirectory = path.join(packagesDirectory, directoryName);

  await access(packagesDirectory, constants.W_OK);
  await validatePluginTarget(targetDirectory, packageName);

  const references = await findWorkspaceReferences({
    packageName,
    repoRoot: resolvedRepoRoot,
    targetDirectory,
  });
  if (references.length > 0) {
    throw new Error(formatReferenceError(packageName, references));
  }

  const result = {
    directoryName,
    packageName,
    shortName,
    targetDirectory,
  };
  if (dryRun) {
    return result;
  }

  const backupDirectory = path.join(
    resolvedRepoRoot,
    `.plugin-remove-${directoryName}-${process.pid}-${Date.now()}`,
  );
  const lockfilePath = path.join(resolvedRepoRoot, 'pnpm-lock.yaml');
  const lockfileSnapshot = await readOptionalFile(lockfilePath);

  await rename(targetDirectory, backupDirectory);
  try {
    if (install) {
      synchronize(resolvedRepoRoot);
    }
    await rm(backupDirectory, { force: true, recursive: true });
  } catch (error) {
    const recoveryErrors = [];
    try {
      await rename(backupDirectory, targetDirectory);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }
    try {
      await restoreLockfile(lockfilePath, lockfileSnapshot);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }

    if (recoveryErrors.length > 0) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        `Plugin removal failed and recovery was incomplete for ${targetDirectory}.`,
        { cause: error },
      );
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Plugin removal failed and ${targetDirectory} was restored: ${reason}`,
      { cause: error },
    );
  }

  return result;
}

async function validatePluginTarget(targetDirectory, packageName) {
  let targetStats;
  try {
    targetStats = await lstat(targetDirectory);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      throw new Error(`Plugin does not exist: ${targetDirectory}`, {
        cause: error,
      });
    }
    throw error;
  }

  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) {
    throw new Error(
      `Plugin target must be a real directory: ${targetDirectory}`,
    );
  }

  const packageJsonPath = path.join(targetDirectory, 'package.json');
  const packageJson = await readJson(packageJsonPath);
  if (packageJson.name !== packageName) {
    throw new Error(
      `Refusing to remove ${targetDirectory}: expected package name ${packageName}, found ${String(packageJson.name)}.`,
    );
  }
}

async function findWorkspaceReferences({
  packageName,
  repoRoot,
  targetDirectory,
}) {
  const packageJsonPaths = [path.join(repoRoot, 'package.json')];
  for (const directory of ['packages', 'examples']) {
    const root = path.join(repoRoot, directory);
    if (await pathExists(root)) {
      packageJsonPaths.push(
        ...(await findPackageJsonFiles(root, targetDirectory)),
      );
    }
  }

  const references = [];
  for (const packageJsonPath of packageJsonPaths) {
    if (!(await pathExists(packageJsonPath))) {
      continue;
    }
    const packageJson = await readJson(packageJsonPath);
    const locations = [];

    for (const field of dependencyFields) {
      if (hasOwn(packageJson[field], packageName)) {
        locations.push(field);
      }
    }
    if (hasOwn(packageJson.nocobase?.plugins, packageName)) {
      locations.push('nocobase.plugins');
    }

    if (locations.length > 0) {
      references.push({
        locations,
        packageJsonPath: path
          .relative(repoRoot, packageJsonPath)
          .split(path.sep)
          .join('/'),
      });
    }
  }

  return references;
}

async function findPackageJsonFiles(directory, targetDirectory) {
  if (path.resolve(directory) === path.resolve(targetDirectory)) {
    return [];
  }

  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) {
        files.push(...(await findPackageJsonFiles(entryPath, targetDirectory)));
      }
      continue;
    }
    if (entry.isFile() && entry.name === 'package.json') {
      files.push(entryPath);
    }
  }
  return files;
}

function formatReferenceError(packageName, references) {
  const details = references
    .map(
      ({ locations, packageJsonPath }) =>
        `  ${packageJsonPath} (${locations.join(', ')})`,
    )
    .join('\n');
  return `Cannot remove ${packageName}; remove these workspace references first:\n${details}`;
}

async function readJson(file) {
  let contents;
  try {
    contents = await readFile(file, 'utf8');
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      throw new Error(`Required package.json does not exist: ${file}`, {
        cause: error,
      });
    }
    throw error;
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}.`, { cause: error });
  }
}

async function readOptionalFile(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
}

async function restoreLockfile(file, snapshot) {
  if (snapshot === undefined) {
    await rm(file, { force: true });
    return;
  }
  await writeFile(file, snapshot);
}

function synchronizeWorkspace(repoRoot) {
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
    throw new Error(`pnpm install failed with exit code ${result.status}.`);
  }
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return false;
    }
    throw error;
  }
}

function hasOwn(value, key) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function isNodeError(error, code) {
  return error !== null && typeof error === 'object' && error.code === code;
}

async function main() {
  try {
    const options = parseRemovePluginArgs(process.argv.slice(2));
    if (options.help) {
      console.log(help);
      return;
    }

    const result = await removePlugin(options);
    if (options.dryRun) {
      console.log(
        `Would remove ${result.packageName} from ${result.targetDirectory}`,
      );
      return;
    }

    console.log(`Removed ${result.packageName} from ${result.targetDirectory}`);
    if (!options.install) {
      console.log(
        'Skipped dependency installation. Run CI=true pnpm install --no-frozen-lockfile before committing.',
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error('Run pnpm plugin:remove --help for usage.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === scriptPath) {
  await main();
}
