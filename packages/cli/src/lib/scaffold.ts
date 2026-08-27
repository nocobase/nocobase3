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

/** Local state for a generated app lives here, mirroring the `.nocobase/` a hub keeps. */
export const APP_STATE_DIR = '.nocobase';

export interface AppConfig {
  name: string;
  /** Hub application identity for projects cloned from the Hub-managed repository. */
  applicationId?: string;
  hub?: string;
  slug?: string;
  /** How this working copy exchanges source with the Hub repository. */
  repositoryMode?: 'clone' | 'snapshot';
  /** Last Hub source commit synchronized with this working copy. */
  sourceCommit?: string;
  /** Template provenance exists for locally scaffolded apps, but not necessarily for Hub clones. */
  template?: string;
  templateVersion?: string;
}

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
 * npm refuses to publish a `.gitignore`, so templates ship it as `.npmignore` or `gitignore` and the file has to be
 * restored on the way out. Without this the generated project would commit `node_modules`.
 */
async function restoreGitignore(directory: string): Promise<void> {
  for (const candidate of ['gitignore', '.npmignore']) {
    const source = path.join(directory, candidate);
    const target = path.join(directory, '.gitignore');

    try {
      await rename(source, target);
      return;
    } catch {
      // Try the next candidate; a template may ship neither.
    }
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
 * The template's `package.json` name and version belong to the template, not to what is being created from it, so both
 * are replaced and the publish metadata is dropped — neither an app nor a hub should be publishable by accident. The
 * dependency ranges are left exactly as packed: pnpm already resolved `workspace:` and `catalog:` into real versions
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

export interface ScaffoldAppOptions {
  templateDirectory: string;
  targetDirectory: string;
  name: string;
  templateName: string;
  templateVersion: string;
}

export async function scaffoldApp(options: ScaffoldAppOptions): Promise<void> {
  const config: AppConfig = {
    name: options.name,
    template: options.templateName,
    templateVersion: options.templateVersion,
  };

  await scaffoldFromTemplate({
    extraFiles: {
      [path.join(APP_STATE_DIR, 'config.json')]:
        `${JSON.stringify(config, null, 2)}\n`,
    },
    name: options.name,
    targetDirectory: options.targetDirectory,
    templateDirectory: options.templateDirectory,
  });
}

export async function removeDirectory(directory: string): Promise<void> {
  await rm(directory, { force: true, recursive: true });
}
