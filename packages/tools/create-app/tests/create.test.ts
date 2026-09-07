import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create.ts';
import { downloadTemplate } from '../src/lib/template.ts';
import {
  installDependencies,
  syncPluginSkills,
  verifyDriver,
} from '../src/lib/install.ts';
import { promptDialect, log } from '../src/lib/prompts.ts';

vi.mock('../src/lib/template.ts', async (original) => ({
  ...(await original<typeof import('../src/lib/template.ts')>()),
  downloadTemplate: vi.fn(),
}));
vi.mock('../src/lib/install.ts', () => ({
  installDependencies: vi.fn(),
  syncPluginSkills: vi.fn(),
  verifyDriver: vi.fn(),
}));
vi.mock('../src/lib/prompts.ts', async (original) => ({
  ...(await original<typeof import('../src/lib/prompts.ts')>()),
  promptDialect: vi.fn(),
  intro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

let root: string;
let template: string;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(os.tmpdir(), 'create-profile-'));
  template = await mkdtemp(path.join(os.tmpdir(), 'template-profile-'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.mocked(promptDialect).mockResolvedValue('sqlite');
  vi.mocked(installDependencies).mockResolvedValue(undefined);
  vi.mocked(verifyDriver).mockResolvedValue({ ok: true });
  vi.mocked(syncPluginSkills).mockResolvedValue({ ok: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    [root, template].map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function prepare(
  kind: 'app' | 'hub',
  profile?: 'app-v1',
  name = '@example/template',
): Promise<void> {
  await writeFile(
    path.join(template, 'package.json'),
    JSON.stringify({
      name,
      version: '0.0.1',
      nocobase: {
        templateKind: kind,
        scaffoldProfile: profile,
        plugins: { example: { enabled: true } },
      },
      scripts: { 'plugin:skills:sync': 'echo sync' },
    }),
  );
  vi.mocked(downloadTemplate).mockResolvedValue({
    directory: template,
    name,
    version: '0.0.1',
    kind,
    scaffoldProfile: profile,
  });
}
async function run(args: string[] = []): Promise<number> {
  return createApp({
    argv: ['project', ...args],
    binary: 'create-app',
    version: 'fixture',
  });
}
async function read(relative: string): Promise<string> {
  return readFile(path.join(root, 'project', relative), 'utf8');
}

describe('full-stack Hub initialization', () => {
  it.each([
    ['sqlite3', 'sqlite', 'better-sqlite3'],
    ['pg', 'postgres', 'pg'],
    ['mariadb', 'mysql', 'mysql2'],
  ])(
    'generates %s config and driver without installing',
    async (flag, dialect, driver) => {
      await prepare('hub', 'app-v1');
      await writeFile(
        path.join(template, '.env.example'),
        '# Keep this\nAPP_NAME=hub\nAPP_BASE_PATH=/custom\n',
      );
      expect(
        await run([
          '--template=./third-party',
          '--db-dialect',
          flag,
          '--no-install',
        ]),
      ).toBe(0);
      const manifest = JSON.parse(await read('package.json')) as {
        name: string;
        displayName: string;
        dependencies: Record<string, string>;
        nocobase: {
          templateKind: string;
          scaffoldProfile: string;
          plugins: unknown;
        };
      };
      expect(manifest).toMatchObject({
        name: 'project',
        displayName: 'project',
        nocobase: {
          templateKind: 'hub',
          scaffoldProfile: 'app-v1',
          plugins: { example: { enabled: true } },
        },
      });
      expect(Object.keys(manifest.dependencies)).toEqual([driver]);
      const config = await read('config.yml');
      expect(config).toContain('dialect: ' + dialect);
      expect(config).toContain('storeSessionInDatabase: true');
      const secrets = [...config.matchAll(/secret: "([^"]+)"/gu)].map(
        (match) => match[1],
      );
      expect(secrets).toHaveLength(2);
      expect(secrets[0]).toHaveLength(43);
      expect(secrets[0]).toBe(secrets[1]);
      expect(await read('.env')).toBe(
        '# Keep this\nAPP_NAME=project\nAPP_BASE_PATH=/custom\n',
      );
      expect(await read('app-dist/.gitkeep')).toBe('');
      expect(await read('.gitignore')).toContain('/config.yml');
      expect(await read('pnpm-workspace.yaml')).toContain(
        'better-sqlite3: true',
      );
      expect(installDependencies).not.toHaveBeenCalled();
      expect(verifyDriver).not.toHaveBeenCalled();
      expect(syncPluginSkills).not.toHaveBeenCalled();
      await expect(access(template)).rejects.toThrow();
    },
  );

  it('uses the App install flow for a full-stack Hub', async () => {
    await prepare('hub', 'app-v1', '@nocobase/app-template-hub');
    vi.mocked(installDependencies).mockImplementation(async () => {
      expect(await read('package.json')).toContain('better-sqlite3');
      expect(await read('config.yml')).toContain('dialect: sqlite');
    });
    expect(await run(['--template', 'hub'])).toBe(0);
    expect(promptDialect).toHaveBeenCalledOnce();
    expect(await read('.env')).toContain('APP_BASE_PATH=/hub');
    expect(installDependencies).toHaveBeenCalledOnce();
    expect(verifyDriver).toHaveBeenCalledWith(
      path.join(root, 'project'),
      'better-sqlite3',
    );
    expect(syncPluginSkills).toHaveBeenCalledWith(path.join(root, 'project'));
    expect(vi.mocked(verifyDriver).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(installDependencies).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(syncPluginSkills).mock.invocationCallOrder[0],
    ).toBeGreaterThan(vi.mocked(verifyDriver).mock.invocationCallOrder[0]!);
  });

  it('does not verify a native driver for postgres', async () => {
    await prepare('hub', 'app-v1');
    expect(await run(['--template=hub', '--db-dialect=postgres'])).toBe(0);
    expect(verifyDriver).not.toHaveBeenCalled();
    expect(syncPluginSkills).toHaveBeenCalledOnce();
  });
  it('does not verify or synchronize after an installation failure', async () => {
    await prepare('hub', 'app-v1');
    vi.mocked(installDependencies).mockRejectedValue(
      new Error('fixture install failure'),
    );
    expect(await run(['--template=hub', '--db-dialect=sqlite'])).toBe(0);
    expect(log.warn).toHaveBeenCalledWith('fixture install failure');
    expect(verifyDriver).not.toHaveBeenCalled();
    expect(syncPluginSkills).not.toHaveBeenCalled();
  });
  it('rejects an invalid dialect before creating the target and cleans the template', async () => {
    await prepare('hub', 'app-v1');
    expect(await run(['--template=hub', '--db-dialect=invalid'])).toBe(1);
    await expect(access(path.join(root, 'project'))).rejects.toThrow();
    await expect(access(template)).rejects.toThrow();
  });
});

describe('legacy compatibility', () => {
  it.each(['@nocobase/app-template-hub', '@third-party/legacy'])(
    'keeps %s without a profile database-free',
    async (name) => {
      await prepare('hub', undefined, name);
      expect(await run(['--template=./legacy', '--db-dialect=sqlite'])).toBe(0);
      await expect(read('config.yml')).rejects.toThrow();
      expect(await read('package.json')).not.toContain('better-sqlite3');
      expect(await read('.env')).toContain('APP_BASE_PATH=/hub');
      expect(promptDialect).not.toHaveBeenCalled();
      expect(verifyDriver).not.toHaveBeenCalled();
      expect(syncPluginSkills).not.toHaveBeenCalled();
      expect(installDependencies).toHaveBeenCalledOnce();
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not declare'),
      );
    },
  );
  it.each([undefined, 'app-v1'] as const)(
    'keeps default App behavior with profile %s',
    async (profile) => {
      await prepare('app', profile);
      expect(await run(['--db-dialect=sqlite', '--no-install'])).toBe(0);
      expect(await read('config.yml')).toContain('dialect: sqlite');
      await expect(read('.env')).rejects.toThrow();
      await expect(read('app-dist/.gitkeep')).rejects.toThrow();
    },
  );
});
