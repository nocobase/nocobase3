import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findAppProject,
  requireAppProject,
  writeAppConfig,
} from '../src/lib/app-project.ts';
import { APP_STATE_DIR } from '../src/lib/scaffold.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createApp(name = 'crm'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-app-test-'));
  created.push(root);

  const directory = path.join(root, name);
  await mkdir(path.join(directory, APP_STATE_DIR), { recursive: true });
  await writeFile(
    path.join(directory, APP_STATE_DIR, 'config.json'),
    JSON.stringify({
      name,
      template: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    }),
    'utf8',
  );

  return directory;
}

describe('findAppProject', () => {
  it('finds the app at its root', async () => {
    const directory = await createApp();
    const project = await findAppProject(directory);

    expect(project?.directory).toBe(directory);
    expect(project?.config.name).toBe('crm');
  });

  it('walks up from a nested directory, so commands work anywhere inside a project', async () => {
    const directory = await createApp();
    const nested = path.join(directory, 'client', 'components');
    await mkdir(nested, { recursive: true });

    expect((await findAppProject(nested))?.directory).toBe(directory);
  });

  it('returns nothing outside an app', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'nb3-not-an-app-'));
    created.push(empty);

    expect(await findAppProject(empty)).toBeUndefined();
  });
});

describe('requireAppProject', () => {
  it('explains how to proceed when there is no app', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'nb3-not-an-app-'));
    created.push(empty);

    await expect(requireAppProject(empty)).rejects.toThrow(/No app found/);
  });
});

describe('writeAppConfig', () => {
  it('persists a change so the next command reads it back', async () => {
    const directory = await createApp();
    const project = await requireAppProject(directory);

    await writeAppConfig(project, {
      ...project.config,
      hub: 'http://localhost:3000',
    });

    const reloaded = await requireAppProject(directory);
    expect(reloaded.config.hub).toBe('http://localhost:3000');
  });

  it('writes readable json', async () => {
    const directory = await createApp();
    const project = await requireAppProject(directory);

    await writeAppConfig(project, project.config);
    const raw = await readFile(
      path.join(directory, APP_STATE_DIR, 'config.json'),
      'utf8',
    );

    expect(raw).toContain('\n');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('drops obsolete source-management fields from stored config', async () => {
    const directory = await createApp();
    await writeFile(
      path.join(directory, APP_STATE_DIR, 'config.json'),
      JSON.stringify({
        name: 'crm',
        repositoryMode: 'snapshot',
        sourceCommit: 'abc123',
      }),
    );
    const project = await requireAppProject(directory);

    expect(project.config).toEqual({ name: 'crm' });
    await writeAppConfig(project, project.config);
    expect(
      JSON.parse(
        await readFile(
          path.join(directory, APP_STATE_DIR, 'config.json'),
          'utf8',
        ),
      ),
    ).toEqual({ name: 'crm' });
  });
});

/**
 * `app destroy` resolves its target through the same upward search, which is exactly why it must compare the result
 * against the path it was given. Handed a subdirectory, the search happily returns the app root — deleting that would
 * remove a whole app when the user pointed at one folder inside it.
 */
describe('destroy target resolution', () => {
  it('resolves a subdirectory to the app root, which is why destroy compares the two', async () => {
    const directory = await createApp();
    const nested = path.join(directory, 'scripts');
    await mkdir(nested, { recursive: true });

    const project = await findAppProject(nested);

    expect(project?.directory).toBe(directory);
    expect(project?.directory).not.toBe(nested);
  });
});
