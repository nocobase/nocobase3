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

/**
 * pnpm version a generated app pins.
 *
 * The exact version matters: `packageManager` only accepts one, and a range like `pnpm@11` is silently ignored rather
 * than rejected, leaving the project on whatever pnpm the machine already had. It must stay on pnpm 11 or newer,
 * because `allowBuilds` — which lets the database driver compile its native addon — did not exist before then.
 */
export const REQUIRED_PACKAGE_MANAGER = 'pnpm@11.7.0';

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
  '/.agents/',
  '*.log',
  '',
].join('\n');

const REQUIRED_GITIGNORE_ENTRIES = ['/.agents/'] as const;

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
  let restored = false;

  for (const candidate of ['gitignore', '.npmignore']) {
    try {
      await rename(path.join(directory, candidate), target);
      restored = true;
      break;
    } catch {
      // Try the next candidate.
    }
  }

  if (!restored) {
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

  const contents = await readFile(target, 'utf8');
  const missing = REQUIRED_GITIGNORE_ENTRIES.filter(
    (entry) => !contents.split(/\r?\n/u).includes(entry),
  );
  if (missing.length > 0) {
    const separator = contents === '' || contents.endsWith('\n') ? '' : '\n';
    await writeFile(
      target,
      `${contents}${separator}\n# Agent synchronization output.\n${missing.join('\n')}\n`,
      'utf8',
    );
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
 * Only what identifies the template is touched: the name becomes the app's, and the display name, description, and
 * publish metadata are dropped so a generated app is not labelled "Default Template" or pointed at the template's own
 * release. Everything else is kept as packed, including the version, which leaves a record of the template version the
 * app came from, and the dependency ranges pnpm already resolved from `workspace:` and `catalog:` when it built the
 * tarball.
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

  // Identity and publish metadata describe the template, not what is built from it. Leaving `displayName` behind would
  // label a new app "Default Template", and leaving the publish fields would point it at the template's own release.
  delete manifest.displayName;
  delete manifest.description;
  delete manifest.publishConfig;
  delete manifest.repository;

  // `pnpm pack` strips `packageManager` from the tarball, so the template cannot carry it through to the app on its
  // own — it has to be written here. Without it the project uses whatever pnpm the machine defaults to, and pnpm 10
  // does not read `allowBuilds` at all: the native driver installs without compiling and only fails much later.
  manifest.packageManager ??= REQUIRED_PACKAGE_MANAGER;

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
