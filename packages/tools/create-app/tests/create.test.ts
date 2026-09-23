import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create.ts';
import { downloadTemplate } from '../src/lib/template.ts';
import {
  installDependencies,
  syncSkills,
  verifyDriver,
} from '../src/lib/install.ts';
vi.mock('../src/lib/template.ts', async (original) => ({
  ...(await original<typeof import('../src/lib/template.ts')>()),
  downloadTemplate: vi.fn(),
}));
vi.mock('../src/lib/install.ts', () => ({
  installDependencies: vi.fn(),
  syncSkills: vi.fn(),
  verifyDriver: vi.fn(),
}));
let root: string;
let stdout: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'create-flow-'));
  stdout = '';
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  vi.mocked(installDependencies).mockResolvedValue(undefined);
  vi.mocked(verifyDriver).mockResolvedValue({ ok: true });
  vi.mocked(syncSkills).mockResolvedValue({ ok: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await rm(root, { recursive: true, force: true });
});
async function template(kind = 'app'): Promise<void> {
  const directory = await mkdtemp(path.join(root, 'template-'));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: '@test/template',
      version: '1.0.0',
      dependencies: {
        '@nocobase/db-postgres': '^1.0.0',
        '@nocobase/db-oracle': '^1.0.0',
        '@nocobase/db-sqlite': '^1.0.0',
      },
    }),
  );
  await writeFile(
    path.join(directory, 'config.example.yml'),
    'database:\n  connections:\n    main:\n      dialect: sqlite\n      database: database.sqlite\n',
  );
  vi.mocked(downloadTemplate).mockResolvedValue({
    directory,
    name: '@test/template',
    version: '1.0.0',
    kind,
  });
}
const run = (argv: string[]) =>
  createApp({ argv, version: 'test', binary: 'create-app' });
describe('JSON creation flow', () => {
  it('installs by default and hands the configuration step to config:init', async () => {
    await template();
    expect(await run(['crm', '--json'])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'success',
      projectCreated: true,
      dependenciesInstalled: true,
      configured: false,
      nextCommands: ['pnpm config:init', 'pnpm config:check', 'pnpm dev'],
    });
    expect(installDependencies).toHaveBeenCalledOnce();
    // Creation writes no configuration at all, so there is no secret for it to leak and nothing for `config:init` to
    // refuse to overwrite.
    await expect(readFile(path.join(root, 'crm/config.yml'))).rejects.toThrow();
    expect(stdout).not.toContain('secret');
    await expect(readFile(path.join(root, 'crm/.env'))).rejects.toThrow();
    // The registry the templates came from has to survive into the project, or the next `pnpm add @nocobase/…` the
    // user runs resolves against the public npm.
    expect(await readFile(path.join(root, 'crm/.npmrc'), 'utf8')).toContain(
      '@nocobase:registry=',
    );
  });
  it('returns a nonzero install failure and retains the generated project', async () => {
    await template();
    vi.mocked(installDependencies).mockRejectedValue(
      new Error('installation failed'),
    );
    expect(await run(['crm', '--json'])).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'error',
      stage: 'install',
      projectCreated: true,
      dependenciesInstalled: false,
      nextCommands: ['pnpm install'],
    });
    expect(
      await readFile(path.join(root, 'crm/package.json'), 'utf8'),
    ).toContain('"name": "crm"');
  });
  it('supports no-install and Hub startup commands', async () => {
    await template('hub');
    expect(
      await run(['crm', '--template', 'hub', '--json', '--no-install']),
    ).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      dependenciesInstalled: false,
      nextCommands: [
        'pnpm install',
        'pnpm config:init',
        'pnpm config:check',
        'pnpm build',
        'pnpm start',
      ],
    });
    expect(installDependencies).not.toHaveBeenCalled();
  });
  it.each([['--json'], ['crm', '--json', '--template-tag', 'invalid']])(
    'rejects invalid input before download: %s',
    async (...argv) => {
      expect(await run(argv)).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({
        status: 'error',
        stage: 'input',
      });
      expect(downloadTemplate).not.toHaveBeenCalled();
    },
  );
  it('reports an occupied target as a scaffold failure without changing its contents', async () => {
    await mkdir(path.join(root, 'crm'));
    await writeFile(path.join(root, 'crm/keep.txt'), 'existing content');
    expect(await run(['crm', '--json'])).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'error',
      stage: 'scaffold',
      projectCreated: false,
    });
    expect(downloadTemplate).not.toHaveBeenCalled();
    expect(await readFile(path.join(root, 'crm/keep.txt'), 'utf8')).toBe(
      'existing content',
    );
  });
  /** The one native addon every application gets, through the SQLite driver the templates depend on. */
  it('verifies the native driver after installing', async () => {
    await template();
    expect(await run(['crm', '--json'])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'success',
      dependenciesInstalled: true,
    });
    expect(verifyDriver).toHaveBeenCalledWith(path.join(root, 'crm'));
  });
  it('returns help as JSON', async () => {
    expect(await run(['--json', '--help'])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'success',
      help: expect.stringContaining('config:init'),
    });
  });
});
