import {
  chmod,
  cp,
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { buildHubEnvFile } from './env-file.ts';
import { ensureAllowBuilds } from './pnpm-workspace.ts';

export const REQUIRED_PACKAGE_MANAGER = 'pnpm@11.7.0';

const FALLBACK_GITIGNORE = [
  'node_modules/',
  '',
  '# Local Hub configuration and credentials.',
  '.env',
  '.env.local',
  '',
  '# Hub database, runtime secrets, logs, and Release artifacts.',
  '.nocobase/',
  'app-dist/',
  '*.log',
  '',
].join('\n');

async function isEmptyDirectory(directory: string): Promise<boolean> {
  try {
    return (await readdir(directory)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

export async function assertTargetIsUsable(directory: string): Promise<void> {
  if (!(await isEmptyDirectory(directory))) {
    throw new Error(
      `The directory "${directory}" already exists and is not empty. Choose another directory, or empty it first.`,
    );
  }
}

async function restoreGitignore(directory: string): Promise<void> {
  const target = path.join(directory, '.gitignore');
  for (const candidate of ['gitignore', '.npmignore']) {
    try {
      await rename(path.join(directory, candidate), target);
      await appendMissingGitignoreEntries(target);
      return;
    } catch {
      // Try the next package-safe spelling.
    }
  }

  try {
    await writeFile(target, FALLBACK_GITIGNORE, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch {
    await appendMissingGitignoreEntries(target);
  }
}

async function appendMissingGitignoreEntries(target: string): Promise<void> {
  const existing = await readFile(target, 'utf8');
  const missing = [
    '.env',
    '.env.local',
    '.nocobase/',
    'app-dist/',
    '*.log',
  ].filter((entry) => !existing.split(/\r?\n/u).includes(entry));
  if (missing.length === 0) return;

  await appendFile(
    target,
    `${existing.endsWith('\n') ? '' : '\n'}\n# Local Hub configuration and runtime state.\n${missing.join('\n')}\n`,
    'utf8',
  );
}

export interface ScaffoldHubOptions {
  templateDirectory: string;
  targetDirectory: string;
  name: string;
  authSecret?: string;
}

export async function scaffoldHub(options: ScaffoldHubOptions): Promise<void> {
  const { authSecret, name, targetDirectory, templateDirectory } = options;
  await mkdir(targetDirectory, { recursive: true });
  await cp(templateDirectory, targetDirectory, { recursive: true });
  await rm(path.join(targetDirectory, '.env'), { force: true });
  await rm(path.join(targetDirectory, '.env.local'), { force: true });
  await restoreGitignore(targetDirectory);

  const manifestPath = path.join(targetDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
    string,
    unknown
  >;
  manifest.name = name;
  manifest.private = true;
  manifest.packageManager ??= REQUIRED_PACKAGE_MANAGER;
  delete manifest.displayName;
  delete manifest.description;
  delete manifest.publishConfig;
  delete manifest.repository;
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  await mkdir(path.join(targetDirectory, '.nocobase'), { recursive: true });
  await mkdir(path.join(targetDirectory, 'app-dist'), { recursive: true });

  const envPath = path.join(targetDirectory, '.env.local');
  await writeFile(envPath, buildHubEnvFile({ authSecret }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(envPath, 0o600);
  await ensureAllowBuilds(targetDirectory);
}

export function projectNameFromDirectory(directory: string): string {
  const basename = path.basename(path.resolve(directory)).toLowerCase();
  const normalized = basename
    .replaceAll(/[^a-z0-9._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/gu, '');
  return normalized || 'nocobase-hub';
}

export async function removeDirectory(directory: string): Promise<void> {
  await rm(directory, { force: true, recursive: true });
}
