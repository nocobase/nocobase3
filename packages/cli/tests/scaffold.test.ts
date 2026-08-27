import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertTargetIsUsable,
  scaffoldFromTemplate,
} from '../src/lib/scaffold.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-scaffold-test-'));
  created.push(directory);
  return directory;
}

async function createTemplate(
  files: Record<string, string> = {},
): Promise<string> {
  const directory = await createTempDirectory();
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: '@nocobase/hub',
      version: '0.1.0',
      publishConfig: { access: 'public' },
      repository: { type: 'git', url: 'git+https://example.com/repo.git' },
    }),
    'utf8',
  );
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return directory;
}

describe('assertTargetIsUsable', () => {
  it('accepts a missing or empty directory', async () => {
    const parent = await createTempDirectory();
    await expect(
      assertTargetIsUsable(path.join(parent, 'new-hub')),
    ).resolves.toBeUndefined();
    await expect(
      assertTargetIsUsable(await createTempDirectory()),
    ).resolves.toBeUndefined();
  });

  it('refuses to overwrite existing contents', async () => {
    const directory = await createTempDirectory();
    await writeFile(path.join(directory, 'keep.txt'), 'keep', 'utf8');
    await expect(assertTargetIsUsable(directory)).rejects.toThrow(
      /already exists and is not empty/u,
    );
  });
});

describe('scaffoldFromTemplate', () => {
  it('creates a private project without template publishing metadata', async () => {
    const templateDirectory = await createTemplate({
      'client/index.ts': 'export {};\n',
      gitignore: 'node_modules\n',
    });
    const targetDirectory = path.join(await createTempDirectory(), 'my-hub');

    await scaffoldFromTemplate({
      name: 'my-hub',
      targetDirectory,
      templateDirectory,
      extraFiles: { '.nb3/hub.json': '{"name":"my-hub"}\n' },
    });

    const manifest = JSON.parse(
      await readFile(path.join(targetDirectory, 'package.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      name: 'my-hub',
      version: '0.1.0',
      private: true,
    });
    expect(manifest.publishConfig).toBeUndefined();
    expect(manifest.repository).toBeUndefined();
    await expect(
      readFile(path.join(targetDirectory, '.gitignore'), 'utf8'),
    ).resolves.toContain('node_modules');
    await expect(
      readFile(path.join(targetDirectory, 'client/index.ts'), 'utf8'),
    ).resolves.toContain('export');
    await expect(
      readFile(path.join(targetDirectory, '.nb3/hub.json'), 'utf8'),
    ).resolves.toContain('my-hub');
  });
});
