import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export function archiveNameForPackage(packageName) {
  return `${packageName.replace(/^@/u, '').replaceAll('/', '-')}.tgz`;
}

export function findUnresolvedProtocols(value, fieldPath = []) {
  if (typeof value === 'string') {
    return /^(?:workspace|catalog):/u.test(value)
      ? [{ field: fieldPath.join('.'), value }]
      : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findUnresolvedProtocols(item, [...fieldPath, String(index)]),
    );
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      findUnresolvedProtocols(item, [...fieldPath, key]),
    );
  }

  return [];
}

export function hasTypeEntrypoints(manifest) {
  if (typeof manifest.types === 'string') return true;

  const visit = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (!Array.isArray(value) && typeof value.types === 'string') return true;
    return Object.values(value).some(visit);
  };

  return visit(manifest.exports);
}

export function validatePackageManifest(manifest, directory) {
  const errors = [];

  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    errors.push('name must be a non-empty string');
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    errors.push('version must be a non-empty string');
  }
  if (manifest.private === true) {
    errors.push('packages/ packages must not be private');
  }
  if (manifest.publishConfig?.access !== 'public') {
    errors.push('publishConfig.access must be "public"');
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.some((file) => typeof file !== 'string' || file.length === 0)
  ) {
    errors.push('files must be a non-empty array of strings');
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid publish metadata in ${path.join(directory, 'package.json')}:\n${errors
        .map((error) => `  - ${error}`)
        .join('\n')}`,
    );
  }
}

export async function discoverPackages(repoRoot) {
  const packagesDirectory = path.join(repoRoot, 'packages');
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const directory = path.join(packagesDirectory, entry.name);
    const manifestPath = path.join(directory, 'package.json');
    let manifest;

    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    validatePackageManifest(manifest, directory);

    try {
      const changelog = await readFile(
        path.join(directory, 'CHANGELOG.md'),
        'utf8',
      );
      if (!changelog.startsWith(`# ${manifest.name}\n`)) {
        throw new Error(
          `${manifest.name} CHANGELOG.md must start with "# ${manifest.name}".`,
        );
      }
      if (
        manifest.version !== '0.0.0' &&
        !changelog.includes(`## ${manifest.version}\n`)
      ) {
        throw new Error(
          `${manifest.name} CHANGELOG.md must include version ${manifest.version}.`,
        );
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`${manifest.name} must include CHANGELOG.md.`, {
          cause: error,
        });
      }
      throw error;
    }

    packages.push({ directory, manifest });
  }

  return packages.sort((left, right) =>
    left.manifest.name.localeCompare(right.manifest.name),
  );
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      reject(
        new Error(
          `${command} ${args.join(' ')} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.${output ? `\n${output}` : ''}`,
        ),
      );
    });
  });
}

export async function readPackedManifest(archivePath) {
  const { stdout } = await execFileAsync('tar', [
    '-xOf',
    archivePath,
    'package/package.json',
  ]);
  return JSON.parse(stdout);
}

export function validatePackedManifest(sourceManifest, packedManifest) {
  if (
    packedManifest.name !== sourceManifest.name ||
    packedManifest.version !== sourceManifest.version
  ) {
    throw new Error(
      `Packed identity mismatch for ${sourceManifest.name}: expected ${sourceManifest.name}@${sourceManifest.version}, received ${packedManifest.name}@${packedManifest.version}.`,
    );
  }

  const unresolved = findUnresolvedProtocols(packedManifest);
  if (unresolved.length === 0) return;

  throw new Error(
    `Unresolved workspace/catalog protocols in ${sourceManifest.name}:\n${unresolved
      .map(({ field, value }) => `  ${field}: ${value}`)
      .join('\n')}`,
  );
}

async function smokeTestDevConfig(archivePath, packageDirectory) {
  const extractDirectory = await mkdtemp(
    path.join(packageDirectory, '.pack-check-'),
  );

  try {
    await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDirectory]);

    for (const entry of [
      'eslint/index.js',
      'prettier/index.js',
      'vitest/node.js',
      'vitest/react.js',
      'vite/portal.js',
    ]) {
      await import(
        pathToFileURL(path.join(extractDirectory, 'package', 'dist', entry))
          .href
      );
    }
  } finally {
    await rm(extractDirectory, { force: true, recursive: true });
  }
}

async function checkPackage({ archivePath, packageInfo, repoRoot, env }) {
  const { directory, manifest } = packageInfo;

  await rm(archivePath, { force: true });
  await run('pnpm', ['pack', '--out', archivePath], {
    cwd: directory,
    env,
  });

  const packedManifest = await readPackedManifest(archivePath);
  validatePackedManifest(manifest, packedManifest);
  await run('pnpm', ['exec', 'publint', 'run', archivePath], {
    cwd: repoRoot,
    env,
  });

  if (hasTypeEntrypoints(packedManifest)) {
    await run('pnpm', ['exec', 'attw', archivePath, '--profile', 'esm-only'], {
      cwd: repoRoot,
      env,
    });
  }

  if (manifest.name === '@nocobase/dev-config') {
    await smokeTestDevConfig(archivePath, directory);
  }
}

export async function packCheck({
  env = process.env,
  repoRoot = path.resolve(import.meta.dirname, '..'),
} = {}) {
  const packages = await discoverPackages(repoRoot);
  const configuredDirectory = env.PACK_DIR?.trim();
  const packDirectory = configuredDirectory
    ? path.resolve(configuredDirectory)
    : await mkdtemp(path.join(tmpdir(), 'nocobase-pack-check-'));
  const checkEnv = { ...env, PACK_DIR: packDirectory };

  await mkdir(packDirectory, { recursive: true });
  console.log(`Checking ${packages.length} publishable packages...`);

  try {
    for (const [index, packageInfo] of packages.entries()) {
      const { name } = packageInfo.manifest;
      const archivePath = path.join(packDirectory, archiveNameForPackage(name));

      process.stdout.write(`[${index + 1}/${packages.length}] ${name} ... `);
      try {
        await checkPackage({
          archivePath,
          env: checkEnv,
          packageInfo,
          repoRoot,
        });
        console.log('ok');
      } catch (error) {
        console.log('failed');
        throw new Error(`Pack check failed for ${name}.`, { cause: error });
      }
    }

    console.log(`Pack checks passed for ${packages.length} packages.`);
  } finally {
    if (!configuredDirectory) {
      await rm(packDirectory, { force: true, recursive: true });
    }
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  await packCheck();
}
