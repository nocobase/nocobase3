import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requireAppProject } from '../src/lib/app-project.ts';
import { runCommand } from '../src/lib/run-command.ts';
import {
  pullSourceSnapshot,
  pushSourceSnapshot,
} from '../src/lib/source-repository.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('Hub source snapshots', () => {
  it('pushes source without local Git history, secrets, dependencies, or state', async () => {
    const fixture = await createFixture();
    await writeSource(fixture.project, 'client/page.tsx', 'local source\n');
    await writeSource(fixture.project, '.env.production', 'SECRET=hidden\n');
    await writeSource(
      fixture.project,
      'node_modules/local/index.js',
      'hidden\n',
    );
    const project = await requireAppProject(fixture.project);

    const pushed = await pushSourceSnapshot({
      accessToken: 'secret',
      project,
      repository: fixture.repository,
      unsafeLocalRepositoryForTests: true,
    });

    expect(pushed.changed).toBe(true);
    expect(pushed.sourceCommit).not.toBe(fixture.initialCommit);
    const checkout = await cloneRemote(fixture);
    expect(await readFile(path.join(checkout, 'client/page.tsx'), 'utf8')).toBe(
      'local source\n',
    );
    await expect(
      readFile(path.join(checkout, '.env.production'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(path.join(checkout, 'node_modules/local/index.js'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await requireAppProject(fixture.project)).config.sourceCommit).toBe(
      pushed.sourceCommit,
    );

    const repeated = await pushSourceSnapshot({
      accessToken: 'secret',
      project: await requireAppProject(fixture.project),
      repository: { ...fixture.repository, headCommit: pushed.sourceCommit },
      unsafeLocalRepositoryForTests: true,
    });
    expect(repeated).toEqual({
      changed: false,
      sourceCommit: pushed.sourceCommit,
    });
  });

  it('removes source-excluded files that were previously tracked in the Hub', async () => {
    const fixture = await createFixture({
      trackedSecret: '.env.production',
    });
    await writeSource(fixture.project, 'client/page.tsx', 'safe source\n');

    await pushSourceSnapshot({
      accessToken: 'secret',
      project: await requireAppProject(fixture.project),
      repository: fixture.repository,
      unsafeLocalRepositoryForTests: true,
    });

    const checkout = await cloneRemote(fixture);
    await expect(
      readFile(path.join(checkout, '.env.production'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never pushes local npm credentials and removes a previously tracked npmrc', async () => {
    const fixture = await createFixture({ trackedSecret: '.npmrc' });
    await writeSource(
      fixture.project,
      '.npmrc',
      '//registry.example.com/:_authToken=local-secret\n',
    );
    await writeSource(fixture.project, 'client/page.tsx', 'safe source\n');

    await pushSourceSnapshot({
      accessToken: 'secret',
      project: await requireAppProject(fixture.project),
      repository: fixture.repository,
      unsafeLocalRepositoryForTests: true,
    });

    const checkout = await cloneRemote(fixture);
    await expect(
      readFile(path.join(checkout, '.npmrc'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to overwrite a newer Hub snapshot', async () => {
    const fixture = await createFixture();
    await advanceRemote(fixture, 'server/remote.ts', 'remote source\n');
    await writeSource(fixture.project, 'client/page.tsx', 'local source\n');

    await expect(
      pushSourceSnapshot({
        accessToken: 'secret',
        project: await requireAppProject(fixture.project),
        repository: fixture.repository,
        unsafeLocalRepositoryForTests: true,
      }),
    ).rejects.toThrow(/pnpm run pull/);

    const checkout = await cloneRemote(fixture);
    await expect(
      readFile(path.join(checkout, 'client/page.tsx'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('pulls a newer snapshot only when the local source still matches its base', async () => {
    const fixture = await createFixture();
    const remoteCommit = await advanceRemote(
      fixture,
      'client/page.tsx',
      'remote source\n',
    );

    const result = await pullSourceSnapshot({
      accessToken: 'secret',
      project: await requireAppProject(fixture.project),
      repository: fixture.repository,
      unsafeLocalRepositoryForTests: true,
    });

    expect(result).toEqual({ changed: true, sourceCommit: remoteCommit });
    expect(
      await readFile(path.join(fixture.project, 'client/page.tsx'), 'utf8'),
    ).toBe('remote source\n');
  });

  it('leaves the working copy untouched when local and Hub source both changed', async () => {
    const fixture = await createFixture();
    await advanceRemote(fixture, 'server/remote.ts', 'remote source\n');
    await writeSource(fixture.project, 'client/local.tsx', 'local source\n');

    await expect(
      pullSourceSnapshot({
        accessToken: 'secret',
        project: await requireAppProject(fixture.project),
        repository: fixture.repository,
        unsafeLocalRepositoryForTests: true,
      }),
    ).rejects.toThrow(/pnpm run push|local source has changed/i);

    expect(
      await readFile(path.join(fixture.project, 'client/local.tsx'), 'utf8'),
    ).toBe('local source\n');
    await expect(
      readFile(path.join(fixture.project, 'server/remote.ts'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

interface Fixture {
  readonly root: string;
  readonly project: string;
  readonly remote: string;
  readonly initialCommit: string;
  readonly repository: {
    readonly applicationId: string;
    readonly provider: string;
    readonly cloneUrl: string;
    readonly defaultBranch: string;
    readonly headCommit: string;
    readonly status: string;
    readonly updatedAt: string;
  };
}

async function createFixture(
  options: { readonly trackedSecret?: string } = {},
): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nocobase-source-repo-'));
  roots.push(root);
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const project = path.join(root, 'project');
  await runCommand('git', ['init', '--bare', '--initial-branch=main', remote]);
  await runCommand('git', ['init', '--initial-branch=main', seed]);
  await configureGit(seed);
  await writeSource(seed, 'package.json', '{"name":"sales"}\n');
  await writeSource(seed, '.gitignore', 'node_modules\n.env*\n!.env.example\n');
  if (options.trackedSecret) {
    await writeSource(seed, options.trackedSecret, 'SECRET=tracked\n');
    await runCommand('git', ['add', '--force', options.trackedSecret], {
      cwd: seed,
    });
  }
  await runCommand('git', ['add', '--all'], { cwd: seed });
  await runCommand('git', ['commit', '-m', 'Initial source'], { cwd: seed });
  await runCommand('git', ['remote', 'add', 'origin', remote], { cwd: seed });
  await runCommand('git', ['push', 'origin', 'main'], { cwd: seed });
  const initialCommit = (
    await runCommand('git', ['rev-parse', 'HEAD'], { cwd: seed })
  ).stdout.trim();
  await mkdir(path.join(project, '.nocobase'), { recursive: true });
  await writeSource(project, 'package.json', '{"name":"sales"}\n');
  await writeSource(
    project,
    '.gitignore',
    'node_modules\n.env*\n!.env.example\n',
  );
  await writeSource(
    project,
    '.nocobase/config.json',
    `${JSON.stringify({
      applicationId: 'app-1',
      hub: 'https://hub.example.com/hub',
      name: 'Sales',
      repositoryMode: 'snapshot',
      slug: 'sales',
      sourceCommit: initialCommit,
    })}\n`,
  );
  return {
    root,
    project,
    remote,
    initialCommit,
    repository: {
      applicationId: 'app-1',
      provider: 'hub',
      cloneUrl: remote,
      defaultBranch: 'main',
      headCommit: initialCommit,
      status: 'ready',
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
  };
}

async function advanceRemote(
  fixture: Fixture,
  relative: string,
  contents: string,
): Promise<string> {
  const checkout = await cloneRemote(fixture);
  await configureGit(checkout);
  await writeSource(checkout, relative, contents);
  await runCommand('git', ['add', '--all'], { cwd: checkout });
  await runCommand('git', ['commit', '-m', 'Remote update'], { cwd: checkout });
  await runCommand('git', ['push', 'origin', 'main'], { cwd: checkout });
  return (
    await runCommand('git', ['rev-parse', 'HEAD'], { cwd: checkout })
  ).stdout.trim();
}

async function cloneRemote(fixture: Fixture): Promise<string> {
  const destination = path.join(fixture.root, `clone-${crypto.randomUUID()}`);
  await runCommand('git', [
    'clone',
    '--branch',
    'main',
    fixture.remote,
    destination,
  ]);
  return destination;
}

async function configureGit(directory: string): Promise<void> {
  await runCommand('git', ['config', 'user.name', 'Test User'], {
    cwd: directory,
  });
  await runCommand('git', ['config', 'user.email', 'test@example.com'], {
    cwd: directory,
  });
}

async function writeSource(
  root: string,
  relative: string,
  contents: string,
): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}
