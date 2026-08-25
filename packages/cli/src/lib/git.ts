import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeHubUrl } from './hub-client.ts';
import { runCommand, type RunCommandResult } from './run-command.ts';

export interface CloneHubRepositoryOptions {
  cloneUrl: string;
  destination: string;
  accessToken: string;
  branch?: string;
  hub?: string;
  gitCommand?: string;
}

export interface PushHubRepositoryOptions {
  readonly cloneUrl: string;
  readonly directory: string;
  readonly accessToken: string;
  readonly branch?: string;
  readonly hub: string;
  readonly gitCommand?: string;
}

export async function cloneHubRepository(
  options: CloneHubRepositoryOptions,
): Promise<RunCommandResult> {
  if (options.hub) assertHubCloneUrl(options.cloneUrl, options.hub);
  const destination = path.resolve(options.destination);
  const destinationParent = path.dirname(destination);
  await mkdir(destinationParent, { recursive: true });
  let destinationExisted = false;
  try {
    const entries = await readdir(destination);
    destinationExisted = true;
    if (entries.length !== 0) {
      throw new Error(
        `The clone destination "${destination}" is not empty. Choose another directory.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const staging = await mkdtemp(path.join(destinationParent, '.nb3-clone-'));
  const askpassDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nb3-git-askpass-'),
  );
  const askpass = path.join(
    askpassDirectory,
    process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh',
  );
  let moved = false;
  let removedEmptyDestination = false;
  try {
    await writeFile(askpass, askpassScript(), { mode: 0o700 });
    const args = [
      '-c',
      'credential.helper=',
      '-c',
      'http.followRedirects=false',
      'clone',
      '--branch',
      options.branch ?? 'main',
      '--single-branch',
      '--',
      options.cloneUrl,
      staging,
    ];
    const result = await runCommand(options.gitCommand ?? 'git', args, {
      env: {
        ...process.env,
        GIT_ASKPASS: askpass,
        GIT_ASKPASS_REQUIRE: 'force',
        GIT_TERMINAL_PROMPT: '0',
        NB3_GIT_ACCESS_TOKEN: options.accessToken,
      },
    });
    if (destinationExisted) {
      await rmdir(destination);
      removedEmptyDestination = true;
    }
    try {
      await rename(staging, destination);
    } catch (error) {
      if (removedEmptyDestination)
        await mkdir(destination).catch(() => undefined);
      throw error;
    }
    moved = true;
    return result;
  } finally {
    if (!moved) await rm(staging, { recursive: true, force: true });
    await rm(askpassDirectory, { recursive: true, force: true });
  }
}

export async function pushHubRepository(
  options: PushHubRepositoryOptions,
): Promise<RunCommandResult> {
  assertHubCloneUrl(options.cloneUrl, options.hub);
  return withAskpass(options.accessToken, (askpass, environment) =>
    runCommand(
      options.gitCommand ?? 'git',
      [
        'push',
        '--porcelain',
        '--',
        options.cloneUrl,
        `HEAD:${options.branch ?? 'main'}`,
      ],
      {
        cwd: path.resolve(options.directory),
        env: { ...process.env, ...environment, GIT_ASKPASS: askpass },
      },
    ),
  );
}

export async function readGitHead(
  directory: string,
  gitCommand: string = 'git',
): Promise<string> {
  const result = await runCommand(gitCommand, ['rev-parse', 'HEAD'], {
    cwd: path.resolve(directory),
    env: process.env,
  });
  const commit = result.stdout.trim();
  if (!/^[0-9a-f]{40,64}$/i.test(commit)) {
    throw new Error('Git returned an invalid HEAD commit.');
  }
  return commit.toLowerCase();
}

export async function assertGitWorktreeClean(
  directory: string,
  gitCommand: string = 'git',
): Promise<void> {
  const result = await runCommand(
    gitCommand,
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd: path.resolve(directory), env: process.env },
  );
  if (result.stdout.trim()) {
    throw new Error(
      'The app worktree has uncommitted changes. Commit or discard them before publishing.',
    );
  }
}

async function withAskpass<T>(
  accessToken: string,
  operation: (askpass: string, environment: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'nb3-git-askpass-'));
  const askpass = path.join(
    temporary,
    process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh',
  );
  try {
    await writeFile(askpass, askpassScript(), { mode: 0o700 });
    return await operation(askpass, {
      GIT_ASKPASS_REQUIRE: 'force',
      GIT_TERMINAL_PROMPT: '0',
      NB3_GIT_ACCESS_TOKEN: accessToken,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function assertHubCloneUrl(cloneUrl: string, hub: string): void {
  const normalizedHub = normalizeHubUrl(hub);
  let clone: URL;
  try {
    clone = new URL(cloneUrl);
  } catch (cause) {
    throw new Error('Hub returned an invalid repository clone URL.', { cause });
  }
  const hubUrl = new URL(`${normalizedHub}/`);
  const gitPrefix = `${hubUrl.pathname.replace(/\/+$/, '')}/git/`;
  if (
    clone.protocol !== hubUrl.protocol ||
    clone.host !== hubUrl.host ||
    !clone.pathname.startsWith(gitPrefix) ||
    !clone.pathname.endsWith('.git') ||
    clone.username ||
    clone.password ||
    clone.search ||
    clone.hash
  ) {
    throw new Error(
      `Hub returned a repository URL outside its Git endpoint: ${cloneUrl}`,
    );
  }
}

function askpassScript(): string {
  if (process.platform === 'win32') {
    return [
      '@echo off',
      'echo %* | findstr /I "Username" >nul',
      'if %errorlevel%==0 (echo oauth2) else (echo %NB3_GIT_ACCESS_TOKEN%)',
      '',
    ].join('\r\n');
  }
  return [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "oauth2" ;;',
    '  *) printf "%s\\n" "$NB3_GIT_ACCESS_TOKEN" ;;',
    'esac',
    '',
  ].join('\n');
}
