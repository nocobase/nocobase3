import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  HubRepositoryService,
  type GitHttpBackendProcess,
} from '../../server/hub/repository-service.ts';
import { HubDomainError } from '../../server/hub/store.ts';

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('HubRepositoryService', () => {
  it('creates an application bare repository atomically from a deterministic bundle', async () => {
    const fixture = await createSeedFixture('bundle');
    const sourceRoot = path.join(fixture.root, 'sources');
    const service = new HubRepositoryService({
      sourceRoot,
      seedPath: fixture.seedPath,
    });

    await expect(service.create('application-1')).resolves.toEqual({
      applicationId: 'application-1',
      defaultBranch: 'main',
      headCommit: fixture.initialCommit,
      initialCommit: fixture.initialCommit,
      status: 'ready',
    });

    expect(service.repositoryPath('application-1')).toBe(
      path.join(sourceRoot, 'application-1.git'),
    );
    await expect(
      runGit([
        `--git-dir=${service.repositoryPath('application-1')}`,
        'rev-parse',
        '--is-bare-repository',
      ]),
    ).resolves.toBe('true');
    await expect(readdir(sourceRoot)).resolves.toEqual(['application-1.git']);
    await expect(
      access(path.join(sourceRoot, 'application-1.git', 'node_modules')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(service.getStatus('application-1')).resolves.toEqual({
      applicationId: 'application-1',
      defaultBranch: 'main',
      headCommit: fixture.initialCommit,
      status: 'ready',
    });
  });

  it('creates a repository from an injected deterministic bare seed', async () => {
    const fixture = await createSeedFixture('bare');
    const service = new HubRepositoryService({
      sourceRoot: path.join(fixture.root, 'sources'),
      seedPath: fixture.seedPath,
    });

    await expect(service.create('application-2')).resolves.toMatchObject({
      headCommit: fixture.initialCommit,
      initialCommit: fixture.initialCommit,
      status: 'ready',
    });
  });

  it('allows only one concurrent atomic create and removes the losing temporary repository', async () => {
    const fixture = await createSeedFixture('bundle');
    const sourceRoot = path.join(fixture.root, 'sources');
    const service = new HubRepositoryService({
      sourceRoot,
      seedPath: fixture.seedPath,
    });

    const results = await Promise.allSettled([
      service.create('concurrent-app'),
      service.create('concurrent-app'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: {
        code: 'REPOSITORY_INIT_FAILED',
        retryable: true,
      },
    });
    await expect(readdir(sourceRoot)).resolves.toEqual(['concurrent-app.git']);
    await expect(service.getStatus('concurrent-app')).resolves.toMatchObject({
      headCommit: fixture.initialCommit,
      status: 'ready',
    });
  });

  it('rejects a non-bare directory as a repository seed', async () => {
    const fixture = await createSeedFixture('bundle');
    const sourceRoot = path.join(fixture.root, 'sources');
    const service = new HubRepositoryService({
      sourceRoot,
      seedPath: path.join(fixture.root, 'seed-worktree'),
    });

    await expect(service.create('invalid-seed-app')).rejects.toMatchObject({
      code: 'REPOSITORY_INIT_FAILED',
      retryable: true,
    });
    await expect(readdir(sourceRoot)).resolves.toEqual([]);
  });

  it('cleans temporary repositories after initialization fails and supports saga compensation', async () => {
    const fixture = await createSeedFixture('bare', 'not-main');
    const sourceRoot = path.join(fixture.root, 'sources');
    const service = new HubRepositoryService({
      sourceRoot,
      seedPath: fixture.seedPath,
    });

    await expect(service.create('failed-app')).rejects.toMatchObject({
      code: 'REPOSITORY_INIT_FAILED',
      status: 500,
      retryable: true,
    });
    await expect(readdir(sourceRoot)).resolves.toEqual([]);

    const validFixture = await createSeedFixture('bundle');
    const validService = new HubRepositoryService({
      sourceRoot,
      seedPath: validFixture.seedPath,
    });
    await validService.create('compensated-app');
    await expect(validService.remove('compensated-app')).resolves.toBe(true);
    await expect(validService.remove('compensated-app')).resolves.toBe(false);
    await expect(readdir(sourceRoot)).resolves.toEqual([]);
  });

  it('distinguishes missing commits from commits not reachable from main', async () => {
    const fixture = await createSeedFixture('bundle');
    const service = new HubRepositoryService({
      sourceRoot: path.join(fixture.root, 'sources'),
      seedPath: fixture.seedPath,
    });
    await service.create('commit-app');

    await expect(
      service.assertCommitReachableFromMain(
        'commit-app',
        fixture.initialCommit,
      ),
    ).resolves.toBe(fixture.initialCommit);
    await expect(
      service.assertCommitReachableFromMain('commit-app', '0'.repeat(40)),
    ).rejects.toMatchObject({
      code: 'SOURCE_COMMIT_NOT_FOUND',
      status: 404,
      retryable: false,
    });

    const unreachableCommit = await pushUnreachableCommit(
      service.repositoryPath('commit-app'),
      fixture.root,
    );
    await expect(
      service.assertCommitReachableFromMain('commit-app', unreachableCommit),
    ).rejects.toMatchObject({
      code: 'SOURCE_COMMIT_NOT_REACHABLE',
      status: 422,
      retryable: false,
    });
  });

  it('generates repository paths on the server and rejects traversal and symlink repositories', async () => {
    const fixture = await createSeedFixture('bare');
    const sourceRoot = path.join(fixture.root, 'sources');
    const service = new HubRepositoryService({
      sourceRoot,
      seedPath: fixture.seedPath,
    });

    expect(() => service.repositoryPath('../outside')).toThrowError(
      HubDomainError,
    );
    expect(() => service.repositoryPath('nested/application')).toThrowError(
      HubDomainError,
    );

    await mkdir(sourceRoot, { recursive: true });
    await symlink(fixture.seedPath, path.join(sourceRoot, 'linked-app.git'));
    await expect(service.getStatus('linked-app')).rejects.toMatchObject({
      code: 'REPOSITORY_UNAVAILABLE',
      status: 503,
    });
  });

  it('opens git-http-backend with a generated safe repository path', async () => {
    const fixture = await createSeedFixture('bundle');
    const service = new HubRepositoryService({
      sourceRoot: path.join(fixture.root, 'sources'),
      seedPath: fixture.seedPath,
    });
    await service.create('http-app');

    const backend = await service.openGitHttpBackend({
      applicationId: 'http-app',
      operation: 'advertise',
      service: 'git-upload-pack',
      remoteUser: 'agent-user',
    });
    backend.stdin.end();
    const [stdout, stderr] = await Promise.all([
      readProcessStream(backend.stdout),
      readProcessStream(backend.stderr),
      backend.completion,
    ]);

    expect(stderr.toString('utf8')).toBe('');
    expect(stdout.toString('latin1')).toContain(
      'Content-Type: application/x-git-upload-pack-advertisement',
    );
    expect(stdout.toString('latin1')).toContain(fixture.initialCommit);
  });

  it('maps unsupported smart HTTP requests to a domain error before spawning Git', async () => {
    const fixture = await createSeedFixture('bundle');
    const service = new HubRepositoryService({
      sourceRoot: path.join(fixture.root, 'sources'),
      seedPath: fixture.seedPath,
    });

    await expect(
      service.openGitHttpBackend({
        applicationId: 'http-app',
        operation: 'advertise',
        service: 'git-unsupported' as 'git-upload-pack',
        remoteUser: 'agent-user',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_GIT_SERVICE',
      status: 400,
      retryable: false,
    });
  });
});

type SeedKind = 'bundle' | 'bare';

interface SeedFixture {
  root: string;
  seedPath: string;
  initialCommit: string;
}

async function createSeedFixture(
  kind: SeedKind,
  branch: string = 'main',
): Promise<SeedFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'nocobase-hub-repository-'));
  tempRoots.push(root);
  const worktree = path.join(root, 'seed-worktree');
  await runGit(['init', `--initial-branch=${branch}`, worktree]);
  await writeFile(
    path.join(worktree, 'package.json'),
    `${JSON.stringify({ name: '@example/app', version: '1.0.0' }, null, 2)}\n`,
  );
  await writeFile(path.join(worktree, 'README.md'), '# Deterministic seed\n');
  await runGit(['-C', worktree, 'add', '.']);
  await runGit(
    [
      '-C',
      worktree,
      '-c',
      'user.name=NocoBase',
      '-c',
      'user.email=developers@nocobase.com',
      'commit',
      '-m',
      'feat: initialize app',
    ],
    {
      GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
    },
  );
  const initialCommit = await runGit(['-C', worktree, 'rev-parse', 'HEAD']);

  if (kind === 'bundle') {
    const seedPath = path.join(root, 'default-template.bundle');
    await runGit(['-C', worktree, 'bundle', 'create', seedPath, branch]);
    return { root, seedPath, initialCommit };
  }

  const seedPath = path.join(root, 'default-template.git');
  await runGit(['clone', '--bare', '--', worktree, seedPath]);
  return { root, seedPath, initialCommit };
}

async function pushUnreachableCommit(
  repositoryPath: string,
  fixtureRoot: string,
): Promise<string> {
  const worktree = path.join(fixtureRoot, 'unreachable-worktree');
  await runGit(['clone', '--', repositoryPath, worktree]);
  await runGit(['-C', worktree, 'switch', '--orphan', 'side']);
  await runGit(['-C', worktree, 'rm', '-rf', '--ignore-unmatch', '.']);
  await writeFile(path.join(worktree, 'SIDE.md'), 'not reachable from main\n');
  await runGit(['-C', worktree, 'add', '.']);
  await runGit(
    [
      '-C',
      worktree,
      '-c',
      'user.name=NocoBase',
      '-c',
      'user.email=developers@nocobase.com',
      'commit',
      '-m',
      'test: add unreachable commit',
    ],
    {
      GIT_AUTHOR_DATE: '2024-01-02T00:00:00Z',
      GIT_COMMITTER_DATE: '2024-01-02T00:00:00Z',
    },
  );
  const commit = await runGit(['-C', worktree, 'rev-parse', 'HEAD']);
  await runGit(['-C', worktree, 'push', 'origin', 'HEAD:refs/heads/side']);
  return commit;
}

async function runGit(
  args: string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
  return stdout.trim();
}

async function readProcessStream(
  stream: GitHttpBackendProcess['stdout'],
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
