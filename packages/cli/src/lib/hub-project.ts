import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Local state for a hub lives here, mirroring the `.nb3/` an app keeps. */
export const HUB_STATE_DIR = '.nb3';

export interface HubConfig {
  name: string;
  port: number;
  host: string;
}

export interface HubProject {
  /** Root of the hub, i.e. the directory holding `.nb3/`. */
  directory: string;
  config: HubConfig;
}

export const DEFAULT_HUB_PORT = 13_000;
export const DEFAULT_HUB_HOST = '127.0.0.1';

function configPath(directory: string): string {
  return path.join(directory, HUB_STATE_DIR, 'hub.json');
}

async function readConfig(directory: string): Promise<HubConfig | undefined> {
  try {
    return JSON.parse(
      await readFile(configPath(directory), 'utf8'),
    ) as HubConfig;
  } catch {
    return undefined;
  }
}

/**
 * Walks up looking for the `.nb3/hub.json` a hub carries, so the hub commands work from anywhere inside a hub
 * directory. A hub is told apart from an app by which file `.nb3/` holds.
 */
export async function findHubProject(
  startDirectory: string,
): Promise<HubProject | undefined> {
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

export async function requireHubProject(
  explicitDirectory?: string,
): Promise<HubProject> {
  const startDirectory = explicitDirectory
    ? path.resolve(explicitDirectory)
    : process.cwd();
  const project = await findHubProject(startDirectory);

  if (!project) {
    throw new Error(
      [
        `No hub found in "${startDirectory}" or any directory above it.`,
        `A hub directory contains a ${HUB_STATE_DIR}/hub.json file.`,
        'Run this from inside a hub, pass --dir, or create one with `nb3 hub create <name>`.',
      ].join('\n'),
    );
  }

  return project;
}

export async function writeHubConfig(
  directory: string,
  config: HubConfig,
): Promise<void> {
  await writeFile(
    configPath(directory),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  );
}

export function hubUrl(config: HubConfig): string {
  // 0.0.0.0 is a bind address, not something a browser can open.
  const host =
    config.host === '0.0.0.0' || config.host === '::'
      ? 'localhost'
      : config.host.includes(':') && !config.host.startsWith('[')
        ? `[${config.host}]`
        : config.host;

  return `http://${host}:${config.port}/hub`;
}
