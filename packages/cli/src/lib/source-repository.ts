import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  writeAppConfig,
  writePulledAppConfig,
  type AppProject,
} from './app-project.ts';
import { cloneHubRepository, pushHubRepository, readGitHead } from './git.ts';
import type { RepositoryMetadata } from './hub-client.ts';
import { runCommand } from './run-command.ts';
import { assertTargetIsUsable } from './scaffold.ts';
import { mirrorSourceTree } from './source-sync.ts';

export interface SourceSnapshotResult {
  readonly changed: boolean;
  readonly sourceCommit: string;
}

interface SourceRepositoryOptions {
  readonly accessToken: string;
  readonly gitCommand?: string;
  readonly hub?: string;
  readonly repository: RepositoryMetadata;
  /** Allows a local repository path in tests. Production callers always validate the Hub-owned HTTPS clone URL. */
  readonly unsafeLocalRepositoryForTests?: boolean;
}

export interface PushSourceSnapshotOptions extends SourceRepositoryOptions {
  readonly project: AppProject;
}

export interface PullSourceSnapshotOptions extends SourceRepositoryOptions {
  readonly project: AppProject;
}

export interface CompareSourceSnapshotOptions extends SourceRepositoryOptions {
  readonly project: AppProject;
  readonly sourceCommit: string;
}

export interface InitializeSourceSnapshotOptions extends SourceRepositoryOptions {
  readonly application: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly destination: string;
  readonly hub: string;
}

/**
 * Pushes a source-only snapshot. The local directory does not need to be a Git worktree; a temporary clone records a
 * synthetic commit in the Hub-owned repository without exposing the developer's local Git history.
 */
export async function pushSourceSnapshot(
  options: PushSourceSnapshotOptions,
): Promise<SourceSnapshotResult> {
  const temporary = await cloneToTemporary(options);
  try {
    const remoteCommit = await readGitHead(temporary.checkout, git(options));
    const baseCommit = options.project.config.sourceCommit;
    if (!baseCommit) {
      throw new Error(
        'This working copy has no synchronized Hub source commit. Run `pnpm run pull` before pushing.',
      );
    }

    if (remoteCommit !== baseCommit) {
      if (
        await sourceMatchesCommit({
          checkout: temporary.checkout,
          commit: remoteCommit,
          source: options.project.directory,
          gitCommand: git(options),
        })
      ) {
        await saveSourceCommit(options.project, remoteCommit);
        return { changed: false, sourceCommit: remoteCommit };
      }
      throw new Error(
        `Hub source advanced from ${shortCommit(baseCommit)} to ${shortCommit(remoteCommit)}. Run \`pnpm run pull\` before pushing your changes.`,
      );
    }

    await resetCheckout(temporary.checkout, remoteCommit, git(options));
    await mirrorSourceTree(options.project.directory, temporary.checkout, {
      purgeExcludedFromTarget: true,
    });
    await runCommand(git(options), ['add', '--all'], {
      cwd: temporary.checkout,
    });
    if (!(await hasStagedChanges(temporary.checkout, git(options)))) {
      await saveSourceCommit(options.project, remoteCommit);
      return { changed: false, sourceCommit: remoteCommit };
    }

    await runCommand(
      git(options),
      [
        '-c',
        'user.name=NocoBase Source Sync',
        '-c',
        'user.email=source-sync@nocobase.com',
        'commit',
        '-m',
        'chore: sync application source',
      ],
      { cwd: temporary.checkout },
    );
    const sourceCommit = await readGitHead(temporary.checkout, git(options));
    await pushTemporaryCheckout(options, temporary.checkout);
    await saveSourceCommit(options.project, sourceCommit);
    return { changed: true, sourceCommit };
  } finally {
    await rm(temporary.root, { force: true, recursive: true });
  }
}

/** Pulls the latest Hub snapshot only when doing so cannot overwrite local source changes. */
export async function pullSourceSnapshot(
  options: PullSourceSnapshotOptions,
): Promise<SourceSnapshotResult> {
  const temporary = await cloneToTemporary(options);
  try {
    const remoteCommit = await readGitHead(temporary.checkout, git(options));
    const baseCommit = options.project.config.sourceCommit;
    if (remoteCommit === baseCommit) {
      return { changed: false, sourceCommit: remoteCommit };
    }

    if (
      await sourceMatchesCommit({
        checkout: temporary.checkout,
        commit: remoteCommit,
        source: options.project.directory,
        gitCommand: git(options),
      })
    ) {
      await saveSourceCommit(options.project, remoteCommit);
      return { changed: false, sourceCommit: remoteCommit };
    }

    if (
      !baseCommit ||
      !(await sourceMatchesCommit({
        checkout: temporary.checkout,
        commit: baseCommit,
        source: options.project.directory,
        gitCommand: git(options),
      }))
    ) {
      throw new Error(
        'Local source has changed while newer source is available in the Hub. Run `pnpm run push` first or save your local changes elsewhere before pulling.',
      );
    }

    await resetCheckout(temporary.checkout, remoteCommit, git(options));
    await mirrorSourceTree(temporary.checkout, options.project.directory);
    await saveSourceCommit(options.project, remoteCommit);
    return { changed: true, sourceCommit: remoteCommit };
  } finally {
    await rm(temporary.root, { force: true, recursive: true });
  }
}

/** Checks a working copy against one Hub commit without changing either side. */
export async function sourceSnapshotMatchesCommit(
  options: CompareSourceSnapshotOptions,
): Promise<boolean> {
  const temporary = await cloneToTemporary(options);
  try {
    return await sourceMatchesCommit({
      checkout: temporary.checkout,
      commit: options.sourceCommit,
      gitCommand: git(options),
      source: options.project.directory,
    });
  } finally {
    await rm(temporary.root, { force: true, recursive: true });
  }
}

/** Initializes an empty working directory from a Hub snapshot without copying the Hub repository's Git history. */
export async function initializeSourceSnapshot(
  options: InitializeSourceSnapshotOptions,
): Promise<SourceSnapshotResult> {
  const destination = path.resolve(options.destination);
  await assertTargetIsUsable(destination);
  const temporary = await cloneToTemporary(options);
  try {
    const sourceCommit = await readGitHead(temporary.checkout, git(options));
    await mirrorSourceTree(temporary.checkout, destination);
    await writePulledAppConfig(destination, {
      applicationId: options.application.id,
      hub: options.hub,
      name: options.application.name,
      repositoryMode: 'snapshot',
      slug: options.application.slug,
      sourceCommit,
    });
    return { changed: true, sourceCommit };
  } catch (error) {
    await rm(destination, { force: true, recursive: true });
    throw error;
  } finally {
    await rm(temporary.root, { force: true, recursive: true });
  }
}

async function sourceMatchesCommit(options: {
  readonly checkout: string;
  readonly commit: string;
  readonly gitCommand: string;
  readonly source: string;
}): Promise<boolean> {
  await resetCheckout(
    options.checkout,
    options.commit,
    options.gitCommand,
  ).catch(() => {
    throw new Error(
      `The last synchronized source commit ${shortCommit(options.commit)} is no longer available in the Hub repository. Pull into a new directory before continuing.`,
    );
  });
  await mirrorSourceTree(options.source, options.checkout);
  await runCommand(options.gitCommand, ['add', '--all'], {
    cwd: options.checkout,
  });
  return !(await hasStagedChanges(options.checkout, options.gitCommand));
}

async function hasStagedChanges(
  checkout: string,
  gitCommand: string,
): Promise<boolean> {
  const status = await runCommand(
    gitCommand,
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd: checkout },
  );
  return Boolean(status.stdout.trim());
}

async function resetCheckout(
  checkout: string,
  commit: string,
  gitCommand: string,
): Promise<void> {
  await runCommand(gitCommand, ['checkout', '--detach', '--force', commit], {
    cwd: checkout,
  });
  await runCommand(gitCommand, ['clean', '-dffx'], { cwd: checkout });
}

async function cloneToTemporary(
  options: SourceRepositoryOptions,
): Promise<{ readonly checkout: string; readonly root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nocobase-source-'));
  const checkout = path.join(root, 'repository');
  try {
    await cloneHubRepository({
      accessToken: options.accessToken,
      branch: options.repository.defaultBranch,
      cloneUrl: options.repository.cloneUrl,
      destination: checkout,
      gitCommand: git(options),
      ...(options.unsafeLocalRepositoryForTests
        ? {}
        : { hub: requiredHub(options) }),
    });
    return { checkout, root };
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}

async function pushTemporaryCheckout(
  options: SourceRepositoryOptions,
  checkout: string,
): Promise<void> {
  if (options.unsafeLocalRepositoryForTests) {
    await runCommand(
      git(options),
      [
        'push',
        '--porcelain',
        '--',
        options.repository.cloneUrl,
        `HEAD:${options.repository.defaultBranch}`,
      ],
      { cwd: checkout },
    );
    return;
  }
  await pushHubRepository({
    accessToken: options.accessToken,
    branch: options.repository.defaultBranch,
    cloneUrl: options.repository.cloneUrl,
    directory: checkout,
    gitCommand: git(options),
    hub: requiredHub(options),
  });
}

async function saveSourceCommit(
  project: AppProject,
  sourceCommit: string,
): Promise<void> {
  const config = {
    ...project.config,
    repositoryMode: 'snapshot' as const,
    sourceCommit,
  };
  await writeAppConfig(project, config);
  project.config = config;
}

function git(options: SourceRepositoryOptions): string {
  return options.gitCommand ?? 'git';
}

function requiredHub(options: SourceRepositoryOptions): string {
  if (!options.hub) throw new Error('A Hub URL is required for source sync.');
  return options.hub;
}

function shortCommit(commit: string): string {
  return commit.slice(0, 12);
}
