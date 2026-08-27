import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const execFileAsync = promisify(execFile);
const FIXED_GIT_DATE = '2000-01-01T00:00:00Z';
const ARTIFACT_DIGEST_PREFIX = Buffer.from(
  'nocobase-release-artifact-v1\0',
  'utf8',
);
const RESOURCE_SCHEMA_VERSION = 1;
const DEFAULT_VERSION = '0.0.1';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nocobase-default-app-resources-'),
  );
  const outputDirectory = path.resolve(options.outputDir);
  const outputParent = path.dirname(outputDirectory);
  fs.mkdirSync(outputParent, { recursive: true });
  const stagingRoot = fs.mkdtempSync(
    path.join(outputParent, '.default-app-resources-'),
  );
  const stagingDirectory = path.join(stagingRoot, 'default-app');

  try {
    const prepared = options.sourceDir
      ? {
          sourceDirectory: path.resolve(options.sourceDir),
          buildDirectory: requiredPath(options.buildDir, '--build-dir'),
        }
      : {
          sourceDirectory: await preparePublishedTemplateSource(
            requiredPath(options.templateDir, '--template-dir'),
            temporaryRoot,
          ),
          buildDirectory: requiredPath(options.buildDir, '--build-dir'),
        };
    await generateResources({
      sourceDirectory: prepared.sourceDirectory,
      buildDirectory: prepared.buildDirectory,
      outputDirectory: stagingDirectory,
      version: options.version,
      temporaryRoot,
    });
    replaceOutputDirectory(stagingDirectory, outputDirectory);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument near ${name ?? '<end>'}.`);
    }
    values.set(name.slice(2), value);
  }
  const sourceDir = values.get('source-dir');
  const templateDir = values.get('template-dir');
  if (Boolean(sourceDir) === Boolean(templateDir)) {
    throw new Error('Pass exactly one of --source-dir or --template-dir.');
  }
  const outputDir = values.get('output-dir');
  if (!outputDir) throw new Error('--output-dir is required.');
  return {
    sourceDir,
    buildDir: values.get('build-dir'),
    templateDir,
    outputDir,
    version: values.get('version') ?? DEFAULT_VERSION,
  };
}

function requiredPath(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return path.resolve(value);
}

async function preparePublishedTemplateSource(
  templateDirectory,
  temporaryRoot,
) {
  const packDirectory = path.join(temporaryRoot, 'pack');
  const sourceDirectory = path.join(temporaryRoot, 'source');
  fs.mkdirSync(packDirectory, { recursive: true });
  await run('pnpm', ['pack', '--pack-destination', packDirectory], {
    cwd: templateDirectory,
  });
  const archives = fs
    .readdirSync(packDirectory)
    .filter((entry) => entry.endsWith('.tgz'));
  if (archives.length !== 1) {
    throw new Error('Template pack did not produce exactly one archive.');
  }
  fs.mkdirSync(sourceDirectory, { recursive: true });
  await run('tar', [
    '-xzf',
    path.join(packDirectory, archives[0]),
    '--strip-components=1',
    '-C',
    sourceDirectory,
  ]);
  return sourceDirectory;
}

async function generateResources(options) {
  assertDirectory(options.sourceDirectory, 'source directory');
  assertDirectory(options.buildDirectory, 'build directory');
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      options.version,
    )
  ) {
    throw new Error('Release version must be valid SemVer.');
  }
  const gitWorktree = path.join(options.temporaryRoot, 'git-worktree');
  copyRegularTree(options.sourceDirectory, gitWorktree, {
    exclude: (relative) =>
      relative === '.git' ||
      relative.startsWith('.git/') ||
      relative === 'node_modules' ||
      relative.startsWith('node_modules/') ||
      relative === 'dist' ||
      relative.startsWith('dist/') ||
      isRuntimeDataPath(relative) ||
      isSourceSecretEnvironmentFile(relative),
  });
  await run('git', ['init', '--initial-branch=main'], { cwd: gitWorktree });
  await run('git', ['add', '--all'], { cwd: gitWorktree });
  await run('git', ['commit', '--message', 'Initial NocoBase application'], {
    cwd: gitWorktree,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'NocoBase',
      GIT_AUTHOR_EMAIL: 'support@nocobase.com',
      GIT_AUTHOR_DATE: FIXED_GIT_DATE,
      GIT_COMMITTER_NAME: 'NocoBase',
      GIT_COMMITTER_EMAIL: 'support@nocobase.com',
      GIT_COMMITTER_DATE: FIXED_GIT_DATE,
      TZ: 'UTC',
    },
  });
  const { stdout: commitOutput } = await run('git', ['rev-parse', 'HEAD'], {
    cwd: gitWorktree,
  });
  const sourceCommit = commitOutput.trim();

  const releaseDirectory = path.join(options.temporaryRoot, 'release');
  fs.mkdirSync(releaseDirectory, { recursive: true });
  copyRegularTree(options.buildDirectory, path.join(releaseDirectory, 'dist'), {
    exclude: (relative) =>
      isEnvironmentFile(relative) || isReleaseExcludedPath(relative),
  });
  const manifest = {
    schemaVersion: 1,
    basePath: '/default',
    client: { rootDir: 'dist/client' },
    server: {
      entrypoint: 'dist/server/embedded.js',
      healthPath: '/api/healthz',
    },
    source: { commit: sourceCommit },
  };
  fs.writeFileSync(
    path.join(releaseDirectory, 'nocobase-release.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o644 },
  );
  const releaseFiles = listRegularFiles(releaseDirectory);
  const checksum = computeArtifactChecksum(releaseDirectory, releaseFiles);
  const sizeBytes = releaseFiles.reduce(
    (total, relative) =>
      total +
      fs.statSync(path.join(releaseDirectory, ...relative.split('/'))).size,
    0,
  );
  const archive = gzipSync(createTar(releaseDirectory, releaseFiles), {
    level: 9,
    mtime: 0,
  });
  const archiveChecksum = sha256(archive);

  fs.mkdirSync(options.outputDirectory, { recursive: true });
  const bundlePath = path.join(options.outputDirectory, 'source.bundle');
  await run('git', ['bundle', 'create', bundlePath, 'refs/heads/main'], {
    cwd: gitWorktree,
  });
  const sourceBundle = fs.readFileSync(bundlePath);
  const releaseArchivePath = path.join(
    options.outputDirectory,
    'initial-release.tar.gz',
  );
  fs.writeFileSync(releaseArchivePath, archive, { mode: 0o644 });
  const resourceDigest = sha256(
    Buffer.concat([
      Buffer.from(
        `nocobase-default-app-resources-v1\0${sourceCommit}\0`,
        'utf8',
      ),
      createHash('sha256').update(sourceBundle).digest(),
      createHash('sha256').update(archive).digest(),
    ]),
  );
  const metadata = {
    schemaVersion: RESOURCE_SCHEMA_VERSION,
    resourceDigest,
    application: {
      slug: 'default',
      name: 'Default application',
      description: null,
    },
    release: {
      version: options.version,
      sourceCommit,
      checksum,
      sizeBytes,
      archiveChecksum,
      archiveSizeBytes: archive.byteLength,
      archiveFormat: 'tar.gz',
      manifest,
    },
  };
  fs.writeFileSync(
    path.join(options.outputDirectory, 'metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    { mode: 0o644 },
  );
}

function replaceOutputDirectory(stagingDirectory, outputDirectory) {
  const backupDirectory = `${outputDirectory}.previous`;
  fs.rmSync(backupDirectory, { recursive: true, force: true });
  if (fs.existsSync(outputDirectory)) {
    fs.renameSync(outputDirectory, backupDirectory);
  }
  try {
    fs.renameSync(stagingDirectory, outputDirectory);
    fs.rmSync(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(outputDirectory) && fs.existsSync(backupDirectory)) {
      fs.renameSync(backupDirectory, outputDirectory);
    }
    throw error;
  }
}

function copyRegularTree(source, destination, options) {
  assertDirectory(source, 'input directory');
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const relative = entry.name;
    copyEntry(
      sourcePath,
      path.join(destination, entry.name),
      relative,
      options,
    );
  }
}

function copyEntry(source, destination, relative, options) {
  if (options.exclude(relative)) return;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`Input contains symbolic link "${relative}".`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o755 });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      copyEntry(
        path.join(source, entry.name),
        path.join(destination, entry.name),
        `${relative}/${entry.name}`,
        options,
      );
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`Input contains unsupported entry "${relative}".`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, stat.mode & 0o111 ? 0o755 : 0o644);
  fs.utimesSync(destination, new Date(0), new Date(0));
}

function listRegularFiles(root, directory = root) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Release contains symbolic link "${relative}".`);
    }
    if (stat.isDirectory()) result.push(...listRegularFiles(root, absolute));
    else if (stat.isFile()) result.push(relative);
    else throw new Error(`Release contains unsupported entry "${relative}".`);
  }
  return result.sort(compareUtf8);
}

function computeArtifactChecksum(root, files) {
  const digest = createHash('sha256');
  digest.update(ARTIFACT_DIGEST_PREFIX);
  for (const relative of files) {
    const content = fs.readFileSync(path.join(root, ...relative.split('/')));
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(content.byteLength));
    digest.update(Buffer.from(relative, 'utf8'));
    digest.update(Buffer.from([0]));
    digest.update(size);
    digest.update(createHash('sha256').update(content).digest());
    digest.update(Buffer.from([0]));
  }
  return `sha256:${digest.digest('hex')}`;
}

function createTar(root, files) {
  const blocks = [];
  for (const relative of files) {
    const content = fs.readFileSync(path.join(root, ...relative.split('/')));
    const header = Buffer.alloc(512);
    const { name, prefix } = splitTarPath(relative);
    writeString(header, 0, 100, name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, content.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    writeString(header, 257, 6, 'ustar');
    writeString(header, 263, 2, '00');
    writeString(header, 265, 32, 'nocobase');
    writeString(header, 297, 32, 'nocobase');
    writeString(header, 345, 155, prefix);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeChecksum(header, checksum);
    blocks.push(header, content);
    const padding = (512 - (content.byteLength % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function splitTarPath(relative) {
  if (Buffer.byteLength(relative) <= 100) return { name: relative, prefix: '' };
  const segments = relative.split('/');
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const prefix = segments.slice(0, index).join('/');
    const name = segments.slice(index).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`Release path is too long for ustar: ${relative}`);
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length)
    throw new Error(`Tar field is too long: ${value}`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  writeString(buffer, offset, length, `${text}\0`);
}

function writeChecksum(buffer, value) {
  const text = value.toString(8).padStart(6, '0');
  writeString(buffer, 148, 8, `${text}\0 `);
}

function isEnvironmentFile(relative) {
  const basename = path.posix.basename(relative.split(path.sep).join('/'));
  return basename === '.env' || basename.startsWith('.env.');
}

function isSourceSecretEnvironmentFile(relative) {
  const basename = path.posix.basename(relative.split(path.sep).join('/'));
  return basename !== '.env.example' && isEnvironmentFile(relative);
}

function isRuntimeDataPath(relative) {
  const normalized = relative.split(path.sep).join('/');
  return [
    '.agent-annotations',
    '.nocobase',
    '.playwright-cli',
    'app-dist',
    'playwright-report',
    'public/storage',
    'storage',
  ].some(
    (runtimePath) =>
      normalized === runtimePath || normalized.startsWith(`${runtimePath}/`),
  );
}

function isReleaseExcludedPath(relative) {
  const normalized = relative.split(path.sep).join('/');
  return (
    isRuntimeDataPath(normalized) ||
    normalized
      .split('/')
      .some((segment) =>
        ['coverage', 'e2e', 'test-results', 'tests'].includes(segment),
      )
  );
}

function assertDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory.`);
  }
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
