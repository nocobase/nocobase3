import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const CHANNELS = new Set(['beta', 'stable']);
const RELEASE_KINDS = new Set(['beta', 'stable-direct', 'stable-promotion']);
const DIST_TAGS = new Set(['beta', 'latest', 'legacy']);
const BATCH_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export function discoverReleasePackages(repoRoot = process.cwd()) {
  const packagesDirectory = path.join(repoRoot, 'packages');
  if (!fs.existsSync(packagesDirectory)) return [];

  return fs
    .readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = path.join(
        packagesDirectory,
        entry.name,
        'package.json',
      );
      if (!fs.existsSync(manifestPath)) return undefined;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        directory: entry.name,
        name: manifest.name,
        private: manifest.private === true,
        version: manifest.version,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function createReleaseManifest({
  batch,
  beforeVersions,
  channel,
  distTag,
  originRunId,
  releaseKind,
  repoRoot = process.cwd(),
  sourceSha,
  tag,
  targetBranch,
}) {
  const packages = discoverReleasePackages(repoRoot)
    .filter((pkg) => !pkg.private && beforeVersions[pkg.name] !== pkg.version)
    .map(({ directory, name, version }) => ({ directory, name, version }));

  if (packages.length === 0) {
    throw new Error('The release manifest must contain at least one package');
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    channel,
    releaseKind,
    batch,
    tag,
    targetBranch,
    distTag,
    sourceSha,
    originRunId: String(originRunId),
    packages,
  };
  validateReleaseManifest(manifest, { channel, tag });
  return manifest;
}

export function validateReleaseManifest(
  manifest,
  { channel: expectedChannel, tag: expectedTag } = {},
) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Release manifest must be an object');
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported release manifest schema: ${manifest.schemaVersion}`,
    );
  }
  if (!CHANNELS.has(manifest.channel)) {
    throw new Error(`Invalid release channel: ${manifest.channel}`);
  }
  if (!RELEASE_KINDS.has(manifest.releaseKind)) {
    throw new Error(`Invalid release kind: ${manifest.releaseKind}`);
  }
  if (
    (manifest.channel === 'beta' && manifest.releaseKind !== 'beta') ||
    (manifest.channel === 'stable' && manifest.releaseKind === 'beta')
  ) {
    throw new Error(
      `Release kind ${manifest.releaseKind} does not match channel ${manifest.channel}`,
    );
  }
  if (!BATCH_PATTERN.test(manifest.batch)) {
    throw new Error(`Invalid release batch: ${manifest.batch}`);
  }

  const expectedPrefix =
    manifest.channel === 'beta' ? 'release-beta/' : 'release/';
  const derivedTag = `${expectedPrefix}${manifest.batch}`;
  if (manifest.tag !== derivedTag) {
    throw new Error(
      `Release tag ${manifest.tag} does not match channel and batch (${derivedTag})`,
    );
  }
  if (expectedChannel && manifest.channel !== expectedChannel) {
    throw new Error(
      `Release channel ${manifest.channel} does not match ${expectedChannel}`,
    );
  }
  if (expectedTag && manifest.tag !== expectedTag) {
    throw new Error(
      `Release tag ${manifest.tag} does not match ${expectedTag}`,
    );
  }
  if (
    typeof manifest.targetBranch !== 'string' ||
    manifest.targetBranch.length === 0 ||
    /[\r\n]/u.test(manifest.targetBranch)
  ) {
    throw new Error('Release targetBranch must be a non-empty branch name');
  }
  if (!DIST_TAGS.has(manifest.distTag)) {
    throw new Error(`Invalid npm dist-tag: ${manifest.distTag}`);
  }
  if (
    (manifest.channel === 'beta' && manifest.distTag !== 'beta') ||
    (manifest.channel === 'stable' && manifest.distTag === 'beta')
  ) {
    throw new Error(
      `npm dist-tag ${manifest.distTag} does not match channel ${manifest.channel}`,
    );
  }
  if (!SHA_PATTERN.test(manifest.sourceSha)) {
    throw new Error(`Invalid release source SHA: ${manifest.sourceSha}`);
  }
  if (!/^\d+$/u.test(manifest.originRunId)) {
    throw new Error(`Invalid release origin run ID: ${manifest.originRunId}`);
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    throw new Error('Release manifest must contain at least one package');
  }

  const packageNames = new Set();
  for (const pkg of manifest.packages) {
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
      throw new Error('Every release package must be an object');
    }
    if (
      typeof pkg.name !== 'string' ||
      pkg.name.length === 0 ||
      /[\r\n\t]/u.test(pkg.name)
    ) {
      throw new Error('Every release package must have a valid name');
    }
    if (
      typeof pkg.version !== 'string' ||
      pkg.version.length === 0 ||
      /[\r\n\t]/u.test(pkg.version)
    ) {
      throw new Error(`Package ${pkg.name} must have a valid version`);
    }
    if (
      typeof pkg.directory !== 'string' ||
      pkg.directory.length === 0 ||
      path.basename(pkg.directory) !== pkg.directory ||
      pkg.directory === '.' ||
      pkg.directory === '..'
    ) {
      throw new Error(`Package ${pkg.name} has an invalid directory`);
    }
    if (packageNames.has(pkg.name)) {
      throw new Error(`Duplicate package in release manifest: ${pkg.name}`);
    }
    packageNames.add(pkg.name);
  }

  return manifest;
}

export function extractChangelogSection(changelog, version) {
  const heading = `## ${version}`;
  const lines = changelog.replaceAll('\r\n', '\n').split('\n');
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trimEnd() === heading) matches.push(index);
  }
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${heading} heading, found ${matches.length}`,
    );
  }

  const start = matches[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

export function renderReleaseNotes(manifest, repoRoot = process.cwd()) {
  validateReleaseTree(manifest, repoRoot);
  const releaseLabel =
    manifest.channel === 'beta' ? 'Beta release' : 'Stable release';
  const lines = [
    `<!-- nocobase-release-run-id:${manifest.originRunId} -->`,
    `<!-- nocobase-release-source:${manifest.sourceSha} -->`,
    `${releaseLabel} \`${manifest.batch}\` publishes ${manifest.packages.length} package${manifest.packages.length === 1 ? '' : 's'}.`,
    '',
    '## Packages',
    '',
    '| Package | Version |',
    '| --- | --- |',
    ...manifest.packages.map(
      (pkg) => `| \`${pkg.name}\` | \`${pkg.version}\` |`,
    ),
  ];

  for (const pkg of manifest.packages) {
    const changelogPath = path.join(
      repoRoot,
      'packages',
      pkg.directory,
      'CHANGELOG.md',
    );
    if (!fs.existsSync(changelogPath)) {
      throw new Error(`Missing changelog for ${pkg.name}: ${changelogPath}`);
    }
    const section = extractChangelogSection(
      fs.readFileSync(changelogPath, 'utf8'),
      pkg.version,
    );
    lines.push('', `## \`${pkg.name}@${pkg.version}\``, '');
    lines.push(section || '_No changelog details were provided._');
  }

  return `${lines.join('\n')}\n`;
}

export function validateReleaseTree(
  manifest,
  repoRoot = process.cwd(),
  previousVersions,
) {
  validateReleaseManifest(manifest);
  const currentPackages = discoverReleasePackages(repoRoot);
  const currentByName = new Map(currentPackages.map((pkg) => [pkg.name, pkg]));
  const before =
    previousVersions ??
    readPreviousVersions(manifest, currentPackages, repoRoot);
  const changedPackages = currentPackages
    .filter((pkg) => !pkg.private && before[pkg.name] !== pkg.version)
    .map(({ directory, name, version }) => ({ directory, name, version }));

  if (JSON.stringify(manifest.packages) !== JSON.stringify(changedPackages)) {
    throw new Error(
      'Release manifest packages do not match the version changes in the tagged source',
    );
  }
  for (const pkg of manifest.packages) {
    const current = currentByName.get(pkg.name);
    if (
      !current ||
      current.directory !== pkg.directory ||
      current.version !== pkg.version ||
      current.private
    ) {
      throw new Error(
        `Release package ${pkg.name}@${pkg.version} does not match the tagged source`,
      );
    }
  }
  return manifest;
}

function readPreviousVersions(manifest, packages, repoRoot) {
  const before = {};
  for (const pkg of packages) {
    const packagePath = `packages/${pkg.directory}/package.json`;
    try {
      const raw = execFileSync(
        'git',
        ['show', `${manifest.sourceSha}^:${packagePath}`],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );
      const previous = JSON.parse(raw);
      before[previous.name] = previous.version;
    } catch {
      before[pkg.name] = undefined;
    }
  }
  return before;
}

export function formatReleaseSpecs(manifest) {
  validateReleaseManifest(manifest);
  return `${manifest.packages
    .map((pkg) => `${pkg.name}@${pkg.version}`)
    .join('\n')}\n`;
}

export function formatReleaseRecords(manifest) {
  validateReleaseManifest(manifest);
  return `${manifest.packages
    .map((pkg) => `${pkg.name}\t${pkg.version}`)
    .join('\n')}\n`;
}

export function formatReleaseTable(manifest) {
  validateReleaseManifest(manifest);
  return `${[
    '| Package | Version |',
    '| --- | --- |',
    ...manifest.packages.map(
      (pkg) => `| \`${pkg.name}\` | \`${pkg.version}\` |`,
    ),
  ].join('\n')}\n`;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid argument list near ${key ?? '<end>'}`);
    }
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

function readManifest(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runCli(argv) {
  const { command, options } = parseArguments(argv);
  if (command === 'create') {
    const beforeVersions = JSON.parse(
      fs.readFileSync(requireOption(options, 'before'), 'utf8'),
    );
    const manifest = createReleaseManifest({
      batch: requireOption(options, 'batch'),
      beforeVersions,
      channel: requireOption(options, 'channel'),
      distTag: requireOption(options, 'dist-tag'),
      originRunId: requireOption(options, 'run-id'),
      releaseKind: requireOption(options, 'release-kind'),
      repoRoot: options['repo-root'] ?? process.cwd(),
      sourceSha: requireOption(options, 'source-sha'),
      tag: requireOption(options, 'tag'),
      targetBranch: requireOption(options, 'target-branch'),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }

  const manifestPath = requireOption(options, 'manifest');
  const manifest = readManifest(manifestPath);
  if (command === 'validate') {
    validateReleaseManifest(manifest, {
      channel: options.channel,
      tag: options.tag,
    });
    return;
  }
  if (command === 'validate-tree') {
    validateReleaseTree(manifest, options['repo-root'] ?? process.cwd());
    return;
  }
  if (command === 'notes') {
    process.stdout.write(
      renderReleaseNotes(manifest, options['repo-root'] ?? process.cwd()),
    );
    return;
  }
  if (command === 'specs') {
    process.stdout.write(formatReleaseSpecs(manifest));
    return;
  }
  if (command === 'records') {
    process.stdout.write(formatReleaseRecords(manifest));
    return;
  }
  if (command === 'table') {
    process.stdout.write(formatReleaseTable(manifest));
    return;
  }
  throw new Error(`Unknown release-manifest command: ${command ?? '<none>'}`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
