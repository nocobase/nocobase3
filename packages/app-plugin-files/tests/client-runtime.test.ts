import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  executeFileUploadPlan,
  FileClientError,
  type FileUploadProgress,
} from '@nocobase/app-plugin-files/client';
import type {
  FileUploadPlan,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';

interface PlannedXhrResponse {
  status?: number;
  responseText?: string;
  progress?: number[];
  event?: 'load' | 'error';
  autoRespond?: boolean;
}

class FakeXMLHttpRequest extends EventTarget {
  static readonly plans: PlannedXhrResponse[] = [];
  static readonly requests: FakeXMLHttpRequest[] = [];

  readonly upload = new EventTarget();
  readonly headers = new Map<string, string>();
  method = '';
  url = '';
  async = true;
  withCredentials = false;
  status = 0;
  responseText = '';
  body: Document | XMLHttpRequestBodyInit | null = null;
  aborted = false;

  static enqueue(plan: PlannedXhrResponse): void {
    this.plans.push(plan);
  }

  open(method: string, url: string, async = true): void {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  send(body: Document | XMLHttpRequestBodyInit | null = null): void {
    this.body = body;
    FakeXMLHttpRequest.requests.push(this);
    const plan = FakeXMLHttpRequest.plans.shift();
    if (!plan) {
      throw new Error('Missing fake XHR plan.');
    }
    if (plan.autoRespond === false) {
      return;
    }
    for (const loaded of plan.progress ?? []) {
      const progress = new Event('progress');
      Object.defineProperties(progress, {
        lengthComputable: { value: true },
        loaded: { value: loaded },
        total: { value: body instanceof Blob ? body.size : 0 },
      });
      this.upload.dispatchEvent(progress);
    }
    this.status = plan.status ?? 200;
    this.responseText = plan.responseText ?? '';
    this.dispatchEvent(new Event(plan.event ?? 'load'));
  }

  abort(): void {
    this.aborted = true;
    this.dispatchEvent(new Event('abort'));
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

describe('executeFileUploadPlan', () => {
  it('uses Local PUT then complete and reports byte progress events', async () => {
    const file = testFile();
    const ready = storedFile('local-1');
    FakeXMLHttpRequest.enqueue({
      status: 200,
      responseText: JSON.stringify({ file: { ...ready, status: 'pending' } }),
      progress: [2, 7, 10],
    });
    FakeXMLHttpRequest.enqueue({
      status: 200,
      responseText: JSON.stringify({ file: ready }),
    });
    const progress: FileUploadProgress[] = [];

    await expect(
      executeFileUploadPlan(localPlan('local-1'), file, {
        onProgress: (event) => progress.push(event),
      }),
    ).resolves.toEqual(ready);

    expect(progress).toEqual([
      { loaded: 2, total: 10, percentage: 20 },
      { loaded: 7, total: 10, percentage: 70 },
      { loaded: 10, total: 10, percentage: 100 },
    ]);
    expect(FakeXMLHttpRequest.requests).toHaveLength(2);
    expect(FakeXMLHttpRequest.requests[0]).toMatchObject({
      method: 'PUT',
      url: '/mounted/api/files/local-1/upload?access=opaque-local',
      withCredentials: true,
      body: file,
    });
    expect(FakeXMLHttpRequest.requests[1]).toMatchObject({
      method: 'POST',
      url: '/mounted/api/files/local-1/complete?access=opaque-complete',
      withCredentials: true,
      body: null,
    });
    expect(FakeXMLHttpRequest.requests[0]?.headers.get('content-type')).toBe(
      'text/plain',
    );
  });

  it('runs provider PUT before platform complete for S3 plans', async () => {
    const ready = storedFile('s3-1');
    FakeXMLHttpRequest.enqueue({ status: 200, responseText: '<Upload />' });
    FakeXMLHttpRequest.enqueue({
      status: 200,
      responseText: JSON.stringify({ file: ready }),
    });

    await expect(
      executeFileUploadPlan(s3Plan('s3-1'), testFile()),
    ).resolves.toEqual(ready);

    expect(FakeXMLHttpRequest.requests).toHaveLength(2);
    expect(FakeXMLHttpRequest.requests[0]).toMatchObject({
      method: 'PUT',
      url: 'https://provider.example/upload?signature=secret-provider-value',
      withCredentials: false,
    });
    expect(FakeXMLHttpRequest.requests[1]).toMatchObject({
      method: 'POST',
      url: '/mounted/api/files/s3-1/complete?access=opaque-complete',
      withCredentials: true,
      body: null,
    });
  });

  it('aborts the active PUT through AbortSignal', async () => {
    FakeXMLHttpRequest.enqueue({ autoRespond: false });
    FakeXMLHttpRequest.enqueue({ status: 500 });
    const controller = new AbortController();
    const pending = executeFileUploadPlan(localPlan('abort-1'), testFile(), {
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_ABORTED',
      operation: 'upload',
    });
    expect(FakeXMLHttpRequest.requests[0]?.aborted).toBe(true);
    expect(FakeXMLHttpRequest.requests[1]).toMatchObject({
      method: 'DELETE',
      url: '/mounted/api/files/abort-1/upload?access=opaque-cancel',
    });
  });

  it('cancels after an upload failure', async () => {
    FakeXMLHttpRequest.enqueue({ status: 503 });
    FakeXMLHttpRequest.enqueue({ status: 204 });

    await expect(
      executeFileUploadPlan(s3Plan('upload-failure'), testFile()),
    ).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
      status: 503,
      operation: 'upload',
    });

    expect(FakeXMLHttpRequest.requests).toHaveLength(2);
    expect(FakeXMLHttpRequest.requests[1]).toMatchObject({
      method: 'DELETE',
      url: '/mounted/api/files/upload-failure/upload?access=opaque-cancel',
      withCredentials: true,
    });
  });

  it('cancels after a complete failure', async () => {
    FakeXMLHttpRequest.enqueue({ status: 200 });
    FakeXMLHttpRequest.enqueue({
      status: 409,
      responseText: JSON.stringify({
        error: 'The file binding changed.',
        code: 'FILE_BINDING_CONFLICT',
      }),
    });
    FakeXMLHttpRequest.enqueue({ status: 204 });

    await expect(
      executeFileUploadPlan(localPlan('complete-failure'), testFile()),
    ).rejects.toMatchObject({
      code: 'FILE_BINDING_CONFLICT',
      status: 409,
      operation: 'complete',
    });

    expect(
      FakeXMLHttpRequest.requests.map((request) => request.method),
    ).toEqual(['PUT', 'POST', 'DELETE']);
  });

  it('retries a failed complete once with the same plan', async () => {
    const ready = storedFile('complete-retry');
    FakeXMLHttpRequest.enqueue({ status: 200 });
    FakeXMLHttpRequest.enqueue({ status: 503 });
    FakeXMLHttpRequest.enqueue({
      status: 200,
      responseText: JSON.stringify({ file: ready }),
    });

    await expect(
      executeFileUploadPlan(localPlan('complete-retry'), testFile()),
    ).resolves.toEqual(ready);

    expect(
      FakeXMLHttpRequest.requests.map(({ method, url }) => ({ method, url })),
    ).toEqual([
      {
        method: 'PUT',
        url: '/mounted/api/files/complete-retry/upload?access=opaque-local',
      },
      {
        method: 'POST',
        url: '/mounted/api/files/complete-retry/complete?access=opaque-complete',
      },
      {
        method: 'POST',
        url: '/mounted/api/files/complete-retry/complete?access=opaque-complete',
      },
    ]);
  });

  it('does not retry an aborted complete', async () => {
    FakeXMLHttpRequest.enqueue({ status: 200 });
    FakeXMLHttpRequest.enqueue({ autoRespond: false });
    FakeXMLHttpRequest.enqueue({ status: 204 });
    const controller = new AbortController();
    const pending = executeFileUploadPlan(
      localPlan('complete-abort'),
      testFile(),
      { signal: controller.signal },
    );
    await waitForRequestCount(2);

    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_ABORTED',
      operation: 'complete',
    });
    expect(FakeXMLHttpRequest.requests[1]?.aborted).toBe(true);
    expect(
      FakeXMLHttpRequest.requests.map((request) => request.method),
    ).toEqual(['PUT', 'POST', 'DELETE']);
  });

  it('preserves the first complete failure when the retry also fails', async () => {
    FakeXMLHttpRequest.enqueue({ status: 200 });
    FakeXMLHttpRequest.enqueue({ status: 503 });
    FakeXMLHttpRequest.enqueue({ status: 502 });
    FakeXMLHttpRequest.enqueue({ status: 204 });

    await expect(
      executeFileUploadPlan(localPlan('complete-double-failure'), testFile()),
    ).rejects.toMatchObject({
      code: 'UPLOAD_FAILED',
      status: 503,
      operation: 'complete',
    });

    expect(
      FakeXMLHttpRequest.requests.map((request) => request.method),
    ).toEqual(['PUT', 'POST', 'POST', 'DELETE']);
  });

  it('surfaces an abort while waiting for the retried complete', async () => {
    const plan = localPlan('complete-retry-abort');
    FakeXMLHttpRequest.enqueue({ status: 200 });
    FakeXMLHttpRequest.enqueue({ status: 503 });
    FakeXMLHttpRequest.enqueue({ autoRespond: false });
    FakeXMLHttpRequest.enqueue({ status: 204 });
    const controller = new AbortController();
    const pending = executeFileUploadPlan(plan, testFile(), {
      signal: controller.signal,
    });
    await waitForRequestCount(3);

    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_ABORTED',
      status: 0,
      operation: 'complete',
    });
    expect(FakeXMLHttpRequest.requests[2]?.aborted).toBe(true);
    expect(
      FakeXMLHttpRequest.requests.map((request) => request.method),
    ).toEqual(['PUT', 'POST', 'POST', 'DELETE']);
    expect(FakeXMLHttpRequest.requests[2]?.url).toBe(plan.complete.url);
    expect(FakeXMLHttpRequest.requests[3]?.url).toBe(plan.cancel.url);
  });

  it('preserves the original failure when cancel also fails', async () => {
    FakeXMLHttpRequest.enqueue({
      status: 410,
      responseText: JSON.stringify({
        error: 'The file upload plan has expired.',
        code: 'UPLOAD_EXPIRED',
      }),
    });
    FakeXMLHttpRequest.enqueue({ status: 500 });

    await expect(
      executeFileUploadPlan(localPlan('double-failure'), testFile()),
    ).rejects.toMatchObject({
      message: 'The file upload plan has expired.',
      code: 'UPLOAD_EXPIRED',
      status: 410,
      operation: 'upload',
    });

    expect(FakeXMLHttpRequest.requests).toHaveLength(2);
    expect(FakeXMLHttpRequest.requests[1]?.method).toBe('DELETE');
  });

  it('rejects malformed plans before starting transport', async () => {
    const plan = localPlan('malformed');
    plan.complete.url = 'javascript:alert(document.cookie)';

    await expect(executeFileUploadPlan(plan, testFile())).rejects.toMatchObject(
      {
        code: 'UPLOAD_PLAN_INVALID',
        status: 0,
        operation: 'upload',
      },
    );
    expect(FakeXMLHttpRequest.requests).toHaveLength(0);
  });

  it('maps stable platform errors without exposing the signed URL', async () => {
    FakeXMLHttpRequest.enqueue({
      status: 410,
      responseText: JSON.stringify({
        error: 'The file upload plan has expired.',
        code: 'UPLOAD_EXPIRED',
      }),
    });
    FakeXMLHttpRequest.enqueue({ status: 200 });
    const plan = localPlan('expired-1');

    let caught: unknown;
    try {
      await executeFileUploadPlan(plan, testFile());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FileClientError);
    expect(caught).toMatchObject({
      message: 'The file upload plan has expired.',
      code: 'UPLOAD_EXPIRED',
      status: 410,
    });
    expect(String(caught)).not.toContain(plan.upload.url);
    expect(JSON.stringify(caught)).not.toContain('opaque-local');
  });

  it('redacts URLs, capabilities, and bearer credentials from platform errors', async () => {
    const secretUrl =
      'https://files.example/upload?signature=provider-secret&part=1';
    FakeXMLHttpRequest.enqueue({ status: 200 });
    FakeXMLHttpRequest.enqueue({
      status: 400,
      responseText: JSON.stringify({
        error:
          `Complete failed at ${secretUrl} with ` +
          'Bearer opaque-bearer and /complete?access=opaque-capability',
        code: 'UPLOAD_FAILED',
      }),
    });
    FakeXMLHttpRequest.enqueue({ status: 204 });

    let caught: unknown;
    try {
      await executeFileUploadPlan(localPlan('redacted'), testFile());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FileClientError);
    const serialized = `${String(caught)} ${JSON.stringify(caught)}`;
    expect(serialized).not.toContain(secretUrl);
    expect(serialized).not.toContain('provider-secret');
    expect(serialized).not.toContain('opaque-bearer');
    expect(serialized).not.toContain('opaque-capability');
    expect(serialized).toContain('[redacted-url]');
  });
});

function testFile(): File {
  return new File(['0123456789'], 'report.txt', { type: 'text/plain' });
}

async function waitForRequestCount(count: number): Promise<void> {
  while (FakeXMLHttpRequest.requests.length < count) {
    await Promise.resolve();
  }
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

function localPlan(fileId: string): FileUploadPlan {
  return {
    fileId,
    expiresAt: '2026-08-24T00:05:00.000Z',
    upload: {
      method: 'PUT',
      url: `/mounted/api/files/${fileId}/upload?access=opaque-local`,
      headers: { 'content-type': 'text/plain' },
    },
    complete: {
      method: 'POST',
      url: `/mounted/api/files/${fileId}/complete?access=opaque-complete`,
    },
    cancel: {
      method: 'DELETE',
      url: `/mounted/api/files/${fileId}/upload?access=opaque-cancel`,
    },
  };
}

function s3Plan(fileId: string): FileUploadPlan {
  return {
    fileId,
    expiresAt: '2026-08-24T00:05:00.000Z',
    upload: {
      method: 'PUT',
      url: 'https://provider.example/upload?signature=secret-provider-value',
      headers: { 'content-type': 'text/plain' },
    },
    complete: {
      method: 'POST',
      url: `/mounted/api/files/${fileId}/complete?access=opaque-complete`,
    },
    cancel: {
      method: 'DELETE',
      url: `/mounted/api/files/${fileId}/upload?access=opaque-cancel`,
    },
  };
}
