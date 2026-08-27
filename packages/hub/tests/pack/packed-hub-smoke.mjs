import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL, URL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const archive = process.argv[2];
const npmCli = path.resolve(
  path.dirname(process.execPath),
  '../lib/node_modules/npm/bin/npm-cli.js',
);
const runtimePath = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`;

if (!archive) {
  throw new Error('Usage: node tests/pack/packed-hub-smoke.mjs <tarball>');
}

const root = await mkdtemp(path.join(tmpdir(), 'nocobase-hub-pack-smoke-'));
try {
  const { stdout: listing } = await execFileAsync('tar', ['-tzf', archive]);
  assertIncluded(listing, 'package/server/standalone.js');
  assertIncluded(listing, 'package/client/index.html');
  assertIncluded(listing, 'package/vendor/');
  assertIncluded(listing, 'package/resources/default-app/metadata.json');
  assertExcluded(
    listing,
    /(?:^|\/)(?:\.agent-annotations|\.nocobase|app-dist|tests|e2e)(?:\/|$)/,
  );
  assertExcluded(
    listing,
    /package\/(?:\.env(?:\.|$)|storage\/|public\/storage\/)/,
  );

  await execFileAsync(process.execPath, [npmCli, 'init', '--yes'], {
    cwd: root,
  });
  await execFileAsync(
    process.execPath,
    [
      npmCli,
      'install',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      archive,
    ],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'production', PATH: runtimePath },
    },
  );

  const packageDirectory = path.join(root, 'node_modules/@nocobase/hub');
  await readFile(path.join(packageDirectory, 'server/standalone.js'));
  await readFile(
    path.join(packageDirectory, 'resources/default-app/metadata.json'),
  );
  await verifyDefaultResources(root, packageDirectory);

  const appServerPort = await findFreePort();
  const appHostPort = await findFreePort();
  const child = spawn(
    process.execPath,
    [path.join(packageDirectory, 'server/standalone.js')],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: runtimePath,
        NODE_ENV: 'production',
        HUB_ENABLED: 'true',
        AUTH_SECRET: 'packed-hub-smoke-auth-secret-at-least-32-chars',
        HUB_DATABASE_PATH: path.join(root, 'runtime/hub.sqlite'),
        HUB_SOURCE_ROOT: path.join(root, 'runtime/sources'),
        HUB_RELEASE_ROOT: path.join(root, 'runtime/releases'),
        HUB_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64url'),
        APP_SERVER_HOST: '127.0.0.1',
        APP_SERVER_PORT: String(appServerPort),
        APP_HOST_BIND: '127.0.0.1',
        APP_HOST_PORT: String(appHostPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output = collectOutput(child);
  const spawnError = new Promise((_, reject) => {
    child.once('error', reject);
  });
  try {
    await Promise.race([
      waitForListening(child, output, appServerPort),
      spawnError,
    ]);
    const response = await globalThis.fetch(
      `http://127.0.0.1:${appServerPort}/hub/api/healthz`,
    );
    if (!response.ok) {
      throw new Error(`Packaged Hub health check returned ${response.status}.`);
    }
    const body = await response.json();
    if (body?.data?.ok !== true) {
      throw new Error(
        `Packaged Hub health check did not return ok=true: ${JSON.stringify(body)}`,
      );
    }
    const setupResponse = await globalThis.fetch(
      `http://127.0.0.1:${appServerPort}/hub/api/setup/status`,
    );
    const setupBody = await setupResponse.json();
    if (!setupResponse.ok || setupBody?.data?.defaultApp?.status !== 'ready') {
      throw new Error(
        `Packaged Hub did not bootstrap its default APP: ${JSON.stringify(setupBody)}`,
      );
    }
    const defaultAppHealth = await globalThis.fetch(
      `http://127.0.0.1:${appHostPort}/default/api/healthz`,
    );
    const defaultAppHealthBody = await defaultAppHealth.json();
    if (!defaultAppHealth.ok || defaultAppHealthBody?.ok !== true) {
      throw new Error(
        `Packaged default APP health check failed: ${JSON.stringify(defaultAppHealthBody)}`,
      );
    }
    await verifyDefaultAppClient(appHostPort);
    assertDatabaseState(root, path.join(root, 'runtime/hub.sqlite'));
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child);
  }
} finally {
  if (process.env.HUB_PACK_SMOKE_KEEP !== 'true') {
    await rm(root, { recursive: true, force: true });
  }
}

function assertIncluded(listing, entry) {
  if (
    !listing
      .split(/\r?\n/)
      .some((line) => line === entry || line.startsWith(entry))
  ) {
    throw new Error(`Packed Hub tarball is missing ${entry}.`);
  }
}

function assertExcluded(listing, pattern) {
  const match = listing.split(/\r?\n/).find((line) => pattern.test(line));
  if (match) {
    throw new Error(`Packed Hub tarball contains excluded path ${match}.`);
  }
}

function collectOutput(child) {
  let value = '';
  child.stdout.on('data', (chunk) => {
    value += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    value += chunk.toString();
  });
  return {
    get value() {
      return value;
    },
  };
}

async function waitForListening(child, output, port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (output.value.includes(`:${port}`)) return;
    if (child.exitCode !== null) {
      await setTimeout(250);
      throw new Error(
        `Packaged Hub exited before listening (exitCode=${child.exitCode}; signal=${child.signalCode}):\n${output.value}`,
      );
    }
    await setTimeout(100);
  }
  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for packaged Hub:\n${output.value}`);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once('exit', resolve));
}

async function findFreePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate a free port.'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function verifyDefaultAppClient(appHostPort) {
  const origin = `http://127.0.0.1:${appHostPort}`;
  const response = await globalThis.fetch(`${origin}/default/`);
  if (!response.ok) {
    throw new Error(
      `Packaged default APP document returned ${response.status}.`,
    );
  }

  const html = await response.text();
  const references = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => !/^(?:#|data:|https?:|\/\/)/.test(reference));
  if (references.length === 0) {
    throw new Error('Packaged default APP document has no client resources.');
  }

  for (const reference of references) {
    const resourceUrl = new URL(reference, `${origin}/default/`);
    if (!resourceUrl.pathname.startsWith('/default/')) {
      throw new Error(
        `Packaged default APP document references a resource outside /default/: ${reference}`,
      );
    }
    const resourceResponse = await globalThis.fetch(resourceUrl);
    if (!resourceResponse.ok) {
      throw new Error(
        `Packaged default APP resource ${resourceUrl.pathname} returned ${resourceResponse.status}.`,
      );
    }
  }
}

function assertDatabaseState(root, databasePath) {
  if (!existsSync(databasePath)) {
    throw new Error(
      `Packaged Hub database was not created at ${databasePath}; runtime entries: ${JSON.stringify(readdirSync(path.dirname(databasePath)))}`,
    );
  }
  const require = createRequire(path.join(root, 'package.json'));
  const Database = require('better-sqlite3');
  const database = new Database(databasePath, { readonly: true });
  try {
    const tables = database
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => row.name);
    if (!tables.includes('hub_applications')) {
      throw new Error(
        `Packaged Hub database at ${databasePath} (${statSync(databasePath).size} bytes) has unexpected tables: ${JSON.stringify(tables)}`,
      );
    }
    const counts = Object.fromEntries(
      ['hub_applications', 'hub_releases', 'hub_deployments'].map((table) => [
        table,
        database.prepare(`select count(*) as total from ${table}`).get().total,
      ]),
    );
    if (
      counts.hub_applications !== 1 ||
      counts.hub_releases !== 1 ||
      counts.hub_deployments !== 1
    ) {
      throw new Error(
        `Packaged Hub bootstrap created unexpected records: ${JSON.stringify(counts)}`,
      );
    }
    const deployment = database
      .prepare('select status from hub_deployments limit 1')
      .get();
    if (deployment?.status !== 'succeeded') {
      throw new Error(
        `Packaged Hub deployment did not succeed: ${JSON.stringify(deployment)}`,
      );
    }
  } finally {
    database.close();
  }
}

async function verifyDefaultResources(root, packageDirectory) {
  const resources = path.join(packageDirectory, 'resources/default-app');
  const resourceEntries = readdirSync(resources).sort();
  const expectedEntries = [
    'initial-release.tar.gz',
    'metadata.json',
    'source.bundle',
  ];
  if (JSON.stringify(resourceEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(
      `Default APP resources contain unexpected files: ${JSON.stringify(resourceEntries)}`,
    );
  }

  const metadata = JSON.parse(
    await readFile(path.join(resources, 'metadata.json'), 'utf8'),
  );
  const bundlePath = path.join(resources, 'source.bundle');
  const archivePath = path.join(resources, 'initial-release.tar.gz');
  const bundle = await readFile(bundlePath);
  const archive = await readFile(archivePath);
  const archiveChecksum = sha256(archive);
  if (
    metadata.release.archiveChecksum !== archiveChecksum ||
    metadata.release.archiveSizeBytes !== archive.byteLength
  ) {
    throw new Error(
      'Default APP release archive metadata does not match its bytes.',
    );
  }
  const resourceDigest = sha256(
    Buffer.concat([
      Buffer.from(
        `nocobase-default-app-resources-v1\0${metadata.release.sourceCommit}\0`,
        'utf8',
      ),
      createHash('sha256').update(bundle).digest(),
      createHash('sha256').update(archive).digest(),
    ]),
  );
  if (metadata.resourceDigest !== resourceDigest) {
    throw new Error(
      'Default APP resource digest does not match its resources.',
    );
  }

  const { stdout: bundleHeads } = await execFileAsync('git', [
    'bundle',
    'list-heads',
    bundlePath,
    'refs/heads/main',
  ]);
  if (
    bundleHeads.trim() !== `${metadata.release.sourceCommit} refs/heads/main`
  ) {
    throw new Error('Default APP source bundle HEAD does not match metadata.');
  }
  const source = path.join(root, 'default-source');
  await execFileAsync('git', ['clone', bundlePath, source]);
  const { stdout: sourceFiles } = await execFileAsync('git', [
    '-C',
    source,
    'ls-files',
  ]);
  const { stdout: sourceModes } = await execFileAsync('git', [
    '-C',
    source,
    'ls-files',
    '--stage',
  ]);
  assertExcluded(
    sourceFiles,
    /^(?:\.agent-annotations|\.nocobase|\.playwright-cli|app-dist|dist|node_modules|playwright-report|public\/storage|storage)(?:\/|$)/,
  );
  assertIncluded(sourceFiles, '.env.example');
  assertExcluded(sourceFiles, /(?:^|\/)\.env(?:$|\.(?!example$))/m);
  if (/^120000 /m.test(sourceModes)) {
    throw new Error('Default APP source bundle contains a symbolic link.');
  }
  const sourceManifest = await readFile(
    path.join(source, 'package.json'),
    'utf8',
  );
  if (/"(?:workspace|catalog):/.test(sourceManifest)) {
    throw new Error('Default APP source bundle contains workspace protocols.');
  }
  if (JSON.parse(sourceManifest).version !== metadata.release.version) {
    throw new Error('Default APP source and release versions do not match.');
  }

  const { stdout: archiveEntries } = await execFileAsync(
    'tar',
    ['-tzf', archivePath],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  for (const entry of archiveEntries.trim().split(/\r?\n/)) {
    if (entry !== 'nocobase-release.json' && !entry.startsWith('dist/')) {
      throw new Error(`Default APP release contains unexpected path ${entry}.`);
    }
  }
  assertExcluded(
    archiveEntries,
    /^dist\/(?:\.agent-annotations|\.nocobase|\.playwright-cli|app-dist|playwright-report|public\/storage|storage)(?:\/|$)/,
  );
  assertExcluded(archiveEntries, /(?:^|\/)\.env(?:\.|$)/);
  const release = path.join(root, 'default-release');
  await mkdir(release);
  await execFileAsync('tar', ['-xzf', archivePath, '-C', release]);
  const releaseFiles = await listRegularFiles(release);
  const releaseSize = releaseFiles.reduce(
    (total, relative) =>
      total + statSync(path.join(release, ...relative.split('/'))).size,
    0,
  );
  const integrityModule = await import(
    pathToFileURL(
      path.join(packageDirectory, 'server/hub/artifact-integrity.js'),
    ).href
  );
  const releaseChecksum =
    await integrityModule.computeReleaseArtifactChecksum(release);
  if (
    releaseChecksum !== metadata.release.checksum ||
    releaseSize !== metadata.release.sizeBytes
  ) {
    throw new Error('Default APP extracted release does not match metadata.');
  }
  const manifest = JSON.parse(
    await readFile(path.join(release, 'nocobase-release.json'), 'utf8'),
  );
  if (JSON.stringify(manifest) !== JSON.stringify(metadata.release.manifest)) {
    throw new Error('Default APP release manifest does not match metadata.');
  }
}

async function listRegularFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const metadata = await lstat(absolute);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (metadata.isSymbolicLink()) {
      throw new Error(`Packaged resource contains symbolic link ${relative}.`);
    }
    if (metadata.isDirectory()) {
      files.push(...(await listRegularFiles(root, absolute)));
    } else if (metadata.isFile()) {
      files.push(relative);
    } else {
      throw new Error(
        `Packaged resource contains unsupported path ${relative}.`,
      );
    }
  }
  return files;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
