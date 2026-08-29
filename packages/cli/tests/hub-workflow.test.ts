import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { HubClient } from '../src/lib/hub-client.ts';
import {
  resolveApplication,
  resolveRemoteApplicationContext,
} from '../src/lib/hub-workflow.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('Hub workflow context', () => {
  it('explains that a saved Hub comes from an associated project', async () => {
    const directory = await createTemporaryDirectory();

    await expect(
      resolveRemoteApplicationContext({ directory }),
    ).rejects.toThrow(
      'No Hub was specified. Pass --hub <url> or run the command inside a project associated with a Hub.',
    );
  });

  it('explains that a saved app comes from an associated project', async () => {
    await expect(
      resolveApplication({} as HubClient, undefined),
    ).rejects.toThrow(
      'No app was specified. Pass --app <slug> or run the command inside a project associated with an app.',
    );
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-hub-workflow-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}
