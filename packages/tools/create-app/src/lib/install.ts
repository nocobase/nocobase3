import { access } from 'node:fs/promises';
import path from 'node:path';
import { CommandFailedError, runCommand } from './run-command.ts';

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 60 * 1000;
const REBUILD_TIMEOUT_MS = 5 * 60 * 1000;

export interface InstallOptions {
  directory: string;
  registry?: string;
}

/** Installs the generated project's dependencies. */
export async function installDependencies(
  options: InstallOptions,
): Promise<void> {
  const args = ['install'];

  if (options.registry) {
    args.push(`--registry=${options.registry}`);
  }

  try {
    await runCommand('pnpm', args, {
      cwd: options.directory,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof CommandFailedError) {
      throw new Error(
        `Installing dependencies failed.\n${error.stderr || error.message}`,
        { cause: error },
      );
    }

    throw error;
  }
}

export interface DriverVerification {
  ok: boolean;
  /** True when the driver only worked after its build was re-run, which is worth telling the user about. */
  rebuilt?: boolean;
  /** Set when the driver installed but cannot be loaded, with an explanation of the likely cause. */
  reason?: string;
}

/**
 * The native package every template's default database connection needs.
 *
 * It arrives transitively rather than being installed by name: each template depends on `@nocobase/db-sqlite`, which
 * depends on `better-sqlite3`. That makes it the one native addon a generated project is guaranteed to need, and the
 * only one worth checking. The other entries in `ALLOWED_BUILDS` do not qualify — `oracledb` is not installed unless
 * the application adds that dialect itself, and `esbuild` resolves its binary from a platform package rather than
 * compiling one, so neither fails the way this does.
 */
export const DEFAULT_NATIVE_DRIVER = 'better-sqlite3';

/**
 * Confirms the native driver actually loads.
 *
 * `better-sqlite3` ships no usable JavaScript fallback: if its install script did not run, the package directory
 * exists and `pnpm install` reports success, but the first query fails at runtime with "Could not locate the bindings
 * file" — an error that points at nothing actionable. The most common cause is `ignore-scripts=true` in the user's
 * npm configuration, which suppresses install scripts globally and outranks the `allowBuilds` entry written into the
 * generated project. Catching it here turns a confusing runtime failure into a message that names the cause.
 */
export async function verifyDriver(
  directory: string,
  driver: string = DEFAULT_NATIVE_DRIVER,
): Promise<DriverVerification> {
  try {
    await access(path.join(directory, 'node_modules', driver));
  } catch {
    // Nothing to verify. The driver is not named in any manifest this command writes — it reaches the tree through
    // the template's own dialect package — so a template that does not use SQLite legitimately has no copy of it,
    // and an install that genuinely failed already reported so.
    return { ok: true };
  }

  if (await driverLoads(directory, driver)) {
    return { ok: true };
  }

  // A driver that installed but will not load almost always just needs its build to run, most often because
  // `ignore-scripts` is set globally. Rebuilding the one package fixes that without touching the user's configuration,
  // so it is worth attempting before reporting a failure they would have to act on themselves.
  try {
    await runCommand('pnpm', ['rebuild', driver], {
      cwd: directory,
      timeoutMs: REBUILD_TIMEOUT_MS,
    });
  } catch {
    return { ok: false, reason: await explainBuildFailure(driver) };
  }

  return (await driverLoads(directory, driver))
    ? { ok: true, rebuilt: true }
    : { ok: false, reason: await explainBuildFailure(driver) };
}

/** Loads the driver in a child process, which is the only way to know its native addon is actually present. */
async function driverLoads(
  directory: string,
  driver: string,
): Promise<boolean> {
  try {
    await runCommand(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import('${driver}').then((m) => new m.default(':memory:').close())`,
      ],
      { cwd: directory, timeoutMs: VERIFY_TIMEOUT_MS },
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * `pnpm rebuild` is the remedy in both cases, and deliberately so: it runs the build for one named package, which
 * works even while `ignore-scripts` stays on globally. Re-running `pnpm install` does not help — the package is
 * already in the store, so pnpm skips it and reports success without ever compiling anything.
 */
async function explainBuildFailure(driver: string): Promise<string> {
  const remedy = [
    '',
    'To finish the install, run this inside the app directory:',
    `  pnpm rebuild ${driver}`,
  ];

  if (await npmConfigIgnoresScripts()) {
    return [
      `${driver} installed but its native addon was not compiled, because install scripts are disabled.`,
      'Your npm configuration sets ignore-scripts=true, which suppresses build scripts globally and outranks the',
      'allowBuilds entry in the generated project. Rebuilding one package by name works without changing that setting.',
      ...remedy,
    ].join('\n');
  }

  return [
    `${driver} installed but its native addon could not be loaded.`,
    'This usually means its install script did not run, or no prebuilt binary matches this platform.',
    ...remedy,
  ].join('\n');
}

/**
 * Reads the effective `ignore-scripts` setting. Resolved through npm rather than pnpm because the value most often
 * comes from `~/.npmrc`, which both tools read.
 */
async function npmConfigIgnoresScripts(): Promise<boolean> {
  try {
    const { stdout } = await runCommand(
      'npm',
      ['config', 'get', 'ignore-scripts'],
      {
        timeoutMs: VERIFY_TIMEOUT_MS,
      },
    );

    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

const SKILLS_SYNC_TIMEOUT_MS = 2 * 60 * 1000;

export interface SkillsSyncResult {
  ok: boolean;
  /** Set when the sync did not run to completion, with something the user can act on. */
  reason?: string;
}

/**
 * Copies the skills of every registered plugin into the app's `.agents/skills/`.
 *
 * This only works once the dependencies are installed, because the plugins the sync reads from are resolved out of
 * `node_modules`. The template ships the script and the CLI behind it, so the generated app owns the command and
 * running it here is the same thing the user would run themselves after a plugin upgrade.
 *
 * Skills are an assistive layer rather than something the app needs to boot, so a failure is reported and the
 * generated project is still usable — the caller warns instead of aborting.
 */
export async function syncPluginSkills(
  directory: string,
): Promise<SkillsSyncResult> {
  try {
    await runCommand('pnpm', ['run', 'plugin:skills:sync'], {
      cwd: directory,
      timeoutMs: SKILLS_SYNC_TIMEOUT_MS,
    });

    return { ok: true };
  } catch (error) {
    const detail =
      error instanceof CommandFailedError
        ? error.stderr || error.message
        : (error as Error).message;

    return {
      ok: false,
      reason: [
        'Could not synchronize plugin skills into .agents/skills.',
        detail,
        '',
        'To do it later, run this inside the app directory:',
        '  pnpm plugin:skills:sync',
      ].join('\n'),
    };
  }
}
