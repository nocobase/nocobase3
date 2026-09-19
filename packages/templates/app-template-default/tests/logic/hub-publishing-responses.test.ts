// @vitest-environment node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Config } from '@oclif/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppDeploy from '../../cli/commands/deploy.js';
import AppUpload from '../../cli/commands/upload.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'hub-response-test-'));
  await writeFile(path.join(root, 'artifact.tar.gz'), 'artifact');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
const secret = 'test-only-response-secret';
async function command(operation: 'upload' | 'deploy', flags: string[] = []) {
  const config = await Config.load({
    root,
    pjson: {
      name: 'publishing-test',
      version: '0.0.0',
      oclif: { bin: 'nocobase' },
    },
  });
  const Command = operation === 'deploy' ? AppDeploy : AppUpload;
  const instance = new Command(
    [
      '--json',
      '--hub',
      'https://hub.example/main',
      '--app-id',
      'crm',
      '--api-key',
      secret,
      '--idempotency-key',
      'retry-response-test',
      ...(operation === 'deploy'
        ? ['--release-id', 'r1']
        : ['--file', path.join(root, 'artifact.tar.gz')]),
      ...flags,
    ],
    config,
  );
  const output = vi
    .spyOn(instance, 'logJson')
    .mockImplementation(() => undefined);
  return { instance, output };
}

describe.each(['upload', 'deploy'] as const)(
  '%s response validation',
  (operation) => {
    it.each([
      null,
      [],
      false,
      'unexpected',
      { data: [] },
      { data: null },
      { data: {} },
    ])(
      'reports an unknown result for malformed success envelope %j',
      async (payload) => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(Response.json(payload)),
        );
        const { instance, output } = await command(operation, ['--no-wait']);
        await expect(instance.run()).rejects.toMatchObject({
          oclif: { exit: 3 },
        });
        expect(output).toHaveBeenCalledTimes(1);
        expect(output.mock.calls[0]?.[0]).toMatchObject({
          ok: false,
          error: { code: 'INVALID_HUB_RESPONSE' },
        });
        expect(JSON.stringify(output.mock.calls)).not.toContain(secret);
      },
    );
    it.each([
      null,
      [],
      { error: null },
      { error: { code: 'contains private text' } },
    ])(
      'handles malformed HTTP error envelope %j without a TypeError',
      async (payload) => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(Response.json(payload, { status: 403 })),
        );
        const { instance, output } = await command(operation, ['--no-wait']);
        await expect(instance.run()).rejects.toMatchObject({
          oclif: { exit: 1 },
        });
        expect(output.mock.calls[0]?.[0]).toMatchObject({
          ok: false,
          error: { code: 'HUB_REQUEST_FAILED' },
        });
        expect(JSON.stringify(output.mock.calls)).not.toContain(
          'contains private text',
        );
      },
    );
  },
);

describe('deployment acceptance validation', () => {
  it.each([
    { operationId: '', status: 'queued' },
    { operationId: '   ', status: 'queued' },
    { operationId: 'op-1', status: 'unexpected' },
    { operationId: 'op-1' },
    { operationId: 'op-1', status: null },
  ])(
    'rejects invalid deployment acceptance %j with --no-wait',
    async (data) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ data })),
      );
      const { instance, output } = await command('deploy', ['--no-wait']);
      await expect(instance.run()).rejects.toMatchObject({
        oclif: { exit: 3 },
      });
      expect(output.mock.calls[0]?.[0]).toMatchObject({ ok: false });
    },
  );
  it.each(['queued', 'deploying', 'succeeded', 'failed', 'cancelled'])(
    'preserves confirmed %s status with --no-wait',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { operationId: 'op-1', status } }),
        );
      vi.stubGlobal('fetch', fetcher);
      const { instance, output } = await command('deploy', ['--no-wait']);
      if (status === 'failed' || status === 'cancelled') {
        await expect(instance.run()).rejects.toMatchObject({
          oclif: { exit: 1 },
        });
        expect(output.mock.calls[0]?.[0]).toMatchObject({
          ok: false,
          error: { code: 'DEPLOYMENT_FAILED' },
        });
      } else {
        await instance.run();
        expect(output.mock.calls[0]?.[0]).toMatchObject({
          ok: true,
          result: { operationStatus: status },
        });
      }
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['', '   ', 12])(
    'rejects an invalid upload release ID %j',
    async (releaseId) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ data: { releaseId, operationId: null } }),
          ),
      );
      const { instance } = await command('upload');
      await expect(instance.run()).rejects.toMatchObject({
        oclif: { exit: 3 },
      });
    },
  );
  it.each(['', '   ', 12, undefined])(
    'rejects an invalid upload deployment ID %j',
    async (operationId) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ data: { releaseId: 'r1', operationId } }),
          ),
      );
      const { instance } = await command('upload', ['--deploy', '--no-wait']);
      await expect(instance.run()).rejects.toMatchObject({
        oclif: { exit: 3 },
      });
    },
  );
});
