import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

import {
  archiveNameForPackage,
  discoverPackages,
  readPackedManifest,
  validatePackedManifest,
} from './pack-check.mjs';

const PLAN_FILE = 'publish-plan.json';
const PACKAGES_DIRECTORY = 'packages';
const DIST_TAG_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/u;
const VERSION_LIKE_TAG_PATTERN = /^v?\d+(?:[.-]|$)/iu;
const SAFE_ARCHIVE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/u;

export function validateDistTag(tag, label = 'dist-tag') {
  if (
    typeof tag !== 'string' ||
    !DIST_TAG_PATTERN.test(tag) ||
    VERSION_LIKE_TAG_PATTERN.test(tag)
  ) {
    throw new Error(
      `${label} must be a non-version npm dist-tag containing only letters, digits, dot, underscore, or hyphen.`,
    );
  }
  return tag;
}

function validateReleaseIdentity(entry, location) {
  if (typeof entry.name !== 'string' || entry.name.length === 0) {
    throw new Error(`${location}.name must be a non-empty string.`);
  }
  if (typeof entry.version !== 'string' || entry.version.length === 0) {
    throw new Error(`${location}.version must be a non-empty string.`);
  }
}

export function validatePublishPlan(document, tagOverride) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Publish plan must be a JSON object.');
  }
  if (document.version !== 1) {
    throw new Error(
      `Invalid publish plan version: expected 1, received ${String(document.version)}.`,
    );
  }
  if (!Array.isArray(document.plan)) {
    throw new Error('Publish plan must contain a plan array.');
  }
  if (tagOverride !== undefined) validateDistTag(tagOverride, '--tag');

  const packageLocations = new Map();
  for (const [groupIndex, group] of document.plan.entries()) {
    if (!Array.isArray(group)) {
      throw new Error(`Publish plan group ${groupIndex} must be an array.`);
    }
    for (const [entryIndex, entry] of group.entries()) {
      const location = `plan[${groupIndex}][${entryIndex}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`${location} must be an object.`);
      }
      if (!['publish', 'tag-only'].includes(entry.kind)) {
        throw new Error(`${location}.kind must be publish or tag-only.`);
      }
      validateReleaseIdentity(entry, location);
      if (packageLocations.has(entry.name)) {
        throw new Error(
          `Duplicate release entry for ${entry.name}: ${packageLocations.get(entry.name)} and ${location}.`,
        );
      }
      packageLocations.set(entry.name, location);
      if (entry.kind === 'publish') {
        if (!['public', 'restricted'].includes(entry.access)) {
          throw new Error(`${location}.access must be public or restricted.`);
        }
        validateDistTag(tagOverride ?? entry.tag, `${location}.tag`);
      }
    }
  }
  return document;
}

async function sha256Integrity(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return `sha256-${hash.digest('base64')}`;
}

async function requireRegularFile(filePath, description) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing ${description}: ${filePath}.`, { cause: error });
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new Error(`${description} must be a regular file: ${filePath}.`);
  }
}

async function requireDirectory(directoryPath, description) {
  let stats;
  try {
    stats = await lstat(directoryPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing ${description}: ${directoryPath}.`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new Error(`${description} must be a directory: ${directoryPath}.`);
  }
}

function requireSourcePackage(entry, packagesByName) {
  const packageInfo = packagesByName.get(entry.name);
  if (!packageInfo) {
    throw new Error(
      `Publish plan package is not in the source repository: ${entry.name}.`,
    );
  }
  if (packageInfo.manifest.version !== entry.version) {
    throw new Error(
      `Publish plan version mismatch for ${entry.name}: source is ${packageInfo.manifest.version}, plan requests ${entry.version}.`,
    );
  }
  return packageInfo;
}

async function validateTarball({
  entry,
  packageInfo,
  tarballPath,
  expectedIntegrity,
}) {
  await requireRegularFile(tarballPath, `tarball for ${entry.name}`);
  // Reject modified bytes before invoking tar; GNU tar and BSD tar handle trailing garbage differently.
  const integrity = await sha256Integrity(tarballPath);
  if (expectedIntegrity !== undefined && integrity !== expectedIntegrity) {
    throw new Error(
      `Tarball integrity mismatch for ${entry.name}: expected ${expectedIntegrity}, received ${integrity}.`,
    );
  }
  const packedManifest = await readPackedManifest(tarballPath);
  validatePackedManifest(packageInfo.manifest, packedManifest);
  return integrity;
}

function releaseArchiveName(packageName) {
  const filename = archiveNameForPackage(packageName);
  if (!SAFE_ARCHIVE_PATTERN.test(filename)) {
    throw new Error(
      `Cannot derive a safe release archive filename for ${packageName}.`,
    );
  }
  return filename;
}

function resolveContainedTarball(outputDirectory, tarballPath, packageName) {
  if (typeof tarballPath !== 'string' || tarballPath.length === 0) {
    throw new Error(`${packageName} tarball.path must be a non-empty string.`);
  }
  if (
    path.posix.isAbsolute(tarballPath) ||
    path.win32.isAbsolute(tarballPath) ||
    tarballPath.includes('\\') ||
    tarballPath.split('/').includes('..')
  ) {
    throw new Error(`${packageName} tarball.path must stay inside --output.`);
  }
  const resolved = path.resolve(outputDirectory, ...tarballPath.split('/'));
  if (
    !pathsOverlap(outputDirectory, resolved) ||
    resolved === outputDirectory
  ) {
    throw new Error(`${packageName} tarball.path must stay inside --output.`);
  }
  return resolved;
}

function pathsOverlap(left, right) {
  const relative = path.relative(left, right);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

async function inspectExistingOutput(outputDirectory, planPath) {
  let stats;
  try {
    stats = await lstat(outputDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new Error(`--output must be a directory: ${outputDirectory}.`);
  }

  const allowed = new Set([PLAN_FILE, PACKAGES_DIRECTORY]);
  if (path.dirname(planPath) === outputDirectory) {
    allowed.add(path.basename(planPath));
  }
  for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
    if (!allowed.has(entry.name)) {
      throw new Error(
        `Unexpected entry in release-pack output: ${entry.name}. Use a dedicated output directory.`,
      );
    }
    if (entry.name === PACKAGES_DIRECTORY && !entry.isDirectory()) {
      throw new Error(`${PACKAGES_DIRECTORY} must be a directory.`);
    }
    if (entry.name !== PACKAGES_DIRECTORY && !entry.isFile()) {
      throw new Error(`${entry.name} must be a regular file.`);
    }
  }
  return true;
}

async function replaceOutputDirectory({
  outputDirectory,
  outputExists,
  stagingDirectory,
}) {
  const backupDirectory = `${outputDirectory}.backup-${randomUUID()}`;
  let backedUp = false;
  try {
    if (outputExists) {
      await rename(outputDirectory, backupDirectory);
      backedUp = true;
    }
    await rename(stagingDirectory, outputDirectory);
    if (backedUp) await rm(backupDirectory, { force: true, recursive: true });
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    if (backedUp) {
      await rm(outputDirectory, { force: true, recursive: true });
      await rename(backupDirectory, outputDirectory);
    }
    throw error;
  }
}

export async function prepareReleasePack({
  artifacts,
  output,
  plan,
  repoRoot,
  tag,
}) {
  const planPath = path.resolve(plan);
  const artifactsDirectory = path.resolve(artifacts);
  const outputDirectory = path.resolve(output);
  const resolvedRepoRoot = path.resolve(repoRoot);
  if (outputDirectory === path.parse(outputDirectory).root) {
    throw new Error('--output cannot be a filesystem root.');
  }
  if (
    pathsOverlap(outputDirectory, artifactsDirectory) ||
    pathsOverlap(artifactsDirectory, outputDirectory)
  ) {
    throw new Error('--output and --artifacts must not overlap.');
  }
  if (
    pathsOverlap(outputDirectory, resolvedRepoRoot) ||
    pathsOverlap(resolvedRepoRoot, outputDirectory)
  ) {
    throw new Error('--output and --repo-root must not overlap.');
  }

  await requireRegularFile(planPath, 'publish plan');
  const originalPlan = await readFile(planPath, 'utf8');
  const document = validatePublishPlan(JSON.parse(originalPlan), tag);
  const packages = await discoverPackages(resolvedRepoRoot);
  const packagesByName = new Map(
    packages.map((packageInfo) => [packageInfo.manifest.name, packageInfo]),
  );
  const preparedByName = new Map();

  // Read and hash every publish artifact before creating the output staging directory. A missing package late in a
  // dependency chunk must not leave a publishable subset behind.
  for (const entry of document.plan.flat()) {
    if (entry.kind !== 'publish') continue;
    const packageInfo = requireSourcePackage(entry, packagesByName);

    const filename = releaseArchiveName(entry.name);
    const sourcePath = path.join(artifactsDirectory, filename);
    preparedByName.set(entry.name, {
      filename,
      integrity: await validateTarball({
        entry,
        packageInfo,
        tarballPath: sourcePath,
      }),
      sourcePath,
    });
  }

  const packedPlan = document.plan.map((group) =>
    group.map((entry) => {
      if (entry.kind !== 'publish') return entry;
      const prepared = preparedByName.get(entry.name);
      return {
        ...entry,
        ...(tag === undefined ? {} : { tag }),
        tarball: {
          path: path.posix.join(PACKAGES_DIRECTORY, prepared.filename),
          integrity: prepared.integrity,
        },
      };
    }),
  );

  await mkdir(path.dirname(outputDirectory), { recursive: true });
  const outputExists = await inspectExistingOutput(outputDirectory, planPath);
  const stagingDirectory = await mkdtemp(
    path.join(path.dirname(outputDirectory), '.release-pack-'),
  );
  try {
    const stagingPackages = path.join(stagingDirectory, PACKAGES_DIRECTORY);
    await mkdir(stagingPackages);
    for (const prepared of preparedByName.values()) {
      const destination = path.join(stagingPackages, prepared.filename);
      await copyFile(prepared.sourcePath, destination);
      const copiedIntegrity = await sha256Integrity(destination);
      if (copiedIntegrity !== prepared.integrity) {
        throw new Error(
          `Artifact changed while copying ${prepared.filename}: expected ${prepared.integrity}, received ${copiedIntegrity}.`,
        );
      }
    }
    await writeFile(
      path.join(stagingDirectory, PLAN_FILE),
      `${JSON.stringify({ ...document, plan: packedPlan }, null, 2)}\n`,
    );
    await replaceOutputDirectory({
      outputDirectory,
      outputExists,
      stagingDirectory,
    });
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }

  console.log(
    `Prepared ${preparedByName.size} publish tarball${preparedByName.size === 1 ? '' : 's'} in ${outputDirectory}.`,
  );
  return { plan: packedPlan, publishCount: preparedByName.size };
}

export async function validatePreparedReleasePack({ output, plan, repoRoot }) {
  const planPath = path.resolve(plan);
  const outputDirectory = path.resolve(output);
  const resolvedRepoRoot = path.resolve(repoRoot);
  await requireRegularFile(planPath, 'publish plan');
  await requireDirectory(outputDirectory, 'release-pack output');
  const canonicalOutputDirectory = await realpath(outputDirectory);
  const document = validatePublishPlan(
    JSON.parse(await readFile(planPath, 'utf8')),
  );
  const packages = await discoverPackages(resolvedRepoRoot);
  const packagesByName = new Map(
    packages.map((packageInfo) => [packageInfo.manifest.name, packageInfo]),
  );
  let publishCount = 0;

  for (const entry of document.plan.flat()) {
    if (entry.kind !== 'publish') continue;
    publishCount += 1;
    const packageInfo = requireSourcePackage(entry, packagesByName);
    if (!entry.tarball || typeof entry.tarball !== 'object') {
      throw new Error(`${entry.name} must include tarball metadata.`);
    }
    if (typeof entry.tarball.integrity !== 'string') {
      throw new Error(`${entry.name} tarball.integrity must be a string.`);
    }
    const tarballPath = resolveContainedTarball(
      outputDirectory,
      entry.tarball.path,
      entry.name,
    );
    const expectedTarballPath = path.posix.join(
      PACKAGES_DIRECTORY,
      releaseArchiveName(entry.name),
    );
    if (entry.tarball.path !== expectedTarballPath) {
      throw new Error(
        `${entry.name} tarball.path must be ${expectedTarballPath}.`,
      );
    }
    await requireRegularFile(tarballPath, `prepared tarball for ${entry.name}`);
    const canonicalTarballPath = await realpath(tarballPath);
    if (!pathsOverlap(canonicalOutputDirectory, canonicalTarballPath)) {
      throw new Error(`${entry.name} tarball.path must stay inside --output.`);
    }
    await validateTarball({
      entry,
      packageInfo,
      tarballPath: canonicalTarballPath,
      expectedIntegrity: entry.tarball.integrity,
    });
  }

  console.log(
    `Validated ${publishCount} prepared publish tarball${publishCount === 1 ? '' : 's'} in ${outputDirectory}.`,
  );
  return { plan: document.plan, publishCount };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--validate-only') {
      if (options.validateOnly) {
        throw new Error('Duplicate option: --validate-only');
      }
      options.validateOnly = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const name = argument.slice(2);
    if (!['artifacts', 'output', 'plan', 'repo-root', 'tag'].includes(name)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (options[name] !== undefined) {
      throw new Error(`Duplicate option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    options[name] = value;
    index += 1;
  }
  const required = options.validateOnly
    ? ['output', 'plan', 'repo-root']
    : ['artifacts', 'output', 'plan', 'repo-root'];
  for (const name of required) {
    if (!options[name]) throw new Error(`--${name} is required.`);
  }
  if (options.validateOnly && (options.artifacts || options.tag)) {
    throw new Error(
      '--artifacts and --tag are not valid with --validate-only.',
    );
  }
  return {
    artifacts: options.artifacts,
    output: options.output,
    plan: options.plan,
    repoRoot: options['repo-root'],
    tag: options.tag,
    validateOnly: options.validateOnly === true,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  if (options.validateOnly) await validatePreparedReleasePack(options);
  else await prepareReleasePack(options);
}
