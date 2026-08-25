import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const args = parseArguments(process.argv.slice(2));
const releaseId = requireSegment(args['release-id'], 'release id');
const outputRoot = path.resolve(
  args['output-root'] ??
    path.join(rootDir, '../../packages/app-host/fixtures/app-dist'),
);
const sourcePackage = readJson(path.join(rootDir, 'package.json'));
const distRoot = path.join(rootDir, 'dist');
const appId = 'orders';
const releaseRoot = path.join(outputRoot, appId, 'releases', releaseId);

requireFile(path.join(distRoot, 'server', 'embedded.js'));
requireFile(path.join(distRoot, 'client', 'index.html'));

const artifactSha256 = hashDirectory(distRoot);
const manifest = {
  schemaVersion: 1,
  appId,
  releaseId,
  version: sourcePackage.version,
  artifactSha256,
  createdAt: new Date().toISOString(),
  runtime: {
    backend: 'in-process',
    isolation: 'in-process',
    tier: 'warm',
    healthPath: '/healthz',
    resourcePolicy: {
      startupTimeoutMs: 10000,
      requestTimeoutMs: 30000,
      drainTimeoutMs: 10000,
      idleTtlMs: 900000,
      maxConcurrentRequests: 100,
    },
  },
};
const releasePackage = {
  name: sourcePackage.name,
  displayName: sourcePackage.displayName,
  version: sourcePackage.version,
  private: true,
  type: 'module',
  app: {
    enabled: true,
    appName: appId,
    displayName: sourcePackage.displayName,
    version: sourcePackage.version,
    healthPath: '/healthz',
  },
};

if (fs.existsSync(releaseRoot)) {
  const existingManifest = readJson(path.join(releaseRoot, 'app-release.json'));
  const existingHash = hashDirectory(path.join(releaseRoot, 'dist'));
  if (
    existingManifest.artifactSha256 !== artifactSha256 ||
    existingHash !== artifactSha256
  ) {
    throw new Error(
      `Release ${appId}/${releaseId} already exists with different contents; choose a new release id.`,
    );
  }
  console.log(
    JSON.stringify(
      { status: 'unchanged', appId, releaseId, artifactSha256, releaseRoot },
      null,
      2,
    ),
  );
  process.exit(0);
}

const releasesRoot = path.dirname(releaseRoot);
fs.mkdirSync(releasesRoot, { recursive: true });
const stagingRoot = fs.mkdtempSync(path.join(releasesRoot, `.${releaseId}-`));
try {
  fs.cpSync(distRoot, path.join(stagingRoot, 'dist'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  writeJson(path.join(stagingRoot, 'package.json'), releasePackage);
  writeJson(path.join(stagingRoot, 'app-release.json'), manifest);
  fs.renameSync(stagingRoot, releaseRoot);
} catch (error) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  throw error;
}

console.log(
  JSON.stringify(
    { status: 'created', appId, releaseId, artifactSha256, releaseRoot },
    null,
    2,
  ),
);

function parseArguments(argv) {
  const values = {};
  const allowed = new Set(['release-id', 'output-root']);
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (
      !argument?.startsWith('--') ||
      !allowed.has(argument.slice(2)) ||
      !value
    ) {
      throw new Error(`Invalid argument: ${argument ?? ''}`);
    }
    values[argument.slice(2)] = value;
  }
  return values;
}

function requireSegment(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)
  ) {
    throw new Error(`${label} must be a safe path segment`);
  }
  return value;
}

function hashDirectory(directory) {
  const root = path.resolve(directory);
  const hash = createHash('sha256');
  for (const file of listFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Release input must not contain symbolic links: ${target}`,
        );
      }
      if (entry.isDirectory()) visit(target);
      if (entry.isFile()) files.push(target);
    }
  };
  visit(root);
  return files;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function requireFile(file) {
  if (!fs.statSync(file).isFile())
    throw new Error(`Required file missing: ${file}`);
}
