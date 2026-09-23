import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  OFFICIAL_DIALECTS,
  type OfficialDialect,
} from '@nocobase/app-server/database';

import { buildConfigFile } from './config-file.js';
import { configureDatabase } from './database-config.js';

/**
 * Where the command is running, which decides both what it may offer and what it can tell the user to do about a
 * missing driver.
 *
 * A source checkout has the application's TypeScript beside it and a package manager that can install into it. A
 * deployment root is an extracted `dist/`, where the drivers were fixed when the application was built: adding one
 * there writes into a tree the next build regenerates, and on a cross-platform build it would fetch a binary for the
 * wrong platform. So the two differ in where the dialect list comes from and in what the error says, and in nothing
 * else — the file this writes is identical.
 */
export type ConfigInitMode = 'source' | 'deployment';

export type ConfigInitErrorReason =
  | 'unknown-dialect'
  | 'no-drivers'
  | 'driver-missing'
  | 'already-configured'
  | 'dialect-required'
  | 'directory-missing'
  | 'application-not-found';

export class ConfigInitError extends Error {
  public readonly reason: ConfigInitErrorReason;
  /** A command the user can run as-is to get past this, when one exists. */
  public readonly suggestedCommand?: string;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    reason: ConfigInitErrorReason,
    message: string,
    options: {
      readonly suggestedCommand?: string;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message);
    this.name = 'ConfigInitError';
    this.reason = reason;
    this.suggestedCommand = options.suggestedCommand;
    this.details = options.details;
  }
}

export interface ConfigInitOptions {
  /** The application root the CLI was assembled with: the project directory, or `dist` in a deployment. */
  readonly rootDir: string;
  readonly dialect?: string;
  /** `--config`, resolved against `rootDir` exactly as the runtime resolves `APP_CONFIG_FILE`. */
  readonly configPath?: string;
  readonly force?: boolean;
  readonly environment?: NodeJS.ProcessEnv;
  /**
   * Asks which of several installed drivers to configure. Supplied by the command when a terminal is attached; its
   * absence is what makes a scripted run fail with `dialect-required` instead of waiting on a read that never returns.
   */
  readonly selectDialect?: (
    available: readonly OfficialDialect[],
  ) => Promise<OfficialDialect>;
}

export interface ConfigInitResult {
  readonly mode: ConfigInitMode;
  readonly dialect: OfficialDialect;
  readonly configFile: string;
  readonly configKey: string;
  /** Environment variables that already carry a value this file also sets, and therefore override it. */
  readonly overriddenByEnvironment: readonly string[];
}

/** The extensions the runtime accepts, in the order it probes them. */
const CONFIG_EXTENSIONS = ['.yml', '.yaml', '.toml', '.json'] as const;

/**
 * Secrets the standard templates map from the environment.
 *
 * The mapping belongs to the application, not to this command, so this is a check for the conventional names rather
 * than an authoritative reading of `server/environment.ts`. It only ever produces a warning: a value set here wins
 * over the file, so writing a fresh secret into `config.yml` would look like it worked and change nothing.
 */
const ENVIRONMENT_SECRETS = ['AUTH_SECRET', 'SESSION_SECRET'] as const;

/** Detects a source checkout by the extension of the runtime module, the same signal the runtime itself uses. */
export async function detectConfigInitMode(
  rootDir: string,
): Promise<ConfigInitMode> {
  for (const [extension, mode] of [
    ['ts', 'source'],
    ['js', 'deployment'],
  ] as const) {
    if (await isFile(path.join(rootDir, 'server', `runtime.${extension}`))) {
      return mode;
    }
  }

  throw new ConfigInitError(
    'application-not-found',
    `No application found at ${rootDir}: expected server/runtime.ts or server/runtime.js.`,
  );
}

/**
 * The directory configuration and storage live in, which is the application root in a checkout and the directory
 * holding `dist` in a deployment. This mirrors `deploymentRootDir` in the application's own runtime definition.
 */
export function resolveDeploymentRootDir(
  rootDir: string,
  mode: ConfigInitMode,
): string {
  return mode === 'source' ? rootDir : path.resolve(rootDir, '..');
}

/**
 * Dialects this application can actually load a driver for.
 *
 * In a checkout that is whatever is installed, found by walking up for `node_modules` rather than by resolving the
 * package: `@nocobase/db-sqlite` does not export its own `package.json`, so the obvious `require.resolve` of it fails
 * with `ERR_PACKAGE_PATH_NOT_EXPORTED` on a package that is present. Walking also gives the answer the runtime will
 * get, which is what matters — a workspace member resolving a driver from the repository root is correctly reported
 * as having it, even though its own manifest never declares it.
 *
 * In a deployment the installed tree is the build's, so the manifest is the honest source: it lists exactly the
 * drivers `pnpm build` carried over from the application's dependencies.
 */
export async function findAvailableDialects(
  rootDir: string,
  mode: ConfigInitMode,
): Promise<readonly OfficialDialect[]> {
  if (mode === 'deployment') {
    const manifest = await readJson(path.join(rootDir, 'package.json'));
    const dependencies = isRecord(manifest.dependencies)
      ? manifest.dependencies
      : {};
    return OFFICIAL_DIALECTS.filter((dialect) =>
      Object.hasOwn(dependencies, driverPackage(dialect)),
    );
  }

  return OFFICIAL_DIALECTS.filter((dialect) =>
    Boolean(findInstalledPackage(rootDir, driverPackage(dialect))),
  );
}

export function driverPackage(dialect: OfficialDialect): string {
  return `@nocobase/db-${dialect}`;
}

/**
 * Validates everything, then writes once.
 *
 * The order matters more than it looks. A run that wrote the file and then reported a missing driver would leave the
 * user unable to retry: the second run refuses because the application is already configured, and the only way out is
 * to delete a file they were never told about. Every check therefore happens before anything is written, so a failed
 * run leaves the directory exactly as it found it and `config init` can simply be run again.
 */
export async function runConfigInit(
  options: ConfigInitOptions,
): Promise<ConfigInitResult> {
  const rootDir = path.resolve(options.rootDir);
  const mode = await detectConfigInitMode(rootDir);
  const deploymentRootDir = resolveDeploymentRootDir(rootDir, mode);
  const available = await findAvailableDialects(rootDir, mode);
  const dialect = await resolveDialect(
    options.dialect,
    available,
    mode,
    options.selectDialect,
  );
  const configFile = resolveConfigFile(
    rootDir,
    deploymentRootDir,
    options.configPath,
  );

  await assertNotConfigured({
    configFile,
    deploymentRootDir,
    explicit: options.configPath !== undefined,
    force: options.force === true,
  });

  // Checked here rather than left to the write, so that a mistyped --config reports the directory it could not find
  // instead of an ENOENT naming the file the user did ask for.
  const targetDirectory = path.dirname(configFile);
  if (!existsSync(targetDirectory)) {
    throw new ConfigInitError(
      'directory-missing',
      `Cannot write the configuration: ${targetDirectory} does not exist.`,
      { details: { directory: targetDirectory } },
    );
  }

  const environment = options.environment ?? process.env;
  const overriddenByEnvironment = ENVIRONMENT_SECRETS.filter(
    (name) => (environment[name] ?? '').trim() !== '',
  );

  const example = await readConfigExample(deploymentRootDir);
  const contents = buildConfigFile({
    example: configureDatabase(
      example ?? '',
      dialect,
      path.basename(deploymentRootDir),
    ),
  });

  await writeFile(configFile, contents, {
    encoding: 'utf8',
    flag: options.force === true ? 'w' : 'wx',
    mode: 0o600,
  });

  return {
    mode,
    dialect,
    configFile,
    configKey: 'database.connections.main',
    overriddenByEnvironment,
  };
}

/**
 * Picks the dialect, and refuses rather than guessing when the driver for it is absent.
 *
 * With exactly one driver installed there is nothing to ask: the application can only run on that one, and a prompt
 * offering a single choice is a keystroke that carries no decision.
 */
async function resolveDialect(
  requested: string | undefined,
  available: readonly OfficialDialect[],
  mode: ConfigInitMode,
  select:
    | ((available: readonly OfficialDialect[]) => Promise<OfficialDialect>)
    | undefined,
): Promise<OfficialDialect> {
  if (requested !== undefined) {
    if (!isOfficialDialect(requested)) {
      throw new ConfigInitError(
        'unknown-dialect',
        `Unknown dialect "${requested}". Choose one of: ${OFFICIAL_DIALECTS.join(', ')}.`,
      );
    }
    assertDriverInstalled(requested, available, mode);
    return requested;
  }

  if (available.length === 0) {
    throw noDriversError(mode);
  }

  if (available.length === 1) {
    return available[0];
  }

  if (select) {
    const chosen = await select(available);
    assertDriverInstalled(chosen, available, mode);
    return chosen;
  }

  throw new ConfigInitError(
    'dialect-required',
    `Several database drivers are installed (${available.join(', ')}). Pass --dialect to choose one.`,
    { details: { availableDialects: available } },
  );
}

export function assertDriverInstalled(
  dialect: OfficialDialect,
  available: readonly OfficialDialect[],
  mode: ConfigInitMode,
): void {
  if (available.includes(dialect)) {
    return;
  }

  const packageName = driverPackage(dialect);

  if (mode === 'deployment') {
    throw new ConfigInitError(
      'driver-missing',
      `This build does not include ${packageName}. Install it in the application sources and build again.`,
      { details: { dialect, missingDrivers: [packageName] } },
    );
  }

  throw new ConfigInitError(
    'driver-missing',
    `The ${dialect} driver is not installed.`,
    {
      suggestedCommand: `pnpm add ${packageName}`,
      details: { dialect, missingDrivers: [packageName] },
    },
  );
}

function noDriversError(mode: ConfigInitMode): ConfigInitError {
  if (mode === 'deployment') {
    return new ConfigInitError(
      'no-drivers',
      'This build includes no database driver. Install one in the application sources and build again.',
    );
  }

  return new ConfigInitError(
    'no-drivers',
    `No database driver is installed. Install the one this application should use, for example: ${driverPackage('sqlite')}.`,
    { suggestedCommand: `pnpm add ${driverPackage('sqlite')}` },
  );
}

/**
 * Where the file goes, mirroring how the application resolves it.
 *
 * The asymmetry is the application's, not an accident here: a configured path is taken relative to the root the
 * runtime was given, while the default sits beside the deployment root along with `storage/`. Writing the default to
 * the other one produces a file the application never reads.
 */
function resolveConfigFile(
  rootDir: string,
  deploymentRootDir: string,
  configPath: string | undefined,
): string {
  return configPath === undefined
    ? path.join(deploymentRootDir, 'config.yml')
    : path.resolve(rootDir, configPath);
}

/**
 * Refuses to touch an application that already has configuration.
 *
 * All four extensions are checked, not just the one being written, because the runtime probes all four and takes the
 * first: writing `config.yml` beside an existing `config.toml` produces a file that is silently ignored.
 */
async function assertNotConfigured(options: {
  readonly configFile: string;
  readonly deploymentRootDir: string;
  readonly explicit: boolean;
  readonly force: boolean;
}): Promise<void> {
  if (options.force) {
    return;
  }

  const candidates = options.explicit
    ? [options.configFile]
    : CONFIG_EXTENSIONS.map((extension) =>
        path.join(options.deploymentRootDir, `config${extension}`),
      );

  const existing = candidates.find((candidate) => existsSync(candidate));

  if (existing !== undefined) {
    throw new ConfigInitError(
      'already-configured',
      `The application is already configured: ${existing}. Edit it, or pass --force to replace it.`,
      { details: { configFile: existing } },
    );
  }
}

/** The example is optional: an application without one still gets the secrets it cannot start without. */
async function readConfigExample(
  deploymentRootDir: string,
): Promise<string | undefined> {
  try {
    return await readFile(
      path.join(deploymentRootDir, 'config.example.yml'),
      'utf8',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Walks up for an installed package, which is what Node's own resolution does and what pnpm's layouts require. */
function findInstalledPackage(
  fromDir: string,
  packageName: string,
): string | undefined {
  let directory = path.resolve(fromDir);

  for (;;) {
    const candidate = path.join(
      directory,
      'node_modules',
      ...packageName.split('/'),
    );

    if (existsSync(candidate)) return candidate;

    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function isOfficialDialect(value: string): value is OfficialDialect {
  return (OFFICIAL_DIALECTS as readonly string[]).includes(value);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
