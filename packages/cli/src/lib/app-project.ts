import { readFile, writeFile } from 'node:fs/promises';
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
