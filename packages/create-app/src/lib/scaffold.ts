import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

async function isEmptyDirectory(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory);
    return entries.length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true;
    }

    throw error;
  }
}

export async function assertTargetIsUsable(directory: string): Promise<void> {
  if (!(await isEmptyDirectory(directory))) {
    throw new Error(
      `The directory "${directory}" already exists and is not empty. Choose another name, or remove it first.`,
    );
  }
}

/**
 * The minimum a generated project must ignore. `.env.local` carries the generated `AUTH_SECRET`, so committing it
 * would publish a credential; the rest are build output and local state.
 */
const FALLBACK_GITIGNORE = [
  'node_modules/',
  'dist/',
  'coverage/',
  '',
  '# Environment variables, including the generated AUTH_SECRET.',
  '.env',
  '.env.local',
  '',
  '# Local application state.',
  '/storage/',
  '*.log',
  '',
].join('\n');

/**
 * Ensures the generated project has a `.gitignore`.
 *
 * npm refuses to publish a file by that name, so templates ship it as `.npmignore` or `gitignore` and it has to be
 * renamed on the way out. A template may ship neither — the published `@nocobase/app-template-default` currently does
 * not — and in that case a fallback is written rather than leaving the project with no ignore rules at all, which
 * would put `node_modules` and the secret-bearing `.env.local` on the first commit.
 */
async function restoreGitignore(directory: string): Promise<void> {
  const target = path.join(directory, '.gitignore');

  for (const candidate of ['gitignore', '.npmignore']) {
    try {
      await rename(path.join(directory, candidate), target);
      return;
    } catch {
      // Try the next candidate.
    }
  }

  // `wx` leaves an existing file alone, so a template that ships a real `.gitignore` keeps it.
  try {
    await writeFile(target, FALLBACK_GITIGNORE, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch {
    // The file already exists, which is the outcome this function is for.
  }
}

export interface ScaffoldOptions {
  templateDirectory: string;
  targetDirectory: string;
  name: string;
  /** Extra files to write once the template is in place, keyed by path relative to the target. */
  extraFiles?: Record<string, string>;
}

/**
 * Copies an extracted template into its final location and rewrites its manifest.
 *
 * The template's `package.json` name and version belong to the template rather than to what is created from it, so
 * both are replaced and the publish metadata is dropped — a generated app should never be publishable by accident.
 * Dependency ranges are left exactly as packed: pnpm already resolved `workspace:` and `catalog:` into real versions
 * when the tarball was built.
 */
export async function scaffoldFromTemplate(
  options: ScaffoldOptions,
): Promise<void> {
  const { extraFiles, name, targetDirectory, templateDirectory } = options;

  await mkdir(targetDirectory, { recursive: true });
  await cp(templateDirectory, targetDirectory, { recursive: true });
  await restoreGitignore(targetDirectory);

  const manifestPath = path.join(targetDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
    string,
    unknown
  >;

  manifest.name = name;
  manifest.version = '0.1.0';
  manifest.private = true;
  delete manifest.publishConfig;
  delete manifest.repository;

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  for (const [relative, contents] of Object.entries(extraFiles ?? {})) {
    const target = path.join(targetDirectory, relative);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
}

export async function removeDirectory(directory: string): Promise<void> {
  await rm(directory, { force: true, recursive: true });
}

/**
 * Reads the template's `.env.example` so its non-database settings survive into the generated `.env.local`. A template
 * without one is not an error — the database block alone is a valid env file.
 */
export async function readEnvExample(
  directory: string,
): Promise<string | undefined> {
  try {
    return await readFile(path.join(directory, '.env.example'), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Validates an app name against what npm accepts for an unscoped package, since the name is written straight into the
 * generated `package.json`. Directory separators are rejected too: the name is also used as the default directory.
 */
export function assertValidAppName(name: string): void {
  if (name.trim() === '') {
    throw new Error('The app name cannot be empty.');
  }

  if (name.includes('/') || name.includes('\\')) {
    throw new Error(
      `"${name}" cannot be used as an app name because it contains a path separator.`,
    );
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    throw new Error(
      `"${name}" is not a valid app name. Use lowercase letters, digits, dashes, dots, and underscores, starting with a letter or digit.`,
    );
  }
}
