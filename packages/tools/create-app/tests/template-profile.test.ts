import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTemplate, parseScaffoldProfile } from '../src/lib/template.ts';
import { runCommand } from '../src/lib/run-command.ts';
import { generateAuthSecret } from '../src/lib/config-file.ts';
import { removeDirectory } from '../src/lib/scaffold.ts';

vi.mock('../src/lib/run-command.ts', () => ({
  runCommand: vi.fn(),
  CommandFailedError: class extends Error {},
}));
afterEach(() => vi.resetAllMocks());

describe('scaffold profile manifest contract', () => {
  it('accepts only app-v1 or an absent field', () => {
    expect(parseScaffoldProfile(undefined)).toBeUndefined();
    expect(parseScaffoldProfile('app-v1')).toBe('app-v1');
    for (const value of ['app-v2', '', null, false, [], {}]) {
      expect(() => parseScaffoldProfile(value)).toThrow(
        'Unsupported nocobase.scaffoldProfile',
      );
    }
  });
  it.each(['app-v1', 'unknown', null])(
    'reads and validates %s from the extracted manifest',
    async (profile) => {
      let extracted = '';
      let packed = '';
      vi.mocked(runCommand).mockImplementation(
        async (command, args, options) => {
          if (command === 'npm') {
            packed = options!.cwd!;
            await writeFile(path.join(packed, 'fixture.tgz'), 'fixture');
          } else if (command === 'tar') {
            extracted = args[args.indexOf('-C') + 1]!;
            await mkdir(extracted, { recursive: true });
            await writeFile(
              path.join(extracted, 'package.json'),
              JSON.stringify({
                name: '@fixture/hub',
                version: '0.0.1',
                nocobase: { templateKind: 'hub', scaffoldProfile: profile },
              }),
            );
          }
          return { stdout: '', stderr: '' };
        },
      );
      const result = downloadTemplate({ source: '@fixture/hub' });
      if (profile === 'app-v1') {
        const template = await result;
        expect(template).toMatchObject({
          kind: 'hub',
          scaffoldProfile: 'app-v1',
        });
        await removeDirectory(template.directory);
      } else {
        await expect(result).rejects.toThrow(
          'Unsupported nocobase.scaffoldProfile',
        );
      }
      await expect(access(extracted)).rejects.toThrow();
      await expect(access(packed)).rejects.toThrow();
    },
  );
  it.each(['default', 'hub'])(
    'the real %s manifest declares the shared contract',
    async (kind) => {
      const file = new URL(
        '../../../templates/app-template-' + kind + '/package.json',
        import.meta.url,
      );
      const manifest = JSON.parse(await readFile(file, 'utf8')) as {
        nocobase: { scaffoldProfile: string; templateKind: string };
      };
      expect(manifest.nocobase).toMatchObject({
        scaffoldProfile: 'app-v1',
        templateKind: kind === 'hub' ? 'hub' : 'app',
      });
    },
  );
  it('generates independent secrets for different projects', () => {
    expect(generateAuthSecret()).not.toBe(generateAuthSecret());
  });
});
