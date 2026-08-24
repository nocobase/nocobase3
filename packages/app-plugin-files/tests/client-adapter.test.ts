import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createFileAdapter,
  FileClientError,
  type FileAppClient,
  type FileUploadAdapter,
} from '@nocobase/app-plugin-files/client';
import type {
  CreateBusinessFileResponse,
  FileReference,
  FileUploadPlan,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';

interface ClientCall {
  path: string;
  method: string;
  body?: unknown;
}

type ClientHandler = (
  path: string,
  init: RequestInit,
) => unknown | Promise<unknown>;

class FakeAppClient implements FileAppClient {
  readonly calls: ClientCall[] = [];

  constructor(private readonly handler: ClientHandler) {}

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    this.calls.push({
      path,
      method: init.method ?? 'GET',
      ...(typeof init.body === 'string'
        ? { body: JSON.parse(init.body) as unknown }
        : {}),
    });
    return (await this.handler(path, init)) as T;
  }
}

interface PlannedXhrResponse {
  status?: number;
  responseText?: string;
  autoRespond?: boolean;
  onSend?(): void;
}

class FakeXMLHttpRequest extends EventTarget {
  static readonly plans: PlannedXhrResponse[] = [];
  static readonly requests: FakeXMLHttpRequest[] = [];

  readonly upload = new EventTarget();
  method = '';
  url = '';
  withCredentials = false;
  status = 0;
  responseText = '';
  aborted = false;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(): void {}

  send(): void {
    FakeXMLHttpRequest.requests.push(this);
    const plan = FakeXMLHttpRequest.plans.shift();
    if (!plan) {
      throw new Error('Missing fake XHR plan.');
    }
    plan.onSend?.();
    if (plan.autoRespond === false) {
      return;
    }
    this.status = plan.status ?? 200;
    this.responseText = plan.responseText ?? '';
    this.dispatchEvent(new Event('load'));
  }

  abort(): void {
    this.aborted = true;
    this.dispatchEvent(new Event('abort'));
  }

  static enqueue(plan: PlannedXhrResponse): void {
    this.plans.push(plan);
  }

  static reset(): void {
    this.plans.length = 0;
    this.requests.length = 0;
  }
}

const originalXMLHttpRequest = globalThis.XMLHttpRequest;

beforeEach(() => {
  FakeXMLHttpRequest.reset();
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    configurable: true,
    value: FakeXMLHttpRequest,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    configurable: true,
    value: originalXMLHttpRequest,
  });
});

describe('createFileAdapter', () => {
  it('runs Local business POST, PUT, then business commit without complete', async () => {
    const sequence: string[] = [];
    const client = new FakeAppClient((path, init) => {
      sequence.push(`${init.method ?? 'GET'} ${path}`);
      if (path === 'orders/order-1/files') {
        return createdResponse('local-1', localPlan('local-1'));
      }
      return reference('local-1');
    });
    FakeXMLHttpRequest.enqueue({
      responseText: JSON.stringify({ file: storedFile('local-1') }),
      onSend: () => sequence.push('PUT provider-or-local'),
    });

    await expect(adapter(client).upload(testFile())).resolves.toEqual(
      storedFile('local-1'),
    );

    expect(sequence).toEqual([
      'POST orders/order-1/files',
      'PUT provider-or-local',
      'POST orders/order-1/files/local-1/commit',
    ]);
    expect(FakeXMLHttpRequest.requests).toHaveLength(1);
  });

  it('runs S3 business POST, provider PUT, platform complete, then business commit', async () => {
    const sequence: string[] = [];
    const client = new FakeAppClient((path, init) => {
      sequence.push(`${init.method ?? 'GET'} ${path}`);
      return path.endsWith('/commit')
        ? reference('s3-1')
        : createdResponse('s3-1', s3Plan('s3-1'));
    });
    FakeXMLHttpRequest.enqueue({
      responseText: '<Upload />',
      onSend: () => sequence.push('PUT provider'),
    });
    FakeXMLHttpRequest.enqueue({
      responseText: JSON.stringify({ file: storedFile('s3-1') }),
      onSend: () => sequence.push('POST platform complete'),
    });

    await adapter(client).upload(testFile());

    expect(sequence).toEqual([
      'POST orders/order-1/files',
      'PUT provider',
      'POST platform complete',
      'POST orders/order-1/files/s3-1/commit',
    ]);
  });

  it('aborts the PUT and best-effort cancels pending with bindingCredential', async () => {
    const client = new FakeAppClient((path) =>
      path === 'orders/order-1/files'
        ? createdResponse('abort-1', localPlan('abort-1'))
        : { success: true },
    );
    FakeXMLHttpRequest.enqueue({ autoRespond: false });
    const controller = new AbortController();
    const pending = adapter(client).upload(testFile(), {
      signal: controller.signal,
    });

    await waitForXhr();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'UPLOAD_ABORTED' });
    expect(FakeXMLHttpRequest.requests[0]?.aborted).toBe(true);
    expect(client.calls.at(-1)).toEqual({
      path: 'orders/order-1/files/abort-1',
      method: 'DELETE',
      body: { bindingCredential: 'binding-abort-1' },
    });
  });

  it('preserves the original transport error when cancel also fails', async () => {
    const client = new FakeAppClient((path) => {
      if (path === 'orders/order-1/files') {
        return createdResponse('failed-1', localPlan('failed-1'));
      }
      throw Object.assign(new Error('cancel failed'), {
        status: 503,
        payload: {
          error: 'cancel failed',
          code: 'STORAGE_UNAVAILABLE',
        },
      });
    });
    FakeXMLHttpRequest.enqueue({
      status: 410,
      responseText: JSON.stringify({
        error: 'The file upload plan has expired.',
        code: 'UPLOAD_EXPIRED',
      }),
    });

    await expect(adapter(client).upload(testFile())).rejects.toMatchObject({
      code: 'UPLOAD_EXPIRED',
      message: 'The file upload plan has expired.',
    });
  });

  it('best-effort deletes the attempt when business commit fails', async () => {
    const client = new FakeAppClient((path) => {
      if (path === 'orders/order-1/files') {
        return createdResponse('commit-1', localPlan('commit-1'));
      }
      if (path.endsWith('/commit')) {
        throw Object.assign(new Error('commit failed'), {
          status: 409,
          payload: {
            error: 'The file binding no longer matches the business record.',
            code: 'FILE_BINDING_CONFLICT',
          },
        });
      }
      return { success: true };
    });
    FakeXMLHttpRequest.enqueue({
      responseText: JSON.stringify({ file: storedFile('commit-1') }),
    });

    await expect(adapter(client).upload(testFile())).rejects.toMatchObject({
      code: 'FILE_BINDING_CONFLICT',
      operation: 'commit',
    });
    expect(client.calls.at(-1)).toEqual({
      path: 'orders/order-1/files/commit-1',
      method: 'DELETE',
      body: { bindingCredential: 'binding-commit-1' },
    });
  });

  it('retry creates a new fileId after a failed attempt', async () => {
    const ids = ['attempt-1', 'attempt-2'];
    const client = new FakeAppClient((path) => {
      if (path === 'orders/order-1/files') {
        const id = ids.shift();
        if (!id) throw new Error('No file id.');
        return createdResponse(id, localPlan(id));
      }
      if (path.endsWith('/commit')) {
        return reference('attempt-2');
      }
      return { success: true };
    });
    FakeXMLHttpRequest.enqueue({
      status: 409,
      responseText: JSON.stringify({
        error: 'Upload failed.',
        code: 'UPLOAD_FAILED',
      }),
    });
    FakeXMLHttpRequest.enqueue({
      responseText: JSON.stringify({ file: storedFile('attempt-2') }),
    });
    const fileAdapter = adapter(client);

    await expect(fileAdapter.upload(testFile())).rejects.toBeInstanceOf(
      FileClientError,
    );
    await expect(fileAdapter.retry(testFile())).resolves.toMatchObject({
      id: 'attempt-2',
    });

    expect(
      client.calls.filter((call) => call.path === 'orders/order-1/files'),
    ).toEqual([
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ method: 'POST' }),
    ]);
    expect(FakeXMLHttpRequest.requests.map((request) => request.url)).toEqual([
      expect.stringContaining('/attempt-1/'),
      expect.stringContaining('/attempt-2/'),
    ]);
  });

  it('uses replaceFileId on collection POST and keeps relation ids internal', async () => {
    const client = new FakeAppClient((path) =>
      path.endsWith('/commit')
        ? { ...reference('new-1'), slot: 2 }
        : createdResponse('new-1', localPlan('new-1')),
    );
    FakeXMLHttpRequest.enqueue({
      responseText: JSON.stringify({ file: storedFile('new-1') }),
    });

    await expect(adapter(client).replace('old-1', testFile())).resolves.toEqual(
      { ...storedFile('new-1'), slot: 2 },
    );
    expect(client.calls[0]).toEqual({
      path: 'orders/order-1/files',
      method: 'POST',
      body: {
        name: 'report.txt',
        size: 10,
        contentType: 'text/plain',
        replaceFileId: 'old-1',
      },
    });
    expect(JSON.stringify(client.calls)).not.toContain('relationId');
    expect(JSON.stringify(client.calls)).not.toContain('replaceReferenceId');
    expect(JSON.stringify(client.calls)).not.toContain('/uploads');
  });

  it('loads, accesses, detaches, and manages Public access without caching URLs', async () => {
    let accessCount = 0;
    const client = new FakeAppClient((path, init) => {
      if ((init.method ?? 'GET') === 'GET') {
        return { references: [{ ...reference('ready-1'), slot: 1 }] };
      }
      if (path.endsWith('/access')) {
        accessCount += 1;
        return {
          access: {
            url: `/temporary/${accessCount}`,
            expiresAt: '2026-08-24T00:05:00.000Z',
            disposition: 'inline',
          },
        };
      }
      if (path.endsWith('/public-access/reset')) {
        return publicResponse('ready-1', 'public-reset');
      }
      if (path.endsWith('/public-access') && init.method === 'POST') {
        return publicResponse('ready-1', 'public-enable');
      }
      if (path.endsWith('/public-access') && init.method === 'DELETE') {
        return reference('ready-1');
      }
      return { success: true };
    });
    const fileAdapter = adapter(client);

    await expect(fileAdapter.list()).resolves.toEqual([
      { ...storedFile('ready-1'), slot: 1 },
    ]);
    await expect(
      fileAdapter.access('ready-1', 'inline'),
    ).resolves.toMatchObject({
      url: '/temporary/1',
    });
    await expect(
      fileAdapter.access('ready-1', 'inline'),
    ).resolves.toMatchObject({
      url: '/temporary/2',
    });
    await fileAdapter.detach('ready-1');
    await expect(
      fileAdapter.enablePublicAccess('ready-1', 'attachment'),
    ).resolves.toMatchObject({ access: { token: 'public-enable' } });
    await expect(
      fileAdapter.resetPublicAccess('ready-1', 'inline'),
    ).resolves.toMatchObject({ access: { token: 'public-reset' } });
    await expect(
      fileAdapter.disablePublicAccess('ready-1'),
    ).resolves.toMatchObject({ id: 'ready-1' });

    expect(client.calls).toEqual(
      expect.arrayContaining([
        { path: 'orders/order-1/files/ready-1', method: 'DELETE' },
        {
          path: 'orders/order-1/files/ready-1/public-access',
          method: 'POST',
          body: { disposition: 'attachment' },
        },
        {
          path: 'orders/order-1/files/ready-1/public-access/reset',
          method: 'POST',
          body: { disposition: 'inline' },
        },
      ]),
    );
    expect(accessCount).toBe(2);
  });

  it('maps stable AppClient errors from the shared error payload', async () => {
    const client = new FakeAppClient(() => {
      throw Object.assign(new Error('NocoBase request failed.'), {
        status: 409,
        payload: {
          error: 'The business record has reached its file limit.',
          code: 'FILE_LIMIT_EXCEEDED',
        },
      });
    });

    await expect(adapter(client).upload(testFile())).rejects.toMatchObject({
      code: 'FILE_LIMIT_EXCEEDED',
      status: 409,
      operation: 'create',
      message: 'The business record has reached its file limit.',
    });
  });

  it('rejects legacy upload.plan response wrapping', async () => {
    const client = new FakeAppClient(() => ({
      file: pendingFile('legacy-1'),
      upload: { plan: localPlan('legacy-1') },
      bindingCredential: 'binding-legacy-1',
    }));

    await expect(adapter(client).upload(testFile())).rejects.toMatchObject({
      code: 'FILE_RESPONSE_INVALID',
      operation: 'create',
    });
    expect(FakeXMLHttpRequest.requests).toHaveLength(0);
  });
});

function adapter(client: FileAppClient): FileUploadAdapter {
  return createFileAdapter({ client, basePath: '/orders/order-1/files/' });
}

function testFile(): File {
  return new File(['0123456789'], 'report.txt', { type: 'text/plain' });
}

function storedFile(id: string): StoredFile {
  return {
    id,
    status: 'ready',
    name: 'report.txt',
    size: 10,
    contentType: 'text/plain',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:01.000Z',
  };
}

function pendingFile(id: string): StoredFile {
  return {
    ...storedFile(id),
    status: 'pending',
    size: null,
    contentType: null,
  };
}

function reference(id: string): FileReference {
  return { file: storedFile(id) };
}

function createdResponse(
  id: string,
  uploadPlan: FileUploadPlan,
): CreateBusinessFileResponse {
  return {
    file: pendingFile(id),
    uploadPlan,
    bindingCredential: `binding-${id}`,
  };
}

function localPlan(fileId: string): FileUploadPlan {
  return {
    fileId,
    expiresAt: '2026-08-24T00:05:00.000Z',
    upload: {
      method: 'PUT',
      url: `/mounted/api/files/${fileId}/upload?access=opaque-local`,
    },
  };
}

function s3Plan(fileId: string): FileUploadPlan {
  return {
    fileId,
    expiresAt: '2026-08-24T00:05:00.000Z',
    upload: {
      method: 'PUT',
      url: 'https://provider.example/upload?signature=provider-secret',
    },
    complete: {
      method: 'POST',
      url: `/mounted/api/files/${fileId}/complete?access=opaque-complete`,
    },
  };
}

function publicResponse(
  id: string,
  token: string,
): {
  reference: FileReference;
  access: {
    url: string;
    token: string;
    disposition: 'inline';
  };
} {
  return {
    reference: reference(id),
    access: {
      url: `/public/${token}`,
      token,
      disposition: 'inline',
    },
  };
}

async function waitForXhr(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (FakeXMLHttpRequest.requests.length > 0) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error('The fake XHR request did not start.');
}
