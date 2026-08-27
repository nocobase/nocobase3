import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { create } from 'tar';

import type { AppProject } from './app-project.ts';
import type { PackageManager } from './package-manager.ts';
import { runCommand } from './run-command.ts';

export interface AppReleaseManifest {
  schemaVersion: 1;
  appId: string;
  releaseId: string;
  version: string;
  artifactSha256: string;
  runtime?: {
    backend?: 'in-process';
    isolation?: 'in-process';
    tier?: 'warm';
    healthPath?: string;
  };
}

export interface PrepareReleaseArchiveOptions {
  project: AppProject;
  packageManager: PackageManager;
  releaseId?: string;
}

export interface PreparedReleaseArchive {
  archivePath: string;
  manifest: AppReleaseManifest;
  remove(): Promise<void>;
}

interface AppPackageManifest {
  name?: string;
  displayName?: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
}

/** Packages only deployable output. Source files are never added to the archive. */
export async function prepareReleaseArchive(
  options: PrepareReleaseArchiveOptions,
): Promise<PreparedReleaseArchive> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'nb3-release-'));
  try {
    const packageManifest = await readPackageManifest(
      options.project.directory,
    );
    const provisionalReleaseId = `upload-${randomUUID()}`;
    let releaseRoot: string;
    if (packageManifest.scripts?.['release:pack']) {
      releaseRoot = await runAppReleasePack({
        directory: options.project.directory,
        outputRoot: path.join(temporaryRoot, 'output'),
        packageManager: options.packageManager,
        provisionalReleaseId,
      });
    } else {
      releaseRoot = await createGenericRelease({
        appId: options.project.config.name,
        appDirectory: options.project.directory,
        outputRoot: path.join(temporaryRoot, 'output'),
        packageManifest,
        provisionalReleaseId,
      });
    }

    const manifestPath = path.join(releaseRoot, 'app-release.json');
    const manifest = parseManifest(await readFile(manifestPath, 'utf8'));
    if (manifest.appId !== options.project.config.name) {
      throw new Error(
        `Release package app id ${manifest.appId} does not match local App ${options.project.config.name}.`,
      );
    }
    const releaseId =
      options.releaseId ??
      defaultReleaseId(manifest.version, manifest.artifactSha256);
    assertSafeSegment(releaseId, 'release id');
    const finalManifest: AppReleaseManifest = { ...manifest, releaseId };
    await writeFile(
      manifestPath,
      `${JSON.stringify(finalManifest, null, 2)}\n`,
      'utf8',
    );
    if (path.basename(releaseRoot) !== releaseId) {
      const renamedRoot = path.join(path.dirname(releaseRoot), releaseId);
      await rename(releaseRoot, renamedRoot);
      releaseRoot = renamedRoot;
    }
    const archivePath = path.join(temporaryRoot, `${releaseId}.tgz`);
    const entries = ['app-release.json', 'package.json', 'dist'];
    await create(
      {
        cwd: releaseRoot,
        file: archivePath,
        gzip: true,
        noMtime: true,
        portable: true,
        strict: true,
      },
      entries,
    );
    return {
      archivePath,
      manifest: finalManifest,
      remove: () => rm(temporaryRoot, { force: true, recursive: true }),
    };
  } catch (error) {
    await rm(temporaryRoot, { force: true, recursive: true });
    throw error;
  }
}

async function runAppReleasePack(options: {
  directory: string;
  outputRoot: string;
  packageManager: PackageManager;
  provisionalReleaseId: string;
}): Promise<string> {
  await mkdir(options.outputRoot, { recursive: true });
  const scriptArguments = [
    '--release-id',
    options.provisionalReleaseId,
    '--output-root',
    options.outputRoot,
  ];
  await runCommand(
    options.packageManager,
    [
      'run',
      'release:pack',
      ...(options.packageManager === 'pnpm' ? [] : ['--']),
      ...scriptArguments,
    ],
    { cwd: options.directory, timeoutMs: 15 * 60 * 1000 },
  );
  const candidates = await findReleaseDirectories(
    options.outputRoot,
    options.provisionalReleaseId,
  );
  if (candidates.length !== 1) {
    throw new Error(
      `release:pack produced ${candidates.length} matching release directories; expected exactly one.`,
    );
  }
  return candidates[0];
}

async function createGenericRelease(options: {
  appId: string;
  appDirectory: string;
  outputRoot: string;
  packageManifest: AppPackageManifest;
  provisionalReleaseId: string;
}): Promise<string> {
  assertSafeSegment(options.appId, 'app id');
  const version = requireText(
    options.packageManifest.version,
    'package version',
  );
  const distRoot = path.join(options.appDirectory, 'dist');
  await requireFile(path.join(distRoot, 'server', 'embedded.js'));
  await requireFile(path.join(distRoot, 'client', 'index.html'));
  const artifactSha256 = await hashDirectory(distRoot);
  const releaseRoot = path.join(
    options.outputRoot,
    options.appId,
    'releases',
    options.provisionalReleaseId,
  );
  await mkdir(releaseRoot, { recursive: true });
  await cp(distRoot, path.join(releaseRoot, 'dist'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const manifest: AppReleaseManifest = {
    schemaVersion: 1,
    appId: options.appId,
    releaseId: options.provisionalReleaseId,
    version,
    artifactSha256,
    runtime: {
      backend: 'in-process',
      isolation: 'in-process',
      tier: 'warm',
      healthPath: '/healthz',
    },
  };
  await writeFile(
    path.join(releaseRoot, 'app-release.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(releaseRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: requireText(options.packageManifest.name, 'package name'),
        ...(options.packageManifest.displayName
          ? { displayName: options.packageManifest.displayName }
          : {}),
        version,
        private: true,
        type: options.packageManifest.type ?? 'module',
        app: {
          enabled: true,
          appName: options.appId,
          ...(options.packageManifest.displayName
            ? { displayName: options.packageManifest.displayName }
            : {}),
          version,
          healthPath: '/healthz',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return releaseRoot;
}

async function findReleaseDirectories(
  outputRoot: string,
  releaseId: string,
): Promise<string[]> {
  const candidates: string[] = [];
  for (const app of await readDirectories(outputRoot)) {
    const target = path.join(outputRoot, app, 'releases', releaseId);
    if (await isFile(path.join(target, 'app-release.json'))) {
      candidates.push(target);
    }
  }
  return candidates;
}

async function readDirectories(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function readPackageManifest(
  directory: string,
): Promise<AppPackageManifest> {
  return JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  ) as AppPackageManifest;
}

function parseManifest(content: string): AppReleaseManifest {
  const value = JSON.parse(content) as Partial<AppReleaseManifest>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.appId !== 'string' ||
    typeof value.releaseId !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.artifactSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.artifactSha256)
  ) {
    throw new Error('release:pack produced an invalid app-release.json.');
  }
  assertSafeSegment(value.appId, 'app id');
  assertSafeSegment(value.releaseId, 'release id');
  return value as AppReleaseManifest;
}

function defaultReleaseId(version: string, artifactSha256: string): string {
  const versionSegment = version
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `release-${versionSegment || 'app'}-${artifactSha256.slice(0, 16)}`;
}

async function hashDirectory(root: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const hash = createHash('sha256');
  for (const file of await listFiles(resolvedRoot)) {
    const relative = path
      .relative(resolvedRoot, file)
      .split(path.sep)
      .join('/');
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Release input must not contain symbolic links: ${target}`,
        );
      }
      if (entry.isDirectory()) await visit(target);
      if (entry.isFile()) files.push(target);
    }
  };
  await visit(root);
  return files;
}

async function requireFile(filePath: string): Promise<void> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`Required file missing: ${filePath}`);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function assertSafeSegment(value: string, label: string): void {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(`${label} must be a safe path segment.`);
  }
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}
