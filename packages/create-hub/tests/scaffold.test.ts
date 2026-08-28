import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertTargetIsUsable,
  REQUIRED_PACKAGE_MANAGER,
  scaffoldHub,
} from '../src/lib/scaffold.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function createTemplate(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'create-hub-template-'),
  );
  created.push(directory);
  await mkdir(path.join(directory, 'server'), { recursive: true });
  await writeFile(path.join(directory, 'server/standalone.js'), 'export {};\n');
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: '@nocobase/hub',
      version: '0.2.0-beta.1',
      scripts: { start: 'node ./server/standalone.js' },
      publishConfig: { access: 'public' },
      repository: { type: 'git', url: 'https://example.test/hub.git' },
    }),
  );
  return directory;
}

describe('assertTargetIsUsable', () => {
  it('accepts a missing or empty directory and rejects a non-empty one', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'create-hub-target-'));
    created.push(parent);

    await expect(
      assertTargetIsUsable(path.join(parent, 'missing')),
    ).resolves.toBeUndefined();
    await expect(assertTargetIsUsable(parent)).resolves.toBeUndefined();
    await writeFile(path.join(parent, 'occupied.txt'), 'data');
    await expect(assertTargetIsUsable(parent)).rejects.toThrow(/not empty/u);
  });
});

describe('scaffoldHub', () => {
  it('does not carry build-time environment values from the package', async () => {
    const templateDirectory = await createTemplate();
    await writeFile(
      path.join(templateDirectory, '.env'),
      'AUTH_SECRET=build-machine-secret\nAPP_SERVER_PORT=9999\n',
    );
    const parent = await mkdtemp(path.join(os.tmpdir(), 'create-hub-env-'));
    created.push(parent);
    const targetDirectory = path.join(parent, 'my-hub');

    await scaffoldHub({
      authSecret: 'a'.repeat(43),
      name: 'my-hub',
      targetDirectory,
      templateDirectory,
    });

    await expect(access(path.join(targetDirectory, '.env'))).rejects.toThrow();
    const localEnv = await readFile(
      path.join(targetDirectory, '.env.local'),
      'utf8',
    );
    expect(localEnv).not.toContain('build-machine-secret');
    expect(localEnv).toContain('APP_SERVER_PORT=13000');
  });

  it('adds secret and runtime paths to an ignore file supplied by the package', async () => {
    const templateDirectory = await createTemplate();
    await writeFile(path.join(templateDirectory, '.npmignore'), 'coverage/\n');
    const parent = await mkdtemp(path.join(os.tmpdir(), 'create-hub-ignore-'));
    created.push(parent);
    const targetDirectory = path.join(parent, 'my-hub');

    await scaffoldHub({
      authSecret: 'a'.repeat(43),
      name: 'my-hub',
      targetDirectory,
      templateDirectory,
    });

    const gitignore = await readFile(
      path.join(targetDirectory, '.gitignore'),
      'utf8',
    );
    expect(gitignore).toContain('coverage/');
    expect(gitignore).toContain('.env.local');
    expect(gitignore).toContain('.nocobase/');
    expect(gitignore).toContain('app-dist/');
  });

  it('creates a private standalone Hub project without legacy nb3 state', async () => {
    const templateDirectory = await createTemplate();
    const parent = await mkdtemp(path.join(os.tmpdir(), 'create-hub-project-'));
    created.push(parent);
    const targetDirectory = path.join(parent, 'my-hub');

    await scaffoldHub({
      authSecret: 'a'.repeat(43),
      name: 'my-hub',
      targetDirectory,
      templateDirectory,
    });

    const manifest = JSON.parse(
      await readFile(path.join(targetDirectory, 'package.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      name: 'my-hub',
      version: '0.2.0-beta.1',
      private: true,
      packageManager: REQUIRED_PACKAGE_MANAGER,
      scripts: { start: 'node ./server/standalone.js' },
    });
    expect(manifest).not.toHaveProperty('publishConfig');
    expect(manifest).not.toHaveProperty('repository');

    await expect(
      access(path.join(targetDirectory, '.nocobase')),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(targetDirectory, 'app-dist')),
    ).resolves.toBeUndefined();
    await expect(access(path.join(targetDirectory, '.nb3'))).rejects.toThrow();

    const env = await readFile(
      path.join(targetDirectory, '.env.local'),
      'utf8',
    );
    expect(env).toContain(`AUTH_SECRET=${'a'.repeat(43)}`);
    expect(
      (await stat(path.join(targetDirectory, '.env.local'))).mode & 0o777,
    ).toBe(0o600);

    const gitignore = await readFile(
      path.join(targetDirectory, '.gitignore'),
      'utf8',
    );
    expect(gitignore).toContain('.env.local');
    expect(gitignore).toContain('.nocobase/');
    expect(gitignore).toContain('app-dist/');

    const workspace = await readFile(
      path.join(targetDirectory, 'pnpm-workspace.yaml'),
      'utf8',
    );
    expect(workspace).toContain('better-sqlite3: true');
  });
});
