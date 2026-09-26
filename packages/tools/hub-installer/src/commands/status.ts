import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Flags } from '@oclif/core';
import { readCurrent } from '../lib/current-link.ts';
import { healthUrl, readHubEnv } from '../lib/env-file.ts';
import { checkHealth } from '../lib/health.ts';
import { layoutOf, releaseDir } from '../lib/layout.ts';
import { currentNodeMajor } from '../lib/prechecks.ts';
import { resolveTemplateVersion } from '../lib/registry.ts';
import { readState } from '../lib/state.ts';
import type { CommandDeps, CommandOutcome } from './install.ts';

export const STATUS_FLAGS = {
  dir: Flags.string({
    description:
      'Hub root managed by hub-installer. Defaults to the current directory.',
  }),
  offline: Flags.boolean({
    default: false,
    description: 'Skip asking the registry for a newer version.',
  }),
  json: Flags.boolean({
    default: false,
    description: 'Print one JSON result on stdout.',
  }),
};

export interface StatusInput {
  flags: { dir?: string; offline: boolean; json: boolean };
}

/** Bytes used by a directory tree, not following symbolic links. */
export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else if (entry.isFile()) {
      total += (await lstat(full)).size;
    }
  }
  return total;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`;
}

export async function status(
  input: StatusInput,
  deps: CommandDeps,
): Promise<CommandOutcome> {
  const root = path.resolve(deps.cwd ?? process.cwd(), input.flags.dir ?? '.');
  const layout = layoutOf(root);
  const state = await readState(layout);
  const env = await readHubEnv(layout);
  const link = await readCurrent(layout);

  const releases = [];
  for (const record of state.releases) {
    const dir = releaseDir(layout, record.version);
    releases.push({
      version: record.version,
      current: record.version === state.current,
      installedAt: record.installedAt,
      nodeMajor: record.buildTarget.nodeMajor,
      sizeBytes: await directorySize(dir),
    });
  }
  const backups = (
    await readdir(layout.backupsDir).catch(() => [] as string[])
  ).sort();

  const url = healthUrl(env);
  const healthy = await checkHealth(url, deps.fetchImpl);

  let processInfo: Awaited<ReturnType<typeof deps.pm2.describe>> | null = null;
  try {
    processInfo = (await deps.pm2.describe(state.name)) ?? null;
  } catch {
    deps.reporter.warn('pm2 could not be queried; process state is unknown.');
  }

  const currentRelease = state.releases.find(
    (record) => record.version === state.current,
  );
  const nodeMajor = currentNodeMajor();
  const nodeMatches = currentRelease?.buildTarget.nodeMajor === nodeMajor;
  if (!nodeMatches) {
    deps.reporter.warn(
      `The current release was built for Node ${currentRelease?.buildTarget.nodeMajor ?? '?'}, but this machine runs Node ${nodeMajor}; it will not load its native modules until it is rebuilt.`,
    );
  }

  let latest: string | null = null;
  if (!input.flags.offline) {
    try {
      latest = await resolveTemplateVersion(
        state.registry,
        'latest',
        deps.fetchImpl,
      );
    } catch {
      deps.reporter.warn(
        `Could not ask ${state.registry} for the latest version.`,
      );
    }
  }

  return {
    status: 'success',
    result: {
      directory: root,
      name: state.name,
      current: state.current,
      currentLink: link ?? null,
      dialect: state.dialect,
      registry: state.registry,
      releases,
      backups,
      health: { url, ok: healthy },
      process: processInfo,
      node: {
        machine: nodeMajor,
        release: currentRelease?.buildTarget.nodeMajor ?? null,
        matches: nodeMatches,
      },
      latest,
      updateAvailable: latest === null ? null : latest !== state.current,
    },
    summary: [
      `Hub ${state.current} at ${root}`,
      `  Health    ${healthy ? 'ok' : 'not answering'} (${url})`,
      `  Process   ${processInfo ? `${processInfo.status}, pid ${processInfo.pid}, ${processInfo.restarts} restarts` : 'not registered with pm2'} (${state.name})`,
      `  Node      machine ${nodeMajor}, release ${currentRelease?.buildTarget.nodeMajor ?? '?'}${nodeMatches ? '' : ' — mismatch'}`,
      ...(latest === null
        ? []
        : [
            `  Latest    ${latest}${latest === state.current ? ' (installed)' : ' (update available)'}`,
          ]),
      '  Releases',
      ...releases.map(
        (release) =>
          `    ${release.current ? '*' : ' '} ${release.version}  ${formatSize(release.sizeBytes)}  ${release.installedAt}`,
      ),
      ...(backups.length > 0
        ? ['  Backups', ...backups.map((backup) => `    ${backup}`)]
        : []),
    ],
  };
}
