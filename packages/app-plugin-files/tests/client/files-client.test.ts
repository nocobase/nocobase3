import { readFile } from 'node:fs/promises';

import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFilesClient,
  FilesClientError,
} from '../../client/files-client.js';
import type { FileRecord } from '../../client/types.js';

const record: FileRecord = {
  id: 'file-1',
  filename: 'report.pdf',
  mimeType: 'application/pdf',
  size: 42,
  public: false,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
  contentUrl: '/api/orders/1/attachments/file-1/content',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createFilesClient', () => {
  beforeEach(() => {
    window.NOCOBASE_API_URL = '/nocobase/api/__app/main';
    window.NOCOBASE_PORTAL_BASE = '/nocobase/';
    nocobaseClient.setToken('test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    nocobaseClient.setToken(null);
    delete window.NOCOBASE_API_URL;
    delete window.NOCOBASE_PORTAL_BASE;
  });

  it('normalizes the server base path and list/get data envelopes', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [record] }))
      .mockResolvedValueOnce(jsonResponse({ data: record }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createFilesClient({
      endpoint: '/api/orders/1/attachments///',
    });

    await expect(client.list()).resolves.toEqual([
      {
        ...record,
        contentUrl:
          'http://localhost:3000/nocobase/api/orders/1/attachments/file-1/content',
      },
    ]);
    await expect(client.get('file/1')).resolves.toEqual({
      ...record,
      contentUrl:
        'http://localhost:3000/nocobase/api/orders/1/attachments/file-1/content',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/nocobase/api/orders/1/attachments',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost:3000/nocobase/api/orders/1/attachments/file%2F1',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'include',
    });
  });

  it('uploads FormData with the optional Public flag and public client headers', async () => {
    const getHeaders = vi.spyOn(nocobaseClient, 'getHeaders').mockReturnValue({
      Authorization: 'Bearer test-token',
      'X-CSRF-Token': 'csrf-value',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: record }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createFilesClient({ endpoint: '/api/files' });
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    await client.upload(file, { public: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/nocobase/api/files',
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    const uploadedFile = body.get('file');
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe('hello.txt');
    await expect((uploadedFile as File).text()).resolves.toBe('hello');
    expect(body.get('public')).toBe('true');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['X-CSRF-Token']).toBe('csrf-value');
    expect(
      Object.keys(headers).some(
        (name) => name.toLowerCase() === 'content-type',
      ),
    ).toBe(false);
    expect(getHeaders).toHaveBeenCalledWith({
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('normalizes Token URLs and accepts the Route 204 delete response', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            url: '/api/files/file-1/content?token=signed',
            expiresAt: '2026-08-27T00:15:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createFilesClient({ endpoint: '/api/files/' });

    await expect(client.createAccessUrl('file-1', 300)).resolves.toEqual({
      url: 'http://localhost:3000/nocobase/api/files/file-1/content?token=signed',
      expiresAt: '2026-08-27T00:15:00.000Z',
    });
    await expect(client.remove('file-1')).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/nocobase/api/files/file-1/token',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ expiresIn: 300 }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost:3000/nocobase/api/files/file-1',
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('does not duplicate an already-prefixed app base path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          data: {
            ...record,
            contentUrl: '/nocobase/api/files/file-1/content',
          },
        }),
      ),
    );
    const client = createFilesClient({ endpoint: '/nocobase/api/files' });

    await expect(client.get('file-1')).resolves.toMatchObject({
      contentUrl: 'http://localhost:3000/nocobase/api/files/file-1/content',
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/nocobase/api/files/file-1',
    );
  });

  it('throws a typed error with status, code, and server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: { code: 'FILE_NOT_FOUND', message: 'File was not found.' },
          },
          404,
        ),
      ),
    );
    const client = createFilesClient({ endpoint: '/api/files' });

    const error = await client.get('missing').catch((value: unknown) => value);

    expect(error).toBeInstanceOf(FilesClientError);
    expect(error).toMatchObject({
      status: 404,
      code: 'FILE_NOT_FOUND',
      message: 'File was not found.',
      serverMessage: 'File was not found.',
    });
  });

  it('contains no legacy storage action endpoint strings', async () => {
    const source = await readFile('client/files-client.ts', 'utf8');
    const legacyPrefix = ['storage', 's:'].join('');
    const legacyPresign = ['create', 'Presigned', 'Url'].join('');

    expect(source).not.toContain(legacyPrefix);
    expect(source).not.toContain(legacyPresign);
  });
});
