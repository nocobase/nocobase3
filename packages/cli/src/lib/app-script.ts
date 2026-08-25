import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type AppProject, requireAppProject } from './app-project.ts';
import {
  detectPackageManager,
  type PackageManager,
} from './package-manager.ts';

export interface AppAddress {
  port?: number;
  host?: string;
}

export interface AppScriptPlan {
  project: AppProject;
  packageManager: PackageManager;
  /** Arguments for the package manager, e.g. `['run', 'dev']`. */
  args: string[];
  /** Environment for the child process, with the requested address applied. */
  env: NodeJS.ProcessEnv;
}

export interface ResolveAppScriptOptions {
  /** Name of the npm script to run, e.g. `dev`. */
  script: string;
  /** App directory. Defaults to searching upwards from the working directory. */
  dir?: string;
  /** Address the app should listen on, when the command accepts one. */
  address?: AppAddress;
}

/**
 * Builds the environment a script runs with, applying the address the user asked for.
 *
 * The address travels in the environment rather than on the command line. The template's `dev` and `start` scripts read
 * `APP_SERVER_HOST` and `APP_SERVER_PORT` and never look at argv, and forwarding through a package manager is not
 * portable anyway: `pnpm run dev -- --port 3100` hands the script a literal `--` that npm and yarn swallow.
 *
 * `HOST` and `PORT` are set alongside them because Vite- and Refine-based templates read those instead. A template that
 * reads neither pair is unaffected.
 */
export function applyAddress(
  env: NodeJS.ProcessEnv,
  address: AppAddress = {},
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(address.host === undefined
      ? {}
      : { APP_SERVER_HOST: address.host, HOST: address.host }),
    ...(address.port === undefined
      ? {}
      : {
          APP_SERVER_PORT: String(address.port),
          PORT: String(address.port),
        }),
  };
}

/**
 * Works out how to run one of an app's own npm scripts.
 *
 * The app commands differ only in which script they run, so the shared part — locating the project, checking the
 * script exists, and picking the package manager the project already uses — lives here. Detecting the package manager
 * rather than assuming one keeps the CLI from leaving a second lockfile next to the one that is already there.
 */
export async function resolveAppScript(
  options: ResolveAppScriptOptions,
): Promise<AppScriptPlan> {
  const project = await requireAppProject(options.dir);
  const manifest = JSON.parse(
    await readFile(path.join(project.directory, 'package.json'), 'utf8'),
  ) as { packageManager?: string; scripts?: Record<string, string> };

  if (!manifest.scripts?.[options.script]) {
    throw new Error(
      `"${project.config.name}" has no ${options.script} script in its package.json.`,
    );
  }

  const packageManager = await detectPackageManager(
    project.directory,
    manifest.packageManager,
  );

  return {
    args: ['run', options.script],
    env: applyAddress(process.env, options.address),
    packageManager,
    project,
  };
}
