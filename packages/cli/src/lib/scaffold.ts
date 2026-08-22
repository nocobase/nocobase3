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

/** Local state for a generated app lives here, mirroring the `.nb3/` a hub keeps. */
export const APP_STATE_DIR = '.nb3';

export interface AppConfig {
  name: string;
  template: string;
  templateVersion: string;
  hub?: string;
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
  templateName: string;
  templateVersion: string;
}

/**
 * Copies an extracted template into its final location and writes the app's own metadata.
 *
 * The template's `package.json` name and version belong to the template, not to the app being created, so both are
 * replaced. The dependency ranges are left exactly as packed: pnpm already resolved `workspace:` and `catalog:` into
 * real versions when the tarball was built.
 */
export async function scaffoldApp(options: ScaffoldOptions): Promise<void> {
  const {
    name,
    targetDirectory,
    templateDirectory,
    templateName,
    templateVersion,
  } = options;

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

  const config: AppConfig = { name, template: templateName, templateVersion };
  const stateDirectory = path.join(targetDirectory, APP_STATE_DIR);

  await mkdir(stateDirectory, { recursive: true });
  await writeFile(
    path.join(stateDirectory, 'config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

export async function removeDirectory(directory: string): Promise<void> {
  await rm(directory, { force: true, recursive: true });
}
