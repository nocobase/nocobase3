import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_STATE_DIR,
  assertTargetIsUsable,
  scaffoldApp,
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
      dependencies: { '@nocobase/app-server-kit': '^0.1.0' },
      name: '@nocobase/app-template-default',
      publishConfig: { access: 'public' },
      repository: { type: 'git', url: 'git+https://example.com/repo.git' },
      version: '3.1.1',
    }),
    'utf8',
  );

  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(directory, name), content, 'utf8');
  }

  return directory;
}

describe('assertTargetIsUsable', () => {
  it('accepts a directory that does not exist yet', async () => {
    const parent = await createTempDirectory();

    await expect(
      assertTargetIsUsable(path.join(parent, 'new-app')),
    ).resolves.toBeUndefined();
  });

  it('accepts an existing but empty directory', async () => {
    await expect(
      assertTargetIsUsable(await createTempDirectory()),
    ).resolves.toBeUndefined();
  });

  it('refuses to overwrite a directory that has files in it', async () => {
    const directory = await createTempDirectory();
    await writeFile(path.join(directory, 'existing.txt'), 'keep me', 'utf8');

    await expect(assertTargetIsUsable(directory)).rejects.toThrow(
      /already exists and is not empty/,
    );
  });
});

describe('scaffoldApp', () => {
  it('renames the project and marks it private', async () => {
    const templateDirectory = await createTemplate();
    const targetDirectory = path.join(await createTempDirectory(), 'crm');

    await scaffoldApp({
      name: 'crm',
      targetDirectory,
      templateDirectory,
      templateName: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });

    const manifest = JSON.parse(
      await readFile(path.join(targetDirectory, 'package.json'), 'utf8'),
    );

    expect(manifest.name).toBe('crm');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.private).toBe(true);
  });

  it('drops publish metadata so the app cannot be published by accident', async () => {
    const templateDirectory = await createTemplate();
    const targetDirectory = path.join(await createTempDirectory(), 'crm');

    await scaffoldApp({
      name: 'crm',
      targetDirectory,
      templateDirectory,
      templateName: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });

    const manifest = JSON.parse(
      await readFile(path.join(targetDirectory, 'package.json'), 'utf8'),
    );

    expect(manifest.publishConfig).toBeUndefined();
    expect(manifest.repository).toBeUndefined();
  });

  it('keeps the dependency ranges the template was packed with', async () => {
    const templateDirectory = await createTemplate();
    const targetDirectory = path.join(await createTempDirectory(), 'crm');

    await scaffoldApp({
      name: 'crm',
      targetDirectory,
      templateDirectory,
      templateName: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });

    const manifest = JSON.parse(
      await readFile(path.join(targetDirectory, 'package.json'), 'utf8'),
    );

    expect(manifest.dependencies['@nocobase/app-server-kit']).toBe('^0.1.0');
  });

  it('records where the app came from', async () => {
    const templateDirectory = await createTemplate();
    const targetDirectory = path.join(await createTempDirectory(), 'crm');

    await scaffoldApp({
      name: 'crm',
      targetDirectory,
      templateDirectory,
      templateName: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });

    const config = JSON.parse(
      await readFile(
        path.join(targetDirectory, APP_STATE_DIR, 'config.json'),
        'utf8',
      ),
    );

    expect(config).toEqual({
      name: 'crm',
      template: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });
  });

  it('restores the gitignore that npm refuses to publish', async () => {
    const templateDirectory = await createTemplate({
      gitignore: 'node_modules\n',
    });
    const targetDirectory = path.join(await createTempDirectory(), 'crm');

    await scaffoldApp({
      name: 'crm',
      targetDirectory,
      templateDirectory,
      templateName: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });

    await expect(
      readFile(path.join(targetDirectory, '.gitignore'), 'utf8'),
    ).resolves.toContain('node_modules');
  });

  it('copies nested template files', async () => {
    const templateDirectory = await createTemplate();
    await mkdir(path.join(templateDirectory, 'client'), { recursive: true });
    await writeFile(
      path.join(templateDirectory, 'client', 'App.tsx'),
      'export default null;\n',
      'utf8',
    );

    const targetDirectory = path.join(await createTempDirectory(), 'crm');

    await scaffoldApp({
      name: 'crm',
      targetDirectory,
      templateDirectory,
      templateName: '@nocobase/app-template-default',
      templateVersion: '3.1.1',
    });

    await expect(
      readFile(path.join(targetDirectory, 'client', 'App.tsx'), 'utf8'),
    ).resolves.toContain('export default');
  });
});
