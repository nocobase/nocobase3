import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_STATE_DIR, type AppConfig } from './scaffold.ts';

export interface AppProject {
  /** Root of the app, i.e. the directory holding `.nb3/`. */
  directory: string;
  config: AppConfig;
}

function configPath(directory: string): string {
  return path.join(directory, APP_STATE_DIR, 'config.json');
}

async function readConfig(directory: string): Promise<AppConfig | undefined> {
  try {
    return JSON.parse(
      await readFile(configPath(directory), 'utf8'),
    ) as AppConfig;
  } catch {
    return undefined;
  }
}

/**
 * Walks up from `startDirectory` looking for the `.nb3/` an app carries, so the app commands work from anywhere inside
 * a project rather than only at its root — the same way git and package managers behave.
 */
export async function findAppProject(
  startDirectory: string,
): Promise<AppProject | undefined> {
  let directory = path.resolve(startDirectory);

  for (;;) {
    const config = await readConfig(directory);

    if (config) {
      return { config, directory };
    }

    const parent = path.dirname(directory);

    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

export function formatMissingAppMessage(startDirectory: string): string {
  return [
    `No app found in "${startDirectory}" or any directory above it.`,
    `An app directory contains a ${APP_STATE_DIR}/config.json file.`,
    'Run this from inside an app, pass --dir, or create one with `nb3 app create <name>`.',
  ].join('\n');
}

/**
 * Resolves the app a command should act on: the directory given explicitly, or the one found by walking up from the
 * working directory. Throws with guidance rather than returning undefined, because every caller needs an app.
 */
export async function requireAppProject(
  explicitDirectory?: string,
): Promise<AppProject> {
  const startDirectory = explicitDirectory
    ? path.resolve(explicitDirectory)
    : process.cwd();
  const project = await findAppProject(startDirectory);

  if (!project) {
    throw new Error(formatMissingAppMessage(startDirectory));
  }

  return project;
}

export async function writeAppConfig(
  project: AppProject,
  config: AppConfig,
): Promise<void> {
  await writeFile(
    configPath(project.directory),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Records the remote Hub identity in the existing `.nb3/config.json` format used by every app command. The file is
 * local working-copy state, so it is also excluded through Git's per-clone exclude file rather than committed.
 */
export async function writePulledAppConfig(
  directory: string,
  config: Pick<AppConfig, 'applicationId' | 'hub' | 'name' | 'slug'>,
): Promise<void> {
  const project: AppProject = {
    directory: path.resolve(directory),
    config: { ...config },
  };
  await mkdir(path.join(project.directory, APP_STATE_DIR), { recursive: true });
  await writeAppConfig(project, project.config);
  await excludeAppStateFromGit(project.directory);
}

async function excludeAppStateFromGit(directory: string): Promise<void> {
  const excludePath = path.join(directory, '.git', 'info', 'exclude');
  await mkdir(path.dirname(excludePath), { recursive: true });
  let existing = '';
  try {
    existing = await readFile(excludePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const rule = `/${APP_STATE_DIR}/`;
  if (existing.split(/\r?\n/).includes(rule)) return;
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  await appendFile(excludePath, `${prefix}${rule}\n`, 'utf8');
}
