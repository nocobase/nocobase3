import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_STATE_DIR, type AppConfig } from './scaffold.ts';

export interface AppProject {
  /** Root of the app, i.e. the directory holding `.nocobase/`. */
  directory: string;
  config: AppConfig;
  /** Existing legacy projects keep their `.nb3` state until the next explicit migration. */
  stateDirectory?: string;
}

async function readConfig(
  directory: string,
): Promise<{ config: AppConfig; stateDirectory: string } | undefined> {
  for (const stateDirectory of [APP_STATE_DIR, '.nb3']) {
    try {
      return {
        config: parseAppConfig(
          JSON.parse(
            await readFile(
              path.join(directory, stateDirectory, 'config.json'),
              'utf8',
            ),
          ),
        ),
        stateDirectory,
      };
    } catch {
      // Try the compatibility directory next.
    }
  }
  return undefined;
}

async function readUnlinkedApp(
  directory: string,
): Promise<AppConfig | undefined> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    ) as {
      name?: unknown;
      nocobase?: { plugins?: unknown };
    };
    if (
      typeof manifest.name !== 'string' ||
      !manifest.nocobase ||
      typeof manifest.nocobase.plugins !== 'object' ||
      manifest.nocobase.plugins === null
    ) {
      return undefined;
    }
    return { name: manifest.name };
  } catch {
    return undefined;
  }
}

/**
 * Walks up from `startDirectory` looking for local app state or an application manifest, so scripts also work before
 * the first Hub association.
 */
export async function findAppProject(
  startDirectory: string,
): Promise<AppProject | undefined> {
  let directory = path.resolve(startDirectory);

  for (;;) {
    const stored = await readConfig(directory);
    const config = stored?.config ?? (await readUnlinkedApp(directory));

    if (config) {
      return { config, directory, stateDirectory: stored?.stateDirectory };
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
    'Run this from inside an app, pass --dir, or create one with `pnpm create @nocobase/app <name>`.',
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
  const stateDirectory =
    project.stateDirectory ?? (await hasStateDirectory(project.directory));
  await mkdir(path.join(project.directory, stateDirectory), {
    recursive: true,
  });
  await writeFile(
    path.join(project.directory, stateDirectory, 'config.json'),
    `${JSON.stringify(cleanAppConfig(config), null, 2)}\n`,
    'utf8',
  );
  project.stateDirectory = stateDirectory;
}

function parseAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid app configuration.');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string' || !record.name.trim()) {
    throw new Error('Invalid app configuration name.');
  }
  return cleanAppConfig({
    name: record.name,
    ...(typeof record.hub === 'string' ? { hub: record.hub } : {}),
    ...(typeof record.applicationId === 'string'
      ? { applicationId: record.applicationId }
      : {}),
    ...(typeof record.slug === 'string' ? { slug: record.slug } : {}),
    ...(typeof record.template === 'string'
      ? { template: record.template }
      : {}),
    ...(typeof record.templateVersion === 'string'
      ? { templateVersion: record.templateVersion }
      : {}),
  });
}

function cleanAppConfig(config: AppConfig): AppConfig {
  return {
    name: config.name,
    ...(config.hub ? { hub: config.hub } : {}),
    ...(config.applicationId ? { applicationId: config.applicationId } : {}),
    ...(config.slug ? { slug: config.slug } : {}),
    ...(config.template ? { template: config.template } : {}),
    ...(config.templateVersion
      ? { templateVersion: config.templateVersion }
      : {}),
  };
}

async function hasStateDirectory(directory: string): Promise<string> {
  try {
    await access(path.join(directory, APP_STATE_DIR));
    return APP_STATE_DIR;
  } catch {
    try {
      await access(path.join(directory, '.nb3'));
      return '.nb3';
    } catch {
      return APP_STATE_DIR;
    }
  }
}
