import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Args, Flags } from '@oclif/core';
import { runAppCli } from '../lib/app-cli.ts';
import { switchCurrent } from '../lib/current-link.ts';
import { buildEcosystemConfig } from '../lib/ecosystem.ts';
import { buildHubEnv, healthUrl, readHubEnv } from '../lib/env-file.ts';
import { EXIT_INVALID, InstallerError } from '../lib/errors.ts';
import { pm2StartFailed, waitForHealthy } from '../lib/health.ts';
import {
  HUB_BASE_PATH,
  layoutOf,
  releaseLinkTarget,
  type Layout,
} from '../lib/layout.ts';
import { acquireLock } from '../lib/lock.ts';
import type { Reporter } from '../lib/output.ts';
import {
  checkEnvVariables,
  checkPlatform,
  checkPm2,
  checkPm2NameFree,
  checkPnpm,
  checkPortFree,
  checkTar,
  checkTargetEmpty,
} from '../lib/prechecks.ts';
import type { Pm2 } from '../lib/pm2.ts';
import {
  defaultRegistry,
  normalizeRegistry,
  resolveTemplateVersion,
  type FetchLike,
} from '../lib/registry.ts';
import {
  DIALECTS,
  driversFor,
  prepareRelease,
  type Dialect,
} from '../lib/release.ts';
import { runCommand, tail, type RunCommand } from '../lib/run-command.ts';
import { writeState, type InstallerState } from '../lib/state.ts';

export const INSTALL_ARGS = {
  directory: Args.string({
    description: 'Directory to install the Hub into. Must be new or empty.',
    required: true,
  }),
};

export const INSTALL_FLAGS = {
  'hub-version': Flags.string({
    default: 'latest',
    description: 'Hub template version or dist-tag to install.',
  }),
  origin: Flags.string({
    description:
      'Public origin the Hub is reached at, without /hub, e.g. https://apps.example.com. Defaults to http://HOST:PORT.',
  }),
  host: Flags.string({
    default: '127.0.0.1',
    description:
      'Address the Hub listens on. Keep the loopback default behind a reverse proxy.',
  }),
  port: Flags.integer({
    default: 13000,
    min: 1,
    max: 65535,
    description: 'Port the Hub listens on. It must be free.',
  }),
  dialect: Flags.string({
    default: 'sqlite',
    options: [...DIALECTS],
    description:
      'Database for the Hub. Anything but SQLite needs --set for its connection.',
  }),
  set: Flags.string({
    multiple: true,
    description:
      'A config.yml setting as key=value, applied with `nocobase config set`, e.g. database.connections.main.host=db.internal. Values are YAML scalars: quote text that looks like a number or boolean, as in key=\'"0123"\'.',
  }),
  'set-from-env': Flags.string({
    multiple: true,
    description:
      'A setting read from an environment variable, as key=VARIABLE, e.g. database.connections.main.password=HUB_DB_PASSWORD.',
  }),
  registry: Flags.string({
    description: 'npm registry for the Hub template and NocoBase packages.',
  }),
  name: Flags.string({
    default: 'nocobase-hub',
    description: 'pm2 process name.',
  }),
  start: Flags.boolean({
    allowNo: true,
    default: true,
    description: 'Start the Hub with pm2 once it is installed.',
  }),
  'health-timeout': Flags.integer({
    default: 180,
    min: 1,
    description: 'Seconds to wait for the Hub to answer its health check.',
  }),
  'keep-source': Flags.boolean({
    default: false,
    description:
      'Keep the build directory with the sources and development dependencies, also when the install fails.',
  }),
  json: Flags.boolean({
    default: false,
    description: 'Print one JSON result on stdout; progress stays on stderr.',
  }),
};

export interface InstallInput {
  directory: string;
  flags: {
    'hub-version': string;
    origin?: string;
    host: string;
    port: number;
    dialect: string;
    set?: string[];
    'set-from-env'?: string[];
    registry?: string;
    name: string;
    start: boolean;
    'health-timeout': number;
    'keep-source': boolean;
    json: boolean;
  };
}

export interface CommandDeps {
  reporter: Reporter;
  pm2: Pm2;
  fetchImpl?: FetchLike;
  cwd?: string;
  /** Runs every child process the command starts; replaced in tests. */
  run?: RunCommand;
}

export interface CommandOutcome {
  status: 'success' | 'success-noop';
  result: Record<string, unknown>;
  /** Lines for a person, printed on stdout when not in JSON mode. */
  summary: string[];
}

function parsePairs(
  values: readonly string[] | undefined,
  flag: string,
): [string, string][] {
  return (values ?? []).map((value) => {
    const index = value.indexOf('=');
    if (index <= 0 || index === value.length - 1) {
      throw new InstallerError(
        'INVALID_USAGE',
        `--${flag} expects key=value, got "${value}".`,
        { exitCode: EXIT_INVALID },
      );
    }
    return [value.slice(0, index), value.slice(index + 1)];
  });
}

async function logTail(layout: Layout): Promise<string> {
  const text = await readFile(
    path.join(layout.logsDir, 'hub.err.log'),
    'utf8',
  ).catch(() => '');
  return tail(text, 30);
}

/**
 * Removes what a failed install wrote. The target was new or empty when the install began, so everything in it now
 * came from this run. `created` is the topmost directory the install created, which may be a parent of the root;
 * `keep` names entries to leave, such as the build directory under `--keep-source`.
 */
async function cleanUp(
  root: string,
  created: string | undefined,
  keep: readonly string[],
): Promise<void> {
  if (created && keep.length === 0) {
    await rm(created, { recursive: true, force: true });
    return;
  }
  for (const entry of await readdir(root).catch(() => [] as string[])) {
    if (keep.includes(entry)) continue;
    await rm(path.join(root, entry), { recursive: true, force: true });
  }
}

export async function install(
  input: InstallInput,
  deps: CommandDeps,
): Promise<CommandOutcome> {
  const { flags } = input;
  const { reporter, pm2 } = deps;
  const run = deps.run ?? runCommand;
  const root = path.resolve(deps.cwd ?? process.cwd(), input.directory);
  const layout = layoutOf(root);
  const dialect = flags.dialect as Dialect;
  const registry = normalizeRegistry(flags.registry ?? defaultRegistry());
  const origin = (flags.origin ?? `http://${flags.host}:${flags.port}`).replace(
    /\/+$/u,
    '',
  );
  const sets = parsePairs(flags.set, 'set');
  const setsFromEnv = parsePairs(flags['set-from-env'], 'set-from-env');

  if (!/^https?:\/\/[^/]+$/u.test(origin)) {
    throw new InstallerError(
      'INVALID_USAGE',
      `--origin must be a protocol and host without a path, such as https://apps.example.com; got "${origin}".`,
      { exitCode: EXIT_INVALID },
    );
  }

  // Everything that can be checked is checked before the first write, so a failed precheck leaves nothing behind.
  checkPlatform();
  await checkTargetEmpty(root);
  checkEnvVariables(setsFromEnv.map(([, variable]) => variable));
  await checkPnpm(run);
  await checkTar(run);
  if (flags.start) {
    await checkPm2(pm2);
    await checkPm2NameFree(pm2, flags.name);
  }
  await checkPortFree(flags.host, flags.port);
  const version = await resolveTemplateVersion(
    registry,
    flags['hub-version'],
    deps.fetchImpl,
  );
  if (!flags.origin) {
    reporter.warn(
      `No --origin given; the Hub will build links for ${origin}. Pass --origin with the public address before exposing it.`,
    );
  }

  // `mkdir` returns the first directory it created, so a failure can remove parents the install made as well.
  const created = await mkdir(root, { recursive: true });
  let releaseLock: () => Promise<void>;
  try {
    releaseLock = await acquireLock(layout.lockFile);
  } catch (error) {
    if (created) await rm(created, { recursive: true, force: true });
    throw error;
  }
  let switched = false;
  try {
    reporter.progress(`Installing the Hub ${version} into ${root}`);
    const drivers = driversFor(dialect);
    const prepared = await prepareRelease({
      layout,
      version,
      registry,
      drivers,
      keepSource: flags['keep-source'],
      reporter,
      run,
    });

    await writeFile(
      layout.hubEnv,
      buildHubEnv(layout, { origin, host: flags.host, port: flags.port }),
    );
    const env = await readHubEnv(layout);
    const cli = { releaseDir: prepared.dir, cwd: root, env, run };

    reporter.progress('Writing config.yml');
    await runAppCli(
      ['config', 'init', '--config', layout.configFile, '--dialect', dialect],
      cli,
    );
    if (sets.length > 0) {
      await runAppCli(
        ['config', 'set', ...sets.map(([key, value]) => `${key}=${value}`)],
        cli,
      );
    }
    for (const [key, variable] of setsFromEnv) {
      await runAppCli(
        ['config', 'set', '--from-env', `${key}=${variable}`],
        cli,
      );
    }
    await runAppCli(['config', 'check'], cli);

    reporter.progress('Applying database migrations');
    await runAppCli(['db', 'apply'], cli);

    // Everything else the root needs is written first: the switch is the last write before starting, so a failure
    // anywhere up to it leaves nothing half-installed for status and install to disagree about.
    await mkdir(layout.logsDir, { recursive: true });
    await writeFile(
      layout.ecosystemFile,
      buildEcosystemConfig({ name: flags.name, nodePath: process.execPath }),
    );
    const at = new Date().toISOString();
    const state: InstallerState = {
      schemaVersion: 1,
      name: flags.name,
      registry,
      dialect,
      drivers,
      current: version,
      releases: [
        { version, installedAt: at, buildTarget: prepared.buildTarget },
      ],
      history: [{ action: 'install', to: version, at }],
    };
    await writeState(layout, state);
    await switchCurrent(layout, releaseLinkTarget(version));
    switched = true;

    const url = healthUrl(env);
    const startCommand = `pm2 start ${layout.ecosystemFile} && pm2 save`;
    if (flags.start) {
      reporter.progress('Starting the Hub with pm2');
      await pm2.start(layout.ecosystemFile, root);
      const healthy = await waitForHealthy(url, {
        timeoutMs: flags['health-timeout'] * 1000,
        fetchImpl: deps.fetchImpl,
        failed: pm2StartFailed(pm2, flags.name),
      });
      if (!healthy) {
        // The name was free before this install, so the process under it is the one just started.
        await pm2.remove(flags.name).catch(() => undefined);
        throw new InstallerError(
          'START_FAILED',
          `The Hub did not become healthy at ${url} (waited up to ${flags['health-timeout']}s). It is installed but not running.`,
          {
            details: { log: await logTail(layout) },
            suggestions: [
              {
                message: 'Read the error log:',
                run: `tail -n 100 ${path.join(layout.logsDir, 'hub.err.log')}`,
              },
              { message: 'Start it again once fixed:', run: startCommand },
            ],
          },
        );
      }
      await pm2.save();
    }

    const hubUrl = `${origin}${HUB_BASE_PATH}/`;
    const nextCommands = [
      ...(flags.start ? [] : [startCommand]),
      'pm2 startup',
    ];
    return {
      status: 'success',
      result: {
        directory: root,
        version,
        release: prepared.dir,
        dialect,
        url: hubUrl,
        healthUrl: url,
        name: flags.name,
        started: flags.start,
        configFile: layout.configFile,
        storageDir: layout.storageDir,
        nextCommands,
      },
      summary: [
        `Hub ${version} is installed at ${root}${flags.start ? ' and running' : ''}.`,
        `  URL       ${hubUrl}`,
        '  Sign in   users.initialAdmin in config.yml (template default nocobase / admin123); change the password after signing in',
        `  Logs      pm2 logs ${flags.name}`,
        'Next steps',
        ...(flags.start ? [] : [`  Start it: ${startCommand}`]),
        '  Start pm2 at boot: run `pm2 startup` and execute the command it prints (needs sudo).',
        `  Proxy ${origin} to http://${flags.host}:${flags.port} with location / and client_max_body_size 260m.`,
      ],
    };
  } catch (error) {
    // Before the switch nothing is in use yet, so a retry should find the target as empty as it was.
    // After it, the release, configuration and data are real and stay.
    if (!switched) {
      await releaseLock();
      const keep = flags['keep-source'] ? ['.build'] : [];
      await cleanUp(root, created, keep);
      if (keep.length > 0) {
        reporter.warn(
          `The build directory was kept for inspection: ${path.join(layout.buildDir)}. Remove it before installing into ${root} again.`,
        );
      }
    }
    throw error;
  } finally {
    await releaseLock();
  }
}
