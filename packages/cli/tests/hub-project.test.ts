import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HUB_HOST,
  DEFAULT_HUB_PORT,
  HUB_STATE_DIR,
  findHubProject,
  hubUrl,
  requireHubProject,
  writeHubConfig,
} from '../src/lib/hub-project.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createHub(name = 'my-hub'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-hub-test-'));
  created.push(root);

  const directory = path.join(root, name);
  await mkdir(path.join(directory, HUB_STATE_DIR), { recursive: true });
  await writeHubConfig(directory, {
    host: DEFAULT_HUB_HOST,
    name,
    port: DEFAULT_HUB_PORT,
  });

  return directory;
}

describe('findHubProject', () => {
  it('finds the hub at its root', async () => {
    const directory = await createHub();
    const project = await findHubProject(directory);

    expect(project?.directory).toBe(directory);
    expect(project?.config.name).toBe('my-hub');
  });

  it('walks up from a nested directory', async () => {
    const directory = await createHub();
    const nested = path.join(directory, 'app-dist', 'crm');
    await mkdir(nested, { recursive: true });

    expect((await findHubProject(nested))?.directory).toBe(directory);
  });

  /**
   * Apps and hubs both keep a `.nb3/` directory, so the file inside it is what tells them apart. Without this an app
   * directory would resolve as a hub and the hub commands would act on the wrong project.
   */
  it('does not mistake an app for a hub', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-app-not-hub-'));
    created.push(root);

    await mkdir(path.join(root, HUB_STATE_DIR), { recursive: true });
    await writeFile(
      path.join(root, HUB_STATE_DIR, 'config.json'),
      JSON.stringify({ name: 'crm' }),
      'utf8',
    );

    expect(await findHubProject(root)).toBeUndefined();
  });
});

describe('requireHubProject', () => {
  it('explains how to proceed when there is no hub', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'nb3-not-a-hub-'));
    created.push(empty);

    await expect(requireHubProject(empty)).rejects.toThrow(/No hub found/);
  });
});

describe('writeHubConfig', () => {
  it('persists a change so the next command reads it back', async () => {
    const directory = await createHub();

    await writeHubConfig(directory, {
      host: '0.0.0.0',
      name: 'my-hub',
      port: 3100,
    });
    const project = await requireHubProject(directory);

    expect(project.config.port).toBe(3100);
    expect(project.config.host).toBe('0.0.0.0');
  });
});

describe('hubUrl', () => {
  it('builds a url from the recorded host and port', () => {
    expect(hubUrl({ host: '127.0.0.1', name: 'h', port: 3000 })).toBe(
      'http://127.0.0.1:3000/hub',
    );
  });

  /** 0.0.0.0 and :: are bind addresses; neither is something a browser can open. */
  it.each(['0.0.0.0', '::'])(
    'turns the bind address %s into something openable',
    (host) => {
      expect(hubUrl({ host, name: 'h', port: 3000 })).toBe(
        'http://localhost:3000/hub',
      );
    },
  );

  it('brackets a concrete IPv6 host', () => {
    expect(hubUrl({ host: '::1', name: 'h', port: 13_000 })).toBe(
      'http://[::1]:13000/hub',
    );
  });
});
