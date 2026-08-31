import { File as NodeFile } from 'node:buffer';

import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../server/file-storage.js', () => ({
  openFileObject: vi.fn(),
  putFileObject: vi.fn(),
  removeFileObject: vi.fn(),
}));
vi.mock('../server/file-access.js', () => ({
  issueFileAccessUrl: vi.fn(),
  verifyFileAccessToken: vi.fn(),
}));

import { createFileRoute } from '../server/create-file-route.js';
import {
  ExpiredFileTokenError,
  FileUnavailableError,
  InvalidFileTokenError,
} from '../server/errors.js';
import {
  issueFileAccessUrl,
  verifyFileAccessToken,
} from '../server/file-access.js';
import {
  openFileObject,
  putFileObject,
  removeFileObject,
} from '../server/file-storage.js';
import type {
  CreateFileRouteOptions,
  FileRecord,
  FileStore,
  NewFileRecord,
} from '../server/types.js';

const MOUNT_PATH = '/base/api/orders/7/files';

beforeAll(() => vi.stubGlobal('File', NodeFile));
afterAll(() => vi.unstubAllGlobals());

describe('createFileRoute', () => {
  let records: FileRecord[];
  let store: FileStore;
  let authCalls: number;
  const put = vi.mocked(putFileObject);
  const open = vi.mocked(openFileObject);
  const removeObject = vi.mocked(removeFileObject);
  const issueAccessUrl = vi.mocked(issueFileAccessUrl);
  const verifyAccessToken = vi.mocked(verifyFileAccessToken);

  beforeEach(() => {
    records = [fileRecord()];
    authCalls = 0;
    store = {
      list: vi.fn(async () => records),
      find: vi.fn(
        async (id) => records.find((record) => record.id === id) ?? null,
      ),
      create: vi.fn(async (input) => {
        const record = fileRecord(input);
        records.push(record);
        return record;
      }),
      remove: vi.fn(async (id) => {
        const index = records.findIndex((record) => record.id === id);
        if (index < 0) return null;
        return records.splice(index, 1)[0];
      }),
    };
    put.mockReset().mockImplementation(async (_options, input) => ({
      disk: input.disk ?? 'local',
      key: 'files/server-generated-key',
      filename: input.filename,
      mimeType: input.mimeType ?? 'application/octet-stream',
      size: input.size ?? 0,
    }));
    open.mockReset().mockImplementation(async () => streamOf('file bytes'));
    removeObject.mockReset().mockImplementation(async () => undefined);
    issueAccessUrl.mockReset().mockImplementation((input) => ({
      url: `${input.contentPath}?token=signed`,
      expiresAt: '2026-08-27T09:15:00.000Z',
    }));
    verifyAccessToken.mockReset().mockImplementation(() => undefined);
  });

  it('defines exactly the six fixed endpoints', () => {
    const route = createFileRoute({
      store,
      defaultDisk: 'local',
      publicBasePath: '/base',
      tokenSecret: 'secret',
      audience: 'order-files',
      auth: allowingAuth(),
    });

    expect([
      ...new Set(route.routes.map(({ method, path }) => `${method} ${path}`)),
    ]).toEqual([
      'GET /',
      'POST /',
      'GET /:id',
      'POST /:id/token',
      'GET /:id/content',
      'DELETE /:id',
    ]);
  });

  it('denies unauthenticated management requests but leaves content public', async () => {
    records = [fileRecord({ public: true })];
    const app = createApp({ auth: denyingAuth() });

    expect((await app.request(MOUNT_PATH)).status).toBe(401);
    const content = await app.request(`${MOUNT_PATH}/file-1/content`);

    expect(content.status).toBe(200);
    expect(await content.text()).toBe('file bytes');
    expect(authCalls).toBe(1);
  });

  it('lists client records and invokes the list authorizer without a record', async () => {
    const authorize = vi.fn();
    const response = await createApp({ authorize }).request(MOUNT_PATH);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      data: [
        expect.objectContaining({
          id: 'file-1',
          contentUrl: `${MOUNT_PATH}/file-1/content`,
        }),
      ],
    });
    expect(text).not.toContain('server-key');
    expect(authorize).toHaveBeenCalledWith(
      expect.anything(),
      'list',
      undefined,
    );
  });

  it('uploads with server-controlled metadata and returns 201', async () => {
    records = [];
    const authorize = vi.fn();
    const body = uploadBody({
      id: 'client-id',
      key: 'client-key',
      disk: 'client-disk',
      table: 'client-table',
      scope: 'client-scope',
    });

    const response = await createApp({ authorize, disk: 'archive' }).request(
      MOUNT_PATH,
      { method: 'POST', ...body },
    );
    const responseText = await response.text();
    const payload = JSON.parse(responseText) as {
      data: { id: string; contentUrl: string };
    };

    expect(response.status).toBe(201);
    expect(payload.data.id).not.toBe('client-id');
    expect(payload.data.contentUrl).toBe(
      `${MOUNT_PATH}/${payload.data.id}/content`,
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDisk: 'local' }),
      expect.objectContaining({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 6,
        disk: 'archive',
      }),
    );
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        disk: 'archive',
        key: 'files/server-generated-key',
        public: false,
      }),
      expect.anything(),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.anything(),
      'upload',
      undefined,
    );
  });

  it('returns FILE_REQUIRED for a missing file', async () => {
    const response = await createApp().request(MOUNT_PATH, {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_REQUIRED' },
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects oversized and disallowed MIME uploads before Drive writes', async () => {
    records = [];
    const app = createApp({
      limits: { maxSize: 5, mimeTypes: ['text/plain'] },
    });
    const oversized = await app.request(MOUNT_PATH, {
      method: 'POST',
      ...uploadBody(),
    });
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: 'FILE_TOO_LARGE' },
    });

    const wrongType = await createApp({
      limits: { maxSize: 100, mimeTypes: ['text/plain'] },
    }).request(MOUNT_PATH, {
      method: 'POST',
      ...uploadBody(
        {},
        { content: 'tiny', name: 'tiny.pdf', type: 'application/pdf' },
      ),
    });
    expect(wrongType.status).toBe(400);
    await expect(wrongType.json()).resolves.toMatchObject({
      error: { code: 'FILE_TYPE_NOT_ALLOWED' },
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('fast-rejects an obviously oversized Content-Length before reading the body', async () => {
    const body = uploadBody();
    const response = await createApp({ limits: { maxSize: 5 } }).request(
      MOUNT_PATH,
      {
        method: 'POST',
        body: body.body,
        headers: { ...body.headers, 'content-length': '70000' },
      },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_TOO_LARGE' },
    });
    expect(put).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it.each([
    ['without Content-Length', undefined],
    ['with a forged smaller Content-Length', '1'],
  ] as const)('stops an oversized streamed body %s', async (_label, length) => {
    const boundary = 'stream-limit-boundary';
    const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.txt"\r\nContent-Type: text/plain\r\n\r\n`;
    const suffix = `\r\n--${boundary}--\r\n`;
    const chunks = [
      new TextEncoder().encode(prefix),
      new Uint8Array(70_000),
      new TextEncoder().encode(suffix),
    ];
    const headers = new Headers({
      'content-type': `multipart/form-data; boundary=${boundary}`,
    });
    if (length) headers.set('content-length', length);
    const request = new Request(`http://localhost${MOUNT_PATH}`, {
      method: 'POST',
      headers,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk) controller.enqueue(chunk);
          else controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);

    const response = await createApp({ limits: { maxSize: 5 } }).fetch(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_TOO_LARGE' },
    });
    expect(put).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('allows a file at maxSize plus bounded multipart overhead', async () => {
    records = [];
    const response = await createApp({ limits: { maxSize: 6 } }).request(
      MOUNT_PATH,
      { method: 'POST', ...uploadBody() },
    );
    expect(response.status).toBe(201);
  });

  it('keeps existing multipart parsing behavior when maxSize is not configured', async () => {
    records = [];
    const response = await createApp().request(MOUNT_PATH, {
      method: 'POST',
      ...uploadBody(
        {},
        { content: 'x'.repeat(70_000), name: 'large.txt', type: 'text/plain' },
      ),
    });
    expect(response.status).toBe(201);
  });

  it('applies the 50 MiB request limit when maxSize is not configured', async () => {
    const body = uploadBody();
    const response = await createApp().request(MOUNT_PATH, {
      method: 'POST',
      body: body.body,
      headers: {
        ...body.headers,
        'content-length': String(50 * 1024 * 1024 + 1024 * 1024 + 1),
      },
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_TOO_LARGE' },
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('uses application/octet-stream for an empty browser MIME type', async () => {
    records = [];
    const response = await createApp({
      limits: { mimeTypes: ['application/octet-stream'] },
    }).request(MOUNT_PATH, {
      method: 'POST',
      ...uploadBody({}, { content: 'tiny', name: 'tiny.bin', type: '' }),
    });

    expect(response.status).toBe(201);
    expect(put).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mimeType: 'application/octet-stream' }),
    );
  });

  it('checks maxFiles before writing the object and then creates normally', async () => {
    records = [];
    const response = await createApp({ limits: { maxFiles: 1 } }).request(
      MOUNT_PATH,
      { method: 'POST', ...uploadBody() },
    );

    expect(response.status).toBe(201);
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('rejects maxFiles before writing an object', async () => {
    const response = await createApp({ limits: { maxFiles: 1 } }).request(
      MOUNT_PATH,
      { method: 'POST', ...uploadBody() },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_LIMIT_REACHED' },
    });
    expect(put).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('serializes concurrent uploads for the same owner when maxFiles is configured', async () => {
    records = [];
    const app = createApp({ limits: { maxFiles: 1 } });
    const [first, second] = await Promise.all([
      app.request(MOUNT_PATH, { method: 'POST', ...uploadBody() }),
      app.request(MOUNT_PATH, {
        method: 'POST',
        ...uploadBody({}, { name: 'second.txt', type: 'text/plain' }),
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 400]);
    const rejected = first.status === 400 ? first : second;
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'FILE_LIMIT_REACHED' },
    });
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('serializes equivalent numeric owner paths and keeps different owners parallel', async () => {
    records = [];
    let releasePut: () => void = () => undefined;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    put.mockImplementation(async (_options, input) => {
      await putGate;
      return {
        disk: 'local',
        key: `files/${input.filename}`,
        filename: input.filename,
        mimeType: input.mimeType ?? 'application/octet-stream',
        size: input.size ?? 0,
      };
    });
    const route = createFileRoute({
      store,
      defaultDisk: 'local',
      publicBasePath: '/base',
      tokenSecret: 'secret',
      audience: 'owner-files',
      auth: allowingAuth(),
      limits: { maxFiles: 1 },
    });
    const app = new Hono().route('/base/api/orders/:owner/files', route);

    const first = app.request('/base/api/orders/1/files', {
      method: 'POST',
      ...uploadBody(
        {},
        { name: 'first.txt', type: 'text/plain', content: 'a' },
      ),
    });
    const equivalent = app.request('/base/api/orders/01/files', {
      method: 'POST',
      ...uploadBody(
        {},
        { name: 'equivalent.txt', type: 'text/plain', content: 'b' },
      ),
    });
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    releasePut();
    const sameOwnerResponses = await Promise.all([first, equivalent]);
    expect(sameOwnerResponses.map(({ status }) => status).sort()).toEqual([
      201, 400,
    ]);

    records = [];
    put.mockClear();
    let releaseParallel: () => void = () => undefined;
    const parallelGate = new Promise<void>((resolve) => {
      releaseParallel = resolve;
    });
    put.mockImplementation(async (_options, input) => {
      await parallelGate;
      return {
        disk: 'local',
        key: `files/${input.filename}`,
        filename: input.filename,
        mimeType: input.mimeType ?? 'application/octet-stream',
        size: input.size ?? 0,
      };
    });
    const ownerTwo = app.request('/base/api/orders/2/files', {
      method: 'POST',
      ...uploadBody({}, { name: 'two.txt', type: 'text/plain', content: '2' }),
    });
    const ownerThree = app.request('/base/api/orders/3/files', {
      method: 'POST',
      ...uploadBody(
        {},
        { name: 'three.txt', type: 'text/plain', content: '3' },
      ),
    });
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    releaseParallel();
    const differentOwnerResponses = await Promise.all([ownerTwo, ownerThree]);
    expect(differentOwnerResponses.map(({ status }) => status)).toEqual([
      201, 201,
    ]);
  });

  it('rejects forbidden visibility overrides and supports Public defaults', async () => {
    records = [];
    const forbidden = await createApp().request(MOUNT_PATH, {
      method: 'POST',
      ...uploadBody({ public: 'true' }),
    });
    expect(forbidden.status).toBe(400);
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: 'FILE_INPUT_INVALID' },
    });

    const publicDefault = await createApp({
      visibility: { default: 'public', allowClientOverride: false },
    }).request(MOUNT_PATH, { method: 'POST', ...uploadBody() });
    expect(publicDefault.status).toBe(201);
    expect(store.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ public: true }),
      expect.anything(),
    );
  });

  it.each([
    ['true', true],
    ['false', false],
  ] as const)(
    'honors an allowed public=%s override',
    async (value, expected) => {
      records = [];
      const response = await createApp({
        visibility: { default: 'private', allowClientOverride: true },
      }).request(MOUNT_PATH, {
        method: 'POST',
        ...uploadBody({ public: value }),
      });

      expect(response.status).toBe(201);
      expect(store.create).toHaveBeenCalledWith(
        expect.objectContaining({ public: expected }),
        expect.anything(),
      );
    },
  );

  it('cleans up objects best-effort and preserves Store creation failure', async () => {
    records = [];
    vi.mocked(store.create).mockRejectedValueOnce(new Error('database failed'));
    removeObject.mockRejectedValueOnce(new Error('cleanup failed'));
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await createApp(
      {},
      (error) => new Response(error.message, { status: 500 }),
    ).request(MOUNT_PATH, { method: 'POST', ...uploadBody() });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('database failed');
    expect(removeObject).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ key: 'files/server-generated-key' }),
    );
    expect(report).toHaveBeenCalledWith(
      'File upload compensation failed after the record could not be created.',
    );
  });

  it('returns scoped metadata and 404 for missing records', async () => {
    const authorize = vi.fn();
    const app = createApp({ authorize });
    const found = await app.request(`${MOUNT_PATH}/file-1`);
    const missing = await app.request(`${MOUNT_PATH}/missing`);

    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toMatchObject({
      data: {
        id: 'file-1',
        contentUrl: `${MOUNT_PATH}/file-1/content`,
      },
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.anything(),
      'read',
      records[0],
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'FILE_NOT_FOUND' },
    });
  });

  it('issues Private tokens with audience, file ID, path, and TTL', async () => {
    const authorize = vi.fn();
    const response = await createApp({ authorize }).request(
      `${MOUNT_PATH}/file-1/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: 30 }),
      },
    );

    expect(response.status).toBe(200);
    expect(issueAccessUrl).toHaveBeenCalledWith({
      tokenSecret: 'secret',
      publicBasePath: '/base',
      audience: 'order-files',
      fileId: 'file-1',
      contentPath: `${MOUNT_PATH}/file-1/content`,
      expiresIn: 30,
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.anything(),
      'issue-token',
      records[0],
    );
  });

  it('returns an unsigned URL and null expiration for Public records', async () => {
    records = [fileRecord({ public: true })];
    const response = await createApp().request(`${MOUNT_PATH}/file-1/token`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { url: `${MOUNT_PATH}/file-1/content`, expiresAt: null },
    });
    expect(issueAccessUrl).not.toHaveBeenCalled();
  });

  it('allows Public content and requires a Token for Private content', async () => {
    const app = createApp();
    const denied = await app.request(`${MOUNT_PATH}/file-1/content`);
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: 'FILE_TOKEN_REQUIRED' },
    });

    records = [fileRecord({ public: true })];
    const allowed = await app.request(`${MOUNT_PATH}/file-1/content`);
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe('file bytes');
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('streams valid Private Token content without management guards', async () => {
    const authorize = vi.fn();
    const response = await createApp({
      auth: denyingAuth(),
      authorize,
    }).request(`${MOUNT_PATH}/file-1/content?token=valid`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('file bytes');
    expect(verifyAccessToken).toHaveBeenCalledWith({
      tokenSecret: 'secret',
      audience: 'order-files',
      fileId: 'file-1',
      token: 'valid',
    });
    expect(authCalls).toBe(0);
    expect(authorize).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    );
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it.each([
    ['invalid', new InvalidFileTokenError()],
    ['expired', new ExpiredFileTokenError()],
    ['wrong-audience', new InvalidFileTokenError()],
    ['wrong-file', new InvalidFileTokenError()],
  ])('denies %s Private tokens', async (token, error) => {
    verifyAccessToken.mockImplementationOnce(() => {
      throw error;
    });
    const response = await createApp().request(
      `${MOUNT_PATH}/file-1/content?token=${token}`,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code:
          error instanceof ExpiredFileTokenError
            ? 'FILE_TOKEN_EXPIRED'
            : 'FILE_TOKEN_INVALID',
      },
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('sets inline and attachment disposition with a safe filename', async () => {
    records = [
      fileRecord({ filename: '../Quarterly Report?.pdf', public: true }),
    ];
    const app = createApp();
    const inline = await app.request(`${MOUNT_PATH}/file-1/content`);
    const download = await app.request(
      `${MOUNT_PATH}/file-1/content?download=1`,
    );

    expect(inline.headers.get('content-disposition')).toBe(
      `inline; filename="Quarterly-Report.pdf"; filename*=UTF-8''Quarterly-Report.pdf`,
    );
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="Quarterly-Report.pdf"; filename*=UTF-8''Quarterly-Report.pdf`,
    );
  });

  it('emits a safe ASCII fallback and RFC 5987 Unicode filename', async () => {
    records = [fileRecord({ filename: '采购"合同\r\n.pdf', public: true })];
    const response = await createApp().request(
      `${MOUNT_PATH}/file-1/content?download=1`,
    );
    const disposition = response.headers.get('content-disposition') ?? '';

    expect(disposition).toBe(
      `attachment; filename="upload.pdf"; filename*=UTF-8''%E9%87%87%E8%B4%AD-%E5%90%88%E5%90%8C.pdf`,
    );
    expect(disposition).not.toMatch(/[\r\n]/u);
  });

  it.each([
    ['image/svg+xml', 'avatar.svg', "default-src 'none'; sandbox"],
    ['text/html', 'page.html', "default-src 'none'; sandbox"],
    ['application/xml', 'document.xml', "default-src 'none'; sandbox"],
    ['application/rss+xml', 'feed.rss', "default-src 'none'; sandbox"],
  ] as const)(
    'forces active content %s to download',
    async (mimeType, filename, csp) => {
      records = [fileRecord({ mimeType, filename, public: true })];
      const response = await createApp().request(
        `${MOUNT_PATH}/file-1/content`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
      );
      expect(response.headers.get('content-security-policy')).toBe(csp);
    },
  );

  it.each([
    ['image/png', 'image.png'],
    ['application/pdf', 'document.pdf'],
  ] as const)(
    'keeps safe preview content %s inline',
    async (mimeType, filename) => {
      records = [fileRecord({ mimeType, filename, public: true })];
      const response = await createApp().request(
        `${MOUNT_PATH}/file-1/content`,
      );

      expect(response.headers.get('content-disposition')).toBe(
        `inline; filename="${filename}"; filename*=UTF-8''${filename}`,
      );
      expect(response.headers.get('content-security-policy')).toBeNull();
    },
  );

  it('deletes the record before the object and returns 204', async () => {
    const calls: string[] = [];
    removeObject.mockImplementationOnce(async () => {
      calls.push('object');
    });
    vi.mocked(store.remove).mockImplementationOnce(async () => {
      calls.push('record');
      return records[0];
    });
    const authorize = vi.fn();
    const response = await createApp({ authorize }).request(
      `${MOUNT_PATH}/file-1`,
      { method: 'DELETE' },
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(calls).toEqual(['record', 'object']);
    expect(authorize).toHaveBeenCalledWith(
      expect.anything(),
      'delete',
      records[0],
    );
  });

  it('preserves the object when record deletion fails', async () => {
    vi.mocked(store.remove).mockRejectedValueOnce(new Error('database failed'));
    const response = await createApp(
      {},
      (error) => new Response(error.message, { status: 500 }),
    ).request(`${MOUNT_PATH}/file-1`, { method: 'DELETE' });

    expect(response.status).toBe(500);
    expect(removeObject).not.toHaveBeenCalled();
  });

  it('returns 204 when the record is already absent', async () => {
    const response = await createApp().request(`${MOUNT_PATH}/missing`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(store.remove).not.toHaveBeenCalled();
    expect(removeObject).not.toHaveBeenCalled();
  });

  it('logs object cleanup failure and still returns 204 after record deletion', async () => {
    removeObject.mockRejectedValueOnce(new FileUnavailableError());
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await createApp().request(`${MOUNT_PATH}/file-1`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      'File object cleanup failed after its database record was deleted.',
      expect.any(FileUnavailableError),
    );
  });

  it('preserves a delete authorizer Response without mutations', async () => {
    const response = await createApp({
      authorize: (_context, action) =>
        action === 'delete'
          ? Response.json({ code: 'FORBIDDEN' }, { status: 403 })
          : undefined,
    }).request(`${MOUNT_PATH}/file-1`, { method: 'DELETE' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'FORBIDDEN' });
    expect(removeObject).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('preserves an authorizer Response thrown by the frozen contract', async () => {
    const response = await createApp({
      authorize: () => {
        throw Response.json({ code: 'POLICY_DENIED' }, { status: 403 });
      },
    }).request(`${MOUNT_PATH}/file-1`);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'POLICY_DENIED' });
  });

  it('maps unavailable infrastructure to a stable 503', async () => {
    vi.mocked(store.list).mockRejectedValueOnce(new FileUnavailableError());
    const response = await createApp().request(MOUNT_PATH);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_UNAVAILABLE' },
    });
  });

  function createApp(
    overrides: Partial<CreateFileRouteOptions> = {},
    onError?: (error: Error) => Response,
  ): Hono {
    const app = new Hono();
    if (onError) app.onError(onError);
    app.route(
      MOUNT_PATH,
      createFileRoute({
        store,
        defaultDisk: 'local',
        publicBasePath: '/base',
        tokenSecret: 'secret',
        audience: 'order-files',
        auth: allowingAuth(),
        ...overrides,
      }),
    );
    return app;
  }

  function allowingAuth(): MiddlewareHandler {
    return async (_context, next) => {
      authCalls += 1;
      await next();
    };
  }

  function denyingAuth(): MiddlewareHandler {
    return (context) => {
      authCalls += 1;
      return context.json({ code: 'UNAUTHENTICATED' }, 401);
    };
  }
});

function fileRecord(
  overrides: Partial<FileRecord | NewFileRecord> = {},
): FileRecord {
  return {
    id: 'file-1',
    disk: 'local',
    key: 'server-key',
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    size: 6,
    public: false,
    createdAt: '2026-08-27T09:00:00.000Z',
    updatedAt: '2026-08-27T09:00:00.000Z',
    ...overrides,
  };
}

function uploadBody(
  fields: Readonly<Record<string, string>> = {},
  file: {
    readonly content: string;
    readonly name: string;
    readonly type: string;
  } | null = {
    content: 'report',
    name: 'report.pdf',
    type: 'application/pdf',
  },
): {
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
} {
  const boundary = 'nocobase-file-test-boundary';
  const parts = Object.entries(fields).map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  if (file) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n${file.content}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: parts.join(''),
  };
}

function streamOf(value: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
