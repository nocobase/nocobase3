import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  it('installs by default and reports actionable configuration without leaking secrets', async () => {
    await template();
    expect(await run(['crm', '--dialect', 'postgres', '--json'])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'success',
      projectCreated: true,
      dependenciesInstalled: true,
      configurationRequired: true,
      nextCommands: ['pnpm dev'],
    });
    expect(installDependencies).toHaveBeenCalledOnce();
    const config = await readFile(path.join(root, 'crm/config.yml'), 'utf8');
    expect(config).toContain('dialect: postgres');
    expect(stdout).not.toContain('secret');
    await expect(readFile(path.join(root, 'crm/.env'))).rejects.toThrow();
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
    expect(await readFile(path.join(root, 'crm/config.yml'), 'utf8')).toContain(
      'database.sqlite',
    );
  });
  it('supports no-install and Hub startup commands', async () => {
    await template('hub');
    expect(
      await run(['crm', '--template', 'hub', '--json', '--no-install']),
    ).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      dependenciesInstalled: false,
      configurationRequired: false,
      nextCommands: ['pnpm install', 'pnpm build', 'pnpm start'],
    });
    expect(installDependencies).not.toHaveBeenCalled();
  });
  it.each([['--json'], ['crm', '--json', '--dialect', 'invalid']])(
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
  it('returns help as JSON', async () => {
    expect(await run(['--json', '--help'])).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      status: 'success',
      help: expect.stringContaining('--dialect'),
    });
  });
});
