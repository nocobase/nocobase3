import { readFile } from 'node:fs/promises';

import { createAppClient, type AppClient } from '@nocobase/app-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFilesClient,
  FilesClientError,
} from '../../client/files-client.js';
import type { FileRecord, FilesClient } from '../../client/types.js';

const record: FileRecord = {
  id: 'file-1',
  filename: 'report.pdf',
  mimeType: 'application/pdf',
  size: 42,
  public: false,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
  contentUrl: '/nocobase/api/orders/1/attachments/file-1/content',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function filesClient(
  fetch: typeof globalThis.fetch,
  endpoint = 'orders/1/attachments',
): FilesClient {
  return createFilesClient({
    appClient: createAppClient({ baseURL: '/nocobase/api', fetch }),
    endpoint,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createFilesClient', () => {
  it('uses the v3 App client API root and preserves server file URLs', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [record] }))
      .mockResolvedValueOnce(jsonResponse({ data: record }));
    const client = filesClient(fetch, '/orders/1/attachments///');

    await expect(client.list()).resolves.toEqual([record]);
    await expect(client.get('file/1')).resolves.toEqual(record);

    expect(fetch.mock.calls[0]?.[0]).toBe('/nocobase/api/orders/1/attachments');
    expect(fetch.mock.calls[1]?.[0]).toBe(
      '/nocobase/api/orders/1/attachments/file%2F1',
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'include',
    });
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('X-Authenticator')).toBe(false);
    expect(headers.has('X-Role')).toBe(false);
    expect(headers.has('X-With-ACL-Meta')).toBe(false);
  });

  it.each([
    ['an API prefix', '/api/files', 'must not include the api prefix'],
    [
      'an absolute URL',
      'https://files.example.test/api/files',
      'must be relative to the application API root',
    ],
    [
      'a protocol-relative URL',
      '//files.example.test/api/files',
      'must be relative to the application API root',
    ],
    [
      'a parent segment',
      'orders/../files',
      'must not contain empty or relative path segments',
    ],
    [
      'a query string',
      'orders/files?scope=all',
      'must not contain a query string or fragment',
    ],
    ['an encoded API prefix', '%61pi/files', 'must not include the api prefix'],
    [
      'an encoded path separator',
      'orders%2F1/files',
      'must not contain encoded path separators',
    ],
  ] as const)(
    'rejects endpoints containing %s',
    (_label, endpoint, message) => {
      const appClient: AppClient = { request: vi.fn() };

      expect(() => createFilesClient({ appClient, endpoint })).toThrowError(
        message,
      );
      expect(appClient.request).not.toHaveBeenCalled();
    },
  );

  it('uploads FormData through the v3 App client without a manual content type', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ data: record }));
    const client = filesClient(fetch, 'files');
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const controller = new AbortController();

    await client.upload(file, { public: true, signal: controller.signal });

    expect(fetch.mock.calls[0]?.[0]).toBe('/nocobase/api/files');
    const init = fetch.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    });
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    const uploadedFile = body.get('file');
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe('hello.txt');
    await expect((uploadedFile as File).text()).resolves.toBe('hello');
    expect(body.get('public')).toBe('true');
    const headers = new Headers(init?.headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('preserves AbortError for cancelled uploads', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const client = filesClient(fetch, 'files');
    const controller = new AbortController();
    const upload = client.upload(new File(['x'], 'x.txt'), {
      signal: controller.signal,
    });

    controller.abort();
    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses the v3 token and delete routes', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            url: '/nocobase/api/files/file-1/content?token=signed',
            expiresAt: '2026-08-27T00:15:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = filesClient(fetch, 'files/');

    await expect(client.createAccessUrl('file-1', 300)).resolves.toEqual({
      url: '/nocobase/api/files/file-1/content?token=signed',
      expiresAt: '2026-08-27T00:15:00.000Z',
    });
    await expect(client.remove('file-1')).resolves.toBeUndefined();

    expect(fetch.mock.calls[0]?.[0]).toBe('/nocobase/api/files/file-1/token');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ expiresIn: 300 }),
    });
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Content-Type'),
    ).toBe('application/json');
    expect(fetch.mock.calls[1]?.[0]).toBe('/nocobase/api/files/file-1');
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('throws a typed error with status, code, and server message', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: { code: 'FILE_NOT_FOUND', message: 'File was not found.' },
        },
        404,
      ),
    );
    const client = filesClient(fetch, 'files');

    const error = await client.get('missing').catch((value: unknown) => value);

    expect(error).toBeInstanceOf(FilesClientError);
    expect(error).toMatchObject({
      status: 404,
      code: 'FILE_NOT_FOUND',
      message: 'File was not found.',
      serverMessage: 'File was not found.',
    });
  });

  it('contains no Portal SDK or legacy v2 protocol strings', async () => {
    const source = await readFile('client/files-client.ts', 'utf8');
    const legacyStoragePrefix = ['storage', 's:'].join('');
    const legacyPresign = ['create', 'Presigned', 'Url'].join('');

    expect(source).not.toContain('@nocobase/app-portal-sdk');
    expect(source).not.toContain('nocobaseClient');
    expect(source).not.toContain('NOCOBASE_API_URL');
    expect(source).not.toContain('x-new-token');
    expect(source).not.toContain(legacyStoragePrefix);
    expect(source).not.toContain(legacyPresign);
  });
});
