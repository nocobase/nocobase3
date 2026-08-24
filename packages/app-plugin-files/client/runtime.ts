import type { FileUploadPlan, StoredFile } from '../protocol.js';
import { FileClientError, createTransportError } from './error.js';
import type {
  ExecuteFileUploadPlanOptions,
  FileUploadProgress,
} from './types.js';

interface FileResponseBody {
  file: StoredFile;
}

interface XhrRequestOptions {
  method: 'PUT' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: Blob;
  signal?: AbortSignal;
  withCredentials: boolean;
  stableErrors: boolean;
  operation: 'upload' | 'complete';
  onProgress?(progress: FileUploadProgress): void;
}

interface XhrResponse {
  status: number;
  text: string;
}

export async function executeFileUploadPlan(
  plan: FileUploadPlan,
  file: File,
  options: ExecuteFileUploadPlanOptions = {},
): Promise<StoredFile> {
  assertUploadPlan(plan);
  const uploadResponse = await sendXhrRequest({
    method: 'PUT',
    url: plan.upload.url,
    headers: plan.upload.headers,
    body: file,
    signal: options.signal,
    withCredentials: plan.complete === undefined,
    stableErrors: plan.complete === undefined,
    operation: 'upload',
    onProgress:
      options.onProgress === undefined
        ? undefined
        : (progress: FileUploadProgress): void =>
            options.onProgress?.(progress),
  });

  const readyFile =
    plan.complete === undefined
      ? readReadyFile(uploadResponse, plan.fileId, 'upload')
      : readReadyFile(
          await sendXhrRequest({
            method: 'POST',
            url: plan.complete.url,
            headers: plan.complete.headers,
            signal: options.signal,
            withCredentials: true,
            stableErrors: true,
            operation: 'complete',
          }),
          plan.fileId,
          'complete',
        );

  return readyFile;
}

function sendXhrRequest(options: XhrRequestOptions): Promise<XhrResponse> {
  if (typeof XMLHttpRequest === 'undefined') {
    return Promise.reject(
      new FileClientError('File upload transport is unavailable.', {
        code: 'UPLOAD_TRANSPORT_UNAVAILABLE',
        status: 0,
        operation: options.operation,
      }),
    );
  }
  if (options.signal?.aborted) {
    return Promise.reject(createAbortError(options.operation));
  }

  return new Promise<XhrResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      options.signal?.removeEventListener('abort', abortRequest);
      callback();
    };
    const abortRequest = (): void => xhr.abort();

    xhr.open(options.method, options.url, true);
    xhr.withCredentials = options.withCredentials;
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    if (options.onProgress) {
      xhr.upload.addEventListener('progress', (event: ProgressEvent) => {
        const total =
          event.lengthComputable && event.total > 0
            ? event.total
            : (options.body?.size ?? 0);
        const loaded = event.loaded;
        options.onProgress?.({
          loaded,
          total,
          percentage:
            total === 0
              ? 0
              : Math.min(100, Math.max(0, (loaded / total) * 100)),
        });
      });
    }
    xhr.addEventListener('load', () => {
      finish(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ status: xhr.status, text: xhr.responseText });
          return;
        }
        reject(
          createTransportError(
            options.operation,
            xhr.status,
            xhr.responseText,
            options.stableErrors,
          ),
        );
      });
    });
    xhr.addEventListener('error', () => {
      finish(() => {
        reject(
          createTransportError(
            options.operation,
            xhr.status,
            '',
            options.stableErrors,
          ),
        );
      });
    });
    xhr.addEventListener('abort', () => {
      finish(() => reject(createAbortError(options.operation)));
    });
    options.signal?.addEventListener('abort', abortRequest, { once: true });
    xhr.send(options.body ?? null);
  });
}

function readReadyFile(
  response: XhrResponse,
  fileId: string,
  operation: 'upload' | 'complete',
): StoredFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text) as unknown;
  } catch (error) {
    throw invalidReadyResponse(operation, response.status, error);
  }
  if (
    !isRecord(parsed) ||
    !isStoredFile(parsed.file) ||
    parsed.file.id !== fileId ||
    parsed.file.status !== 'ready'
  ) {
    throw invalidReadyResponse(operation, response.status);
  }
  const responseBody: FileResponseBody = { file: parsed.file };
  return responseBody.file;
}

function invalidReadyResponse(
  operation: 'upload' | 'complete',
  status: number,
  cause?: unknown,
): FileClientError {
  return new FileClientError(
    `File ${operation} returned an invalid ready file response.`,
    {
      code: 'UPLOAD_RESPONSE_INVALID',
      status,
      operation,
      cause,
    },
  );
}

function createAbortError(operation: 'upload' | 'complete'): FileClientError {
  return new FileClientError('File upload was aborted.', {
    code: 'UPLOAD_ABORTED',
    status: 0,
    operation,
  });
}

function assertUploadPlan(plan: FileUploadPlan): void {
  if (
    plan.upload.method !== 'PUT' ||
    !plan.fileId ||
    !plan.upload.url ||
    (plan.complete !== undefined && plan.complete.method !== 'POST')
  ) {
    throw new FileClientError('The file upload plan is invalid.', {
      code: 'UPLOAD_PLAN_INVALID',
      status: 0,
      operation: 'upload',
    });
  }
}

function isStoredFile(value: unknown): value is StoredFile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.status === 'pending' ||
      value.status === 'ready' ||
      value.status === 'failed') &&
    typeof value.name === 'string' &&
    (value.size === null || typeof value.size === 'number') &&
    (value.contentType === null || typeof value.contentType === 'string') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
