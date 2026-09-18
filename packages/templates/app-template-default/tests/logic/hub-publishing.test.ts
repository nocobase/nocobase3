// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishToHub } from '../../cli/hub-publishing.js';

let root: string;
const env = {
  HUB_URL: 'https://hub.example/main',
  HUB_APP_ID: 'crm',
  HUB_API_KEY: 'test-only-credential',
};
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'hub-cli-test-'));
  await mkdir(path.join(root, 'storage/exports'), { recursive: true });
  await writeFile(path.join(root, 'storage/exports/dist.tar.gz'), 'artifact');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});
const response = (data: object) =>
  new Response(JSON.stringify({ data }), {
    headers: { 'content-type': 'application/json' },
  });

describe('Hub publishing client', () => {
  it.each(['upload', 'deploy'] as const)(
    '%s reads the App root .env with per-value flag and environment precedence',
    async (operation) => {
      await writeFile(
        path.join(root, '.env'),
        '# Publishing defaults\nHUB_URL="https://file.example/main"\nHUB_APP_ID=from-file # comment\nHUB_API_KEY=\'file-secret#literal\'\nNODE_OPTIONS=--invalid-option\n',
      );
      const processEnvBefore = { ...process.env };
      const fetcher = vi.fn().mockImplementation(() =>
        Promise.resolve(
          response({
            releaseId: 'r1',
            operationId: 'op-1',
            status: 'queued',
          }),
        ),
      );
      vi.stubGlobal('fetch', fetcher);
      const options = { 'release-id': 'r1', wait: false };
      const endpoint = operation === 'upload' ? 'releases' : 'deploy';
      const check = (host: string, appId: string, secret: string) => {
        const call = fetcher.mock.lastCall;
        expect(String(call?.[0])).toBe(
          `https://${host}/main/api/hub/apps/${appId}/${endpoint}`,
        );
        expect(call?.[1].headers.authorization).toBe(`Bearer ${secret}`);
      };
      const result = await publishToHub(operation, options, root, {});
      check('file.example', 'from-file', 'file-secret#literal');
      expect(JSON.stringify(result)).not.toContain('file-secret');

      // Each missing value falls back separately rather than selecting one source wholesale.
      const partialEnv = { HUB_API_KEY: 'ci-secret' };
      await publishToHub(
        operation,
        { ...options, 'app-id': 'flag-app' },
        root,
        partialEnv,
      );
      check('file.example', 'flag-app', 'ci-secret');
      expect(partialEnv).toEqual({ HUB_API_KEY: 'ci-secret' });

      await publishToHub(operation, options, root, env);
      check('hub.example', 'crm', env.HUB_API_KEY);
      await publishToHub(
        operation,
        {
          ...options,
          hub: 'https://flag.example/main',
          'app-id': 'flag-app',
          'api-key': 'flag-secret',
        },
        root,
        env,
      );
      check('flag.example', 'flag-app', 'flag-secret');
      expect(process.env).toEqual(processEnvBefore);
    },
  );

  it('reports unreadable .env as a local error before sending a request', async () => {
    await mkdir(path.join(root, '.env'));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(publishToHub('upload', {}, root, env)).rejects.toMatchObject({
      code: 'INVALID_ENV_FILE',
      exitCode: 2,
      message: 'Cannot read the App root .env file.',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('streams the file, preserves the Hub base path, and uses a checksum retry identity', async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      expect(String(url)).toBe(
        'https://hub.example/main/api/hub/apps/crm/releases',
      );
      expect(init.redirect).toBe('error');
      expect(init.headers).toMatchObject({
        authorization: 'Bearer test-only-credential',
        'content-type': 'application/gzip',
        'content-length': '8',
      });
      let body = '';
      for await (const chunk of init.body as unknown as AsyncIterable<Buffer>)
        body += chunk.toString();
      expect(body).toBe('artifact');
      return response({
        releaseId: 'release-1',
        version: '1.0.0',
        operationId: null,
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await publishToHub('upload', {}, root, env);
    expect(result.idempotencyKey).toBe(
      createHash('sha256').update('artifact').digest('hex'),
    );
    expect(JSON.stringify(result)).not.toContain(env.HUB_API_KEY);
  });
  it('gives flags precedence, waits through the minimal status endpoint, and distinguishes deployment failure', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ operationId: 'op-1', status: 'queued' }),
      )
      .mockResolvedValueOnce(response({ status: 'succeeded' }));
    vi.stubGlobal('fetch', fetcher);
    const result = await publishToHub(
      'deploy',
      {
        hub: 'https://override.example/console',
        'app-id': 'erp',
        'api-key': 'override',
        'release-id': 'r1',
        wait: true,
      },
      root,
      env,
    );
    expect(result.operationStatus).toBe('succeeded');
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://override.example/console/api/hub/apps/erp/deploy',
    );
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      'https://override.example/console/api/hub/apps/erp/deployments/op-1/status',
    );
    fetcher
      .mockResolvedValueOnce(
        response({ operationId: 'op-2', status: 'queued' }),
      )
      .mockResolvedValueOnce(response({ status: 'failed' }));
    await expect(
      publishToHub('deploy', { 'release-id': 'r2', wait: true }, root, env),
    ).rejects.toMatchObject({ exitCode: 1, code: 'DEPLOYMENT_FAILED' });
  });
  it.each(['failed', 'cancelled'])(
    'rejects a known %s deployment retry without waiting',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response({ operationId: 'previous-op', status })),
      );
      await expect(
        publishToHub('deploy', { 'release-id': 'r1', wait: false }, root, env),
      ).rejects.toMatchObject({ exitCode: 1, code: 'DEPLOYMENT_FAILED' });
    },
  );
  it('makes deployment retries identical and supports explicit fresh deployment identities', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response({ operationId: 'op-1', status: 'queued' })),
      );
    vi.stubGlobal('fetch', fetcher);
    const first = await publishToHub(
      'deploy',
      { 'release-id': 'r1', wait: false },
      root,
      env,
    );
    expect(
      (
        await publishToHub(
          'deploy',
          { 'release-id': 'r1', wait: false },
          root,
          env,
        )
      ).idempotencyKey,
    ).toBe(first.idempotencyKey);
    expect(
      (
        await publishToHub(
          'deploy',
          { 'release-id': 'r1', 'idempotency-key': 'new-attempt', wait: false },
          root,
          env,
        )
      ).idempotencyKey,
    ).toBe('new-attempt');
  });
  it('reports a reused deployment as history rather than a fresh deployment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          response({
            operationId: 'op-1',
            status: 'succeeded',
            reused: true,
            createdAt: '2026-09-18T07:00:00.000Z',
          }),
        ),
      ),
    );
    const result = await publishToHub(
      'deploy',
      { 'release-id': 'r1', wait: true },
      root,
      env,
    );
    expect(result).toMatchObject({
      reused: true,
      operationStatus: 'succeeded',
      deploymentCreatedAt: '2026-09-18T07:00:00.000Z',
    });
    expect(String(result.warning)).toContain('--idempotency-key');
  });

  it('stays quiet when the Hub created the deployment for this request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          response({
            operationId: 'op-1',
            status: 'succeeded',
            reused: false,
          }),
        ),
      ),
    );
    const result = await publishToHub(
      'deploy',
      { 'release-id': 'r1', wait: true },
      root,
      env,
    );
    expect(result.reused).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it('warns when upload --deploy reuses an existing Release and its deployment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          response({
            releaseId: 'r1',
            operationId: 'op-1',
            status: 'succeeded',
            reused: true,
          }),
        ),
      ),
    );
    const result = await publishToHub(
      'upload',
      { deploy: true, wait: true },
      root,
      env,
    );
    expect(result).toMatchObject({
      reused: true,
      operationStatus: 'succeeded',
    });
    expect(String(result.warning)).toContain('--idempotency-key');
  });

  it('sends deploy and wait intent on the upload itself', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ releaseId: 'r1', operationId: 'op-1', status: 'queued' }),
      )
      .mockResolvedValueOnce(response({ status: 'succeeded' }));
    vi.stubGlobal('fetch', fetcher);
    await publishToHub('upload', { deploy: true, wait: true }, root, env);
    expect(fetcher.mock.calls[0]?.[1].headers).toMatchObject({
      'x-hub-deployment-intent': 'explicit',
      'x-hub-wait': 'true',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])(
    'rejects upload-and-deploy without an operation even when wait is %s',
    async (wait) => {
      const fetcher = vi.fn().mockImplementation(() =>
        Promise.resolve(
          response({
            releaseId: 'existing',
            operationId: null,
            reused: true,
          }),
        ),
      );
      vi.stubGlobal('fetch', fetcher);
      await expect(
        publishToHub('upload', { deploy: true, wait }, root, env),
      ).rejects.toMatchObject({ code: 'NO_DEPLOYMENT', exitCode: 1 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('reports invalid local input before calling Hub and classifies unconfirmed responses', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(publishToHub('upload', {}, root, {})).rejects.toMatchObject({
      exitCode: 2,
    });
    await expect(
      publishToHub('upload', { file: 'missing' }, root, env),
    ).rejects.toMatchObject({ exitCode: 2 });
    await expect(
      publishToHub('upload', { wait: true }, root, env),
    ).rejects.toMatchObject({ exitCode: 2, code: 'WAIT_REQUIRES_DEPLOY' });
    await expect(
      publishToHub('upload', { hub: 'https://user:password@host' }, root, env),
    ).rejects.toMatchObject({ exitCode: 2 });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRejectedValue(new Error(env.HUB_API_KEY));
    await expect(
      publishToHub('deploy', { 'release-id': 'r1', wait: false }, root, env),
    ).rejects.toMatchObject({ exitCode: 3, code: 'RESULT_UNKNOWN' });
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'FORBIDDEN', message: env.HUB_API_KEY },
        }),
        { status: 403 },
      ),
    );
    await expect(
      publishToHub('deploy', { 'release-id': 'r1', wait: false }, root, env),
    ).rejects.toMatchObject({
      exitCode: 1,
      message: 'Hub rejected the request (403, FORBIDDEN).',
    });
  });
  it('sends optional configuration in the request body and changes the default deploy retry identity with its content', async () => {
    const content = 'database:\n  password: private-test-value\n';
    await writeFile(path.join(root, 'runtime.yml'), content);
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response({ operationId: 'op-1', status: 'queued' })),
      );
    vi.stubGlobal('fetch', fetcher);
    const first = await publishToHub(
      'deploy',
      { 'release-id': 'r1', config: 'runtime.yml', wait: false },
      root,
      env,
    );
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
      releaseId: 'r1',
      config: { mode: 'file', content },
    });
    expect(JSON.stringify(first)).not.toContain('private-test-value');
    await writeFile(path.join(root, 'runtime.yml'), 'feature: changed\n');
    const second = await publishToHub(
      'deploy',
      { 'release-id': 'r1', config: 'runtime.yml', wait: false },
      root,
      env,
    );
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    fetcher.mockImplementation(async (_url: URL, init: RequestInit) => {
      const chunks: Buffer[] = [];
      for await (const chunk of init.body as unknown as AsyncIterable<Buffer>)
        chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      const length = Buffer.byteLength('feature: changed\n');
      expect(init.headers).toMatchObject({
        'content-type': 'application/vnd.nocobase.release-upload.v1',
        'x-hub-config-length': String(length),
      });
      expect(bytes.subarray(0, length).toString()).toBe('feature: changed\n');
      expect(bytes.subarray(length).toString()).toBe('artifact');
      expect(JSON.stringify(init.headers)).not.toContain('feature');
      return response({
        releaseId: 'r1',
        operationId: 'op-1',
        status: 'queued',
      });
    });
    await publishToHub(
      'upload',
      { deploy: true, config: 'runtime.yml', wait: false },
      root,
      env,
    );
  });

  it('rejects unreadable configuration and upload-only configuration before calling Hub', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      publishToHub('upload', { config: 'missing.yml' }, root, env),
    ).rejects.toMatchObject({ code: 'CONFIG_REQUIRES_DEPLOY', exitCode: 2 });
    await expect(
      publishToHub(
        'deploy',
        { 'release-id': 'r1', config: 'missing.yml' },
        root,
        env,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG_FILE', exitCode: 2 });
    await writeFile(path.join(root, 'runtime.yml'), '');
    await expect(
      publishToHub(
        'upload',
        { deploy: true, config: 'runtime.yml', wait: false },
        root,
        env,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG_FILE', exitCode: 2 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never reports a timeout or unknown status as success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ operationId: 'op-1', status: 'queued' }),
        )
        .mockResolvedValueOnce(response({ status: 'queued' })),
    );
    await expect(
      publishToHub('deploy', { 'release-id': 'r1', timeout: 0.01 }, root, env),
    ).rejects.toMatchObject({ exitCode: 3, code: 'WAIT_TIMEOUT' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ operationId: 'op-1', status: 'queued' }),
        )
        .mockResolvedValueOnce(response({ status: 'unknown' })),
    );
    await expect(
      publishToHub('deploy', { 'release-id': 'r1', wait: true }, root, env),
    ).rejects.toMatchObject({ exitCode: 3 });
  });
});

describe('CLI command output', () => {
  it.each([
    ['deploy', [], 'succeeded', true],
    ['deploy', [], 'failed', true],
    ['deploy', ['--wait'], 'succeeded', true],
    ['deploy', ['--no-wait'], 'queued', false],
    ['upload', ['--deploy'], 'succeeded', true],
    ['upload', ['--deploy'], 'failed', true],
    ['upload', ['--deploy', '--wait'], 'succeeded', true],
    ['upload', ['--deploy', '--no-wait'], 'queued', false],
    ['upload', [], 'queued', false],
  ] as const)(
    '%s %j reports %s with polling=%s',
    async (operation, flags, status, polls) => {
      const { Config } = await import('@oclif/core');
      const { default: AppDeploy } =
        await import('../../cli/commands/deploy.js');
      const { default: AppUpload } =
        await import('../../cli/commands/upload.js');
      const config = await Config.load({
        root,
        pjson: {
          name: 'publishing-test',
          version: '0.0.0',
          oclif: { bin: 'nocobase' },
        },
      });
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response({ releaseId: 'r1', operationId: 'op-1', status: 'queued' }),
        )
        .mockResolvedValueOnce(response({ status }));
      vi.stubGlobal('fetch', fetcher);
      const Command = operation === 'deploy' ? AppDeploy : AppUpload;
      const command = new Command(
        [
          '--json',
          '--hub',
          env.HUB_URL,
          '--app-id',
          env.HUB_APP_ID,
          '--api-key',
          env.HUB_API_KEY,
          ...(operation === 'deploy'
            ? ['--release-id', 'r1']
            : ['--file', path.join(root, 'storage/exports/dist.tar.gz')]),
          ...flags,
        ],
        config,
      );
      const output = vi
        .spyOn(command, 'logJson')
        .mockImplementation(() => undefined);
      if (status === 'failed') {
        await expect(command.run()).rejects.toMatchObject({
          oclif: { exit: 1 },
        });
        expect(output.mock.calls[0]?.[0]).toMatchObject({
          ok: false,
          error: { code: 'DEPLOYMENT_FAILED' },
        });
      } else {
        await command.run();
        expect(output.mock.calls[0]?.[0]).toMatchObject({
          ok: true,
          ...(polls ? { result: { operationStatus: 'succeeded' } } : {}),
        });
      }
      expect(output).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(polls ? 2 : 1);
      if (polls)
        expect(String(fetcher.mock.calls[1]?.[0])).toMatch(
          /\/deployments\/op-1\/status$/,
        );
    },
  );
  it('prints one JSON envelope and a parameter exit code without echoing secret arguments', async () => {
    const { Config } = await import('@oclif/core');
    const { default: AppDeploy } = await import('../../cli/commands/deploy.js');
    const config = await Config.load({
      root,
      pjson: {
        name: 'publishing-test',
        version: '0.0.0',
        oclif: { bin: 'nocobase' },
      },
    });
    const command = new AppDeploy(
      ['--json', '--api-key', env.HUB_API_KEY],
      config,
    );
    const output = vi
      .spyOn(command, 'logJson')
      .mockImplementation(() => undefined);
    await expect(command.run()).rejects.toMatchObject({ oclif: { exit: 2 } });
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0]?.[0]).toMatchObject({
      ok: false,
      status: 'failure',
      error: { code: 'INVALID_ARGUMENTS' },
    });
    expect(JSON.stringify(output.mock.calls)).not.toContain(env.HUB_API_KEY);
  });
  it('exits with failure JSON when upload --deploy has no confirmed deployment', async () => {
    const { Config } = await import('@oclif/core');
    const { default: AppUpload } = await import('../../cli/commands/upload.js');
    const config = await Config.load({
      root,
      pjson: {
        name: 'publishing-test',
        version: '0.0.0',
        oclif: { bin: 'nocobase' },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ releaseId: 'existing', operationId: null, reused: true }),
        ),
    );
    const command = new AppUpload(
      [
        '--json',
        '--deploy',
        '--hub',
        env.HUB_URL,
        '--app-id',
        env.HUB_APP_ID,
        '--api-key',
        env.HUB_API_KEY,
        '--file',
        path.join(root, 'storage/exports/dist.tar.gz'),
      ],
      config,
    );
    const output = vi
      .spyOn(command, 'logJson')
      .mockImplementation(() => undefined);
    await expect(command.run()).rejects.toMatchObject({ oclif: { exit: 1 } });
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0]?.[0]).toMatchObject({
      ok: false,
      status: 'failure',
      error: { code: 'NO_DEPLOYMENT' },
    });
  });

  it('warns in human output when the Hub reused an earlier deployment', async () => {
    const { Config } = await import('@oclif/core');
    const { default: AppDeploy } = await import('../../cli/commands/deploy.js');
    const config = await Config.load({
      root,
      pjson: {
        name: 'publishing-test',
        version: '0.0.0',
        oclif: { bin: 'nocobase' },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          response({
            operationId: 'op-1',
            status: 'succeeded',
            reused: true,
          }),
        ),
      ),
    );
    const command = new AppDeploy(
      [
        '--hub',
        env.HUB_URL,
        '--app-id',
        env.HUB_APP_ID,
        '--api-key',
        env.HUB_API_KEY,
        '--release-id',
        'r1',
      ],
      config,
    );
    const log = vi.spyOn(command, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(command, 'warn').mockImplementation(() => undefined);
    await command.run();
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('--idempotency-key');
  });

  it('allows --no-wait to return the accepted deployment status', async () => {
    const { Config } = await import('@oclif/core');
    const { default: AppDeploy } = await import('../../cli/commands/deploy.js');
    const config = await Config.load({
      root,
      pjson: {
        name: 'publishing-test',
        version: '0.0.0',
        oclif: { bin: 'nocobase' },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response({ operationId: 'op-1', status: 'queued' })),
    );
    await writeFile(path.join(root, 'runtime.yml'), 'feature: parsed\n');
    const command = new AppDeploy(
      [
        '--json',
        '--hub',
        env.HUB_URL,
        '--app-id',
        env.HUB_APP_ID,
        '--api-key',
        env.HUB_API_KEY,
        '--release-id',
        'r1',
        '--no-wait',
        '--config',
        path.join(root, 'runtime.yml'),
      ],
      config,
    );
    const output = vi
      .spyOn(command, 'logJson')
      .mockImplementation(() => undefined);
    await command.run();
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({ config: { mode: 'file', content: 'feature: parsed\n' } });
    expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0]?.[0]).toMatchObject({
      ok: true,
      status: 'success',
      result: { operationStatus: 'queued' },
    });
  });
});
