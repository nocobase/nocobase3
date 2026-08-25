import { execFile, spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { promisify } from 'node:util';

import { HubDomainError } from './store.js';

const execFileAsync = promisify(execFile);
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const COMMIT_PATTERN = /^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
const DEFAULT_BRANCH = 'main';
const MAX_GIT_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface HubRepositoryServiceOptions {
  sourceRoot: string;
  seedPath: string;
  gitBinary?: string;
}

export interface HubRepositoryStatus {
  applicationId: string;
  defaultBranch: 'main';
  headCommit: string;
  status: 'ready';
}

export interface CreatedHubRepository extends HubRepositoryStatus {
  initialCommit: string;
}

export type GitSmartHttpService = 'git-upload-pack' | 'git-receive-pack';
export type GitSmartHttpOperation = 'advertise' | 'rpc';

export interface OpenGitHttpBackendRequest {
  applicationId: string;
  operation: GitSmartHttpOperation;
  service: GitSmartHttpService;
  remoteUser: string;
  remoteAddress?: string;
  contentLength?: number;
  gitProtocol?: string;
}

export interface GitHttpBackendProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  completion: Promise<void>;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export class HubRepositoryService {
  private readonly sourceRoot: string;
  private readonly seedPath: string;
  private readonly gitBinary: string;

  constructor(options: HubRepositoryServiceOptions) {
    this.sourceRoot = path.resolve(options.sourceRoot);
    this.seedPath = path.resolve(options.seedPath);
    this.gitBinary = options.gitBinary ?? 'git';
  }

  repositoryPath(applicationId: string): string {
    assertApplicationId(applicationId);
    return resolveInside(
      this.sourceRoot,
      `${applicationId}.git`,
      'Repository path escaped the configured source root.',
    );
  }

  async create(applicationId: string): Promise<CreatedHubRepository> {
    const destination = this.repositoryPath(applicationId);
    let temporaryRepository: string | undefined;

    try {
      await mkdir(this.sourceRoot, { recursive: true });
      await this.assertSupportedSeed();
      temporaryRepository = await mkdtemp(
        path.join(this.sourceRoot, `.create-${applicationId}-`),
      );
      await this.runGit([
        'clone',
        '--bare',
        '--no-hardlinks',
        '--branch',
        DEFAULT_BRANCH,
        '--',
        this.seedPath,
        temporaryRepository,
      ]);
      await this.runGit([
        `--git-dir=${temporaryRepository}`,
        'symbolic-ref',
        'HEAD',
        `refs/heads/${DEFAULT_BRANCH}`,
      ]);
      await this.runGit([
        `--git-dir=${temporaryRepository}`,
        'config',
        'http.receivepack',
        'true',
      ]);
      await this.runGit([
        `--git-dir=${temporaryRepository}`,
        'config',
        'receive.denyNonFastForwards',
        'true',
      ]);
      await this.runGit([
        `--git-dir=${temporaryRepository}`,
        'config',
        'receive.denyDeletes',
        'true',
      ]);
      const status = await this.readStatusAtPath(
        applicationId,
        temporaryRepository,
      );

      await rename(temporaryRepository, destination);
      temporaryRepository = undefined;
      return { ...status, initialCommit: status.headCommit };
    } catch (error) {
      let cause: unknown = error;
      if (temporaryRepository !== undefined) {
        try {
          await rm(temporaryRepository, { recursive: true, force: true });
        } catch (cleanupError) {
          cause = new AggregateError(
            [error, cleanupError],
            'Repository initialization and cleanup both failed.',
          );
        }
      }
      throw repositoryInitializationFailed(applicationId, cause);
    }
  }

  async remove(applicationId: string): Promise<boolean> {
    const repository = this.repositoryPath(applicationId);
    try {
      await lstat(repository);
    } catch (error) {
      if (isFileNotFound(error)) {
        return false;
      }
      throw repositoryUnavailable(applicationId, error);
    }

    try {
      await rm(repository, { recursive: true, force: true });
      return true;
    } catch (error) {
      throw repositoryUnavailable(applicationId, error);
    }
  }

  async getStatus(applicationId: string): Promise<HubRepositoryStatus> {
    const repository = await this.requireRepository(applicationId);
    try {
      return await this.readStatusAtPath(applicationId, repository);
    } catch (error) {
      if (error instanceof HubDomainError) {
        throw error;
      }
      throw repositoryUnavailable(applicationId, error);
    }
  }

  async assertCommitReachableFromMain(
    applicationId: string,
    commit: string,
  ): Promise<string> {
    const repository = await this.requireRepository(applicationId);
    if (!COMMIT_PATTERN.test(commit)) {
      throw sourceCommitNotFound(applicationId, commit);
    }

    let resolvedCommit: string;
    try {
      resolvedCommit = await this.runGit([
        `--git-dir=${repository}`,
        'rev-parse',
        '--verify',
        '--quiet',
        `${commit}^{commit}`,
      ]);
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1) {
        throw sourceCommitNotFound(applicationId, commit);
      }
      throw repositoryUnavailable(applicationId, error);
    }

    try {
      await this.runGit([
        `--git-dir=${repository}`,
        'merge-base',
        '--is-ancestor',
        resolvedCommit,
        `refs/heads/${DEFAULT_BRANCH}`,
      ]);
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1) {
        throw new HubDomainError(
          'SOURCE_COMMIT_NOT_REACHABLE',
          `Commit "${commit}" is not reachable from ${DEFAULT_BRANCH} for application "${applicationId}".`,
          { status: 422 },
        );
      }
      throw repositoryUnavailable(applicationId, error);
    }

    return resolvedCommit;
  }

  async openGitHttpBackend(
    request: OpenGitHttpBackendRequest,
  ): Promise<GitHttpBackendProcess> {
    if (!isGitSmartHttpOperation(request.operation)) {
      throw invalidGitService('Git HTTP operation is unsupported.');
    }
    if (!isGitSmartHttpService(request.service)) {
      throw invalidGitService('Git HTTP service is unsupported.');
    }
    await this.requireRepository(request.applicationId);
    assertCgiValue('remoteUser', request.remoteUser);
    if (request.remoteAddress !== undefined) {
      assertCgiValue('remoteAddress', request.remoteAddress);
    }
    if (request.gitProtocol !== undefined) {
      assertCgiValue('gitProtocol', request.gitProtocol);
    }
    if (
      request.contentLength !== undefined &&
      (!Number.isSafeInteger(request.contentLength) ||
        request.contentLength < 0)
    ) {
      throw validationError(
        'Git HTTP contentLength must be a non-negative integer.',
      );
    }

    const isAdvertisement = request.operation === 'advertise';
    const pathInfo = isAdvertisement
      ? `/${request.applicationId}.git/info/refs`
      : `/${request.applicationId}.git/${request.service}`;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      GATEWAY_INTERFACE: 'CGI/1.1',
      GIT_HTTP_EXPORT_ALL: '1',
      GIT_PROJECT_ROOT: this.sourceRoot,
      GIT_TERMINAL_PROMPT: '0',
      PATH_INFO: pathInfo,
      QUERY_STRING: isAdvertisement
        ? `service=${encodeURIComponent(request.service)}`
        : '',
      REMOTE_USER: request.remoteUser,
      REQUEST_METHOD: isAdvertisement ? 'GET' : 'POST',
      SERVER_PROTOCOL: 'HTTP/1.1',
    };
    if (!isAdvertisement) {
      environment.CONTENT_TYPE = `application/x-${request.service}-request`;
    }
    if (request.contentLength !== undefined) {
      environment.CONTENT_LENGTH = String(request.contentLength);
    }
    if (request.remoteAddress !== undefined) {
      environment.REMOTE_ADDR = request.remoteAddress;
    }
    if (request.gitProtocol !== undefined) {
      environment.HTTP_GIT_PROTOCOL = request.gitProtocol;
    }

    try {
      const child = spawn(this.gitBinary, ['http-backend'], {
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const completion = new Promise<void>((resolve, reject) => {
        child.once('error', (error: Error) => {
          reject(repositoryUnavailable(request.applicationId, error));
        });
        child.once(
          'close',
          (exitCode: number | null, signal: NodeJS.Signals | null) => {
            if (exitCode === 0) {
              resolve();
              return;
            }
            reject(
              repositoryUnavailable(
                request.applicationId,
                new Error(
                  `git http-backend exited with code ${String(exitCode)} and signal ${String(signal)}.`,
                ),
              ),
            );
          },
        );
      });

      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        completion,
        kill: (signal?: NodeJS.Signals | number): boolean => child.kill(signal),
      };
    } catch (error) {
      throw repositoryUnavailable(request.applicationId, error);
    }
  }

  private async requireRepository(applicationId: string): Promise<string> {
    const repository = this.repositoryPath(applicationId);
    try {
      const [repositoryStat, sourceRootRealPath, repositoryRealPath] =
        await Promise.all([
          lstat(repository),
          realpath(this.sourceRoot),
          realpath(repository),
        ]);
      if (
        !repositoryStat.isDirectory() ||
        repositoryStat.isSymbolicLink() ||
        path.dirname(repositoryRealPath) !== sourceRootRealPath
      ) {
        throw new Error(
          'Repository must be a real directory inside sourceRoot.',
        );
      }
      const isBare = await this.runGit([
        `--git-dir=${repository}`,
        'rev-parse',
        '--is-bare-repository',
      ]);
      if (isBare !== 'true') {
        throw new Error('Repository is not bare.');
      }
      return repository;
    } catch (error) {
      throw repositoryUnavailable(applicationId, error);
    }
  }

  private async readStatusAtPath(
    applicationId: string,
    repository: string,
  ): Promise<HubRepositoryStatus> {
    const headCommit = await this.runGit([
      `--git-dir=${repository}`,
      'rev-parse',
      '--verify',
      `${`refs/heads/${DEFAULT_BRANCH}`}^{commit}`,
    ]);
    if (!COMMIT_PATTERN.test(headCommit)) {
      throw new Error('Git returned an invalid main commit ID.');
    }
    return {
      applicationId,
      defaultBranch: DEFAULT_BRANCH,
      headCommit,
      status: 'ready',
    };
  }

  private async assertSupportedSeed(): Promise<void> {
    const seedStat = await lstat(this.seedPath);
    if (seedStat.isDirectory() && !seedStat.isSymbolicLink()) {
      const isBare = await this.runGit([
        `--git-dir=${this.seedPath}`,
        'rev-parse',
        '--is-bare-repository',
      ]);
      if (isBare !== 'true') {
        throw new Error('Repository seed directory must be a bare repository.');
      }
      return;
    }

    if (seedStat.isFile()) {
      const mainHead = await this.runGit([
        'bundle',
        'list-heads',
        this.seedPath,
        `refs/heads/${DEFAULT_BRANCH}`,
      ]);
      if (!mainHead.endsWith(` refs/heads/${DEFAULT_BRANCH}`)) {
        throw new Error(
          `Repository seed bundle must contain ${DEFAULT_BRANCH}.`,
        );
      }
      return;
    }

    throw new Error('Repository seed must be a Git bundle or bare repository.');
  }

  private async runGit(args: readonly string[]): Promise<string> {
    try {
      const result = await execFileAsync(this.gitBinary, args, {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
      });
      return result.stdout.trim();
    } catch (error) {
      throw GitCommandError.from(error);
    }
  }
}

class GitCommandError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(
    message: string,
    exitCode: number | null,
    stderr: string,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = 'GitCommandError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }

  static from(error: unknown): GitCommandError {
    const exitCode = getNumericProperty(error, 'code');
    const stderr = getStringProperty(error, 'stderr');
    return new GitCommandError(
      stderr ||
        (error instanceof Error ? error.message : 'Git command failed.'),
      exitCode,
      stderr,
      error,
    );
  }
}

function assertApplicationId(applicationId: string): void {
  if (!APPLICATION_ID_PATTERN.test(applicationId)) {
    throw validationError(
      'Application ID must contain only letters, numbers, underscores, or hyphens.',
    );
  }
}

function assertCgiValue(name: string, value: string): void {
  if (value.length === 0 || /[\0\r\n]/.test(value)) {
    throw validationError(
      `${name} is not safe for a CGI environment variable.`,
    );
  }
}

function resolveInside(root: string, child: string, message: string): string {
  const resolved = path.resolve(root, child);
  const relative = path.relative(root, resolved);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw validationError(message);
  }
  return resolved;
}

function validationError(message: string): HubDomainError {
  return new HubDomainError('VALIDATION_ERROR', message, { status: 422 });
}

function invalidGitService(message: string): HubDomainError {
  return new HubDomainError('INVALID_GIT_SERVICE', message, { status: 400 });
}

function isGitSmartHttpOperation(
  operation: unknown,
): operation is GitSmartHttpOperation {
  return operation === 'advertise' || operation === 'rpc';
}

function isGitSmartHttpService(
  service: unknown,
): service is GitSmartHttpService {
  return service === 'git-upload-pack' || service === 'git-receive-pack';
}

function repositoryInitializationFailed(
  applicationId: string,
  cause: unknown,
): HubDomainError {
  return new HubDomainError(
    'REPOSITORY_INIT_FAILED',
    `The source repository for application "${applicationId}" could not be initialized.`,
    { status: 500, retryable: true, cause },
  );
}

function repositoryUnavailable(
  applicationId: string,
  cause: unknown,
): HubDomainError {
  return new HubDomainError(
    'REPOSITORY_UNAVAILABLE',
    `The source repository for application "${applicationId}" is unavailable.`,
    { status: 503, retryable: true, cause },
  );
}

function sourceCommitNotFound(
  applicationId: string,
  commit: string,
): HubDomainError {
  return new HubDomainError(
    'SOURCE_COMMIT_NOT_FOUND',
    `Commit "${commit}" was not found in the source repository for application "${applicationId}".`,
    { status: 404 },
  );
}

function isFileNotFound(error: unknown): boolean {
  return getProperty(error, 'code') === 'ENOENT';
}

function getNumericProperty(value: unknown, key: string): number | null {
  const property = getProperty(value, key);
  return typeof property === 'number' ? property : null;
}

function getStringProperty(value: unknown, key: string): string {
  const property = getProperty(value, key);
  return typeof property === 'string' ? property : '';
}

function getProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Reflect.get(value, key);
}
