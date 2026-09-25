// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Config } from '@oclif/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Deploy from '../src/commands/release/deploy.ts';
import Upload from '../src/commands/release/upload.ts';
import { publishToHub } from '../src/hub-publishing.ts';
import { bindAppCommand } from './app-command.ts';

vi.mock('../src/hub-publishing.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/hub-publishing.ts')>()),
  publishToHub: vi.fn(),
}));

const secret = 'test-only-argument-secret';
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'release-arguments-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function run(
  operation: 'upload' | 'deploy',
  argv: string[],
): Promise<{ exit: unknown; output: unknown; stderr: string[] }> {
  const config = await Config.load({
    root,
    pjson: {
      name: 'release-arguments-test',
      version: '0.0.0',
      oclif: { bin: 'nocobase' },
    },
  });
  const Command = bindAppCommand(operation === 'deploy' ? Deploy : Upload, {
    rootDir: root,
  });
  const command = new Command(['--json', ...argv], config);
  const output = vi
    .spyOn(command, 'logJson')
    .mockImplementation(() => undefined);
  const stderr: string[] = [];
  vi.spyOn(command, 'logToStderr').mockImplementation((message) => {
    stderr.push(String(message));
  });
  const exit = await command.run().then(
    () => undefined,
    (error: { oclif?: { exit?: number } }) => error.oclif?.exit,
  );
  expect(output).toHaveBeenCalledTimes(1);
  return { exit, output: output.mock.calls[0]?.[0], stderr };
}

describe('release argument errors', () => {
  it.each([
    [
      'deploy',
      ['--api-key', secret],
      'Missing required flag --release-id. Run this command with --help.',
    ],
    [
      'upload',
      ['--timeout', secret],
      'Invalid value for --timeout. Run this command with --help.',
    ],
    [
      'upload',
      ['--apikey', secret],
      'Unknown flag --apikey. Run this command with --help.',
    ],
    [
      'upload',
      [`--apikey=${secret}`],
      'Unknown flag --apikey. Run this command with --help.',
    ],
    [
      'upload',
      [secret],
      'This command takes no positional arguments. Run this command with --help.',
    ],
  ] as const)(
    '%s %j names the flag without echoing the value',
    async (operation, argv, message) => {
      const { exit, output } = await run(operation, [...argv]);

      expect(exit).toBe(2);
      expect(output).toEqual({
        schemaVersion: 1,
        ok: false,
        operation: `release:${operation}`,
        status: 'failure',
        error: { code: 'INVALID_ARGUMENTS', message, suggestions: [] },
      });
      expect(JSON.stringify(output)).not.toContain(secret);
    },
  );
});

describe('unexpected release failures', () => {
  const argv = [
    '--hub',
    'https://hub.example/main',
    '--app-id',
    'crm',
    '--api-key',
    secret,
    '--release-id',
    'r1',
    '--no-wait',
  ];

  it('reports a fixed message and prints the cause only when NOCOBASE_CLI_DEBUG is set', async () => {
    // Anything that is not a PublishingError, whose message may quote a request, a response or the environment.
    vi.mocked(publishToHub).mockRejectedValue(
      new Error(`cause containing ${secret}`),
    );

    vi.stubEnv('NOCOBASE_CLI_DEBUG', '');
    const quiet = await run('deploy', argv);
    expect(quiet.exit).toBe(1);
    expect(quiet.output).toMatchObject({
      operation: 'release:deploy',
      error: {
        code: 'DEPLOY_FAILED',
        message:
          'Deployment failed. Set NOCOBASE_CLI_DEBUG=1 to print the cause.',
      },
    });
    expect(quiet.stderr).toEqual([]);

    vi.stubEnv('NOCOBASE_CLI_DEBUG', '1');
    const debug = await run('deploy', argv);
    expect(JSON.stringify(debug.output)).not.toContain(secret);
    expect(debug.stderr.join('\n')).toContain('cause containing');
  });

  it('names the operation in a success document', async () => {
    vi.mocked(publishToHub).mockResolvedValue({ releaseId: 'r1' });

    const { exit, output } = await run('upload', argv.slice(0, 6));

    expect(exit).toBeUndefined();
    expect(output).toMatchObject({ ok: true, operation: 'release:upload' });
  });
});
