import { executeFileUploadPlan } from '@nocobase/app-plugin-files/client';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FieldValidationSlotContext } from '@/lib/field-validation';
import type {
  FieldValidationController,
  FieldValidationSlot,
} from '@/lib/field-validation';

import { normalizeFileBasePath } from '../base-path';
import { appFileClient } from '../app-client';
import { FilePreviewField } from '../file-preview-field';
import { FileUploadField } from '../file-upload-field';
import {
  getDownloadUrl,
  getPreviewFileUrl,
  triggerFileDownload,
} from '../file-url';
import { useFileUpload } from '../use-file-upload';
import { matchesFileRules, validateFile } from '../validation';
import type {
  CreateScopedFileResponse,
  FileUploadMessages,
  FileUploadProgress,
  StoredFile,
} from '../types';

vi.mock('@nocobase/app-plugin-files/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@nocobase/app-plugin-files/client')>();
  return { ...actual, executeFileUploadPlan: vi.fn() };
});

const executeMock = vi.mocked(executeFileUploadPlan);
const messages: FileUploadMessages = {
  chooseFiles: 'Choose files',
  chooseFile: 'Choose file',
  replace: 'Replace',
  dragActive: 'Drop files here',
  dragInactive: 'Drag files here',
  queued: 'Queued',
  uploading: 'Uploading',
  completing: 'Completing',
  uploaded: 'Uploaded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  retry: 'Retry',
  remove: 'Remove',
  cancel: 'Cancel',
  maxFilesReached: 'Limit reached',
  uploadDisabled: 'Disabled',
  noFiles: 'No files',
  fileSizeExceeded: (size) => `Too large: ${size}`,
  fileTypeRejected: 'Type rejected',
  uploadInProgress: 'Upload in progress',
  uploadFailedValidation: 'Upload failed validation',
};

beforeEach(() => {
  executeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('V3 file upload Registry', () => {
  it('loads ready StoredFile arrays without relation serialization', () => {
    const existing = readyFile('ready-1', 'report.pdf', 'application/pdf');
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [existing],
        onChange: vi.fn(),
        messages,
      }),
    );

    expect(result.current.items).toEqual([
      expect.objectContaining({
        key: 'ready-1',
        record: existing,
        status: 'done',
      }),
    ]);
  });

  it('keeps single-file mode as an array of zero or one StoredFile', () => {
    const first = readyFile('first', 'first.txt', 'text/plain');
    const second = readyFile('second', 'second.txt', 'text/plain');
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'profiles/user-1/avatar',
        value: [first, second],
        onChange: vi.fn(),
        messages,
      }),
    );
    expect(result.current.items.map((item) => item.record?.id)).toEqual([
      'first',
    ]);
  });

  it('creates a Scoped upload and propagates real progress to the field callback', async () => {
    const progress: FileUploadProgress = {
      loaded: 4,
      total: 8,
      percentage: 50,
    };
    const request = mockCreateRequests(['upload-1']);
    executeMock.mockImplementation(async (plan, file, options) => {
      options?.onProgress?.(progress);
      return readyFile(plan.fileId, file.name, file.type);
    });
    const onChange = vi.fn();
    const onUploadProgress = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange,
        multiple: true,
        messages,
        onUploadProgress,
      }),
    );
    const file = testFile('report.pdf', 'application/pdf', 8);

    await act(async () => result.current.addFiles([file]));

    expect(request).toHaveBeenCalledWith(
      'orders/order-1/files',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'report.pdf',
          size: 8,
          contentType: 'application/pdf',
        }),
      }),
    );
    expect(onUploadProgress).toHaveBeenCalledWith(progress, file);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'upload-1', status: 'ready' }),
    ]);
  });

  it('keeps the old single value visible until replace completes', async () => {
    const oldFile = readyFile('old-1', 'old.txt', 'text/plain');
    const completion = deferred<StoredFile>();
    const request = mockCreateRequests(['new-1']);
    executeMock.mockReturnValue(completion.promise);
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'profiles/user-1/avatar',
        value: [oldFile],
        onChange,
        messages,
      }),
    );

    let upload: Promise<void> = Promise.resolve();
    act(() => {
      upload = result.current.addFiles([testFile('new.txt', 'text/plain')]);
    });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('"replaceFileId":"old-1"'),
      }),
    );
    expect(
      result.current.items.some((item) => item.record?.id === 'old-1'),
    ).toBe(true);

    completion.resolve(readyFile('new-1', 'new.txt', 'text/plain'));
    await act(async () => upload);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'new-1' }),
    ]);
  });

  it('replaces one entry in multiple mode without changing array order', async () => {
    const first = readyFile('first', 'first.txt', 'text/plain');
    const second = readyFile('second', 'second.txt', 'text/plain');
    const request = mockCreateRequests(['replacement']);
    executeMock.mockResolvedValue(
      readyFile('replacement', 'replacement.txt', 'text/plain'),
    );
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [first, second],
        onChange,
        multiple: true,
        maxFiles: 2,
        messages,
      }),
    );

    await act(async () =>
      result.current.replaceFile(
        'second',
        testFile('replacement.txt', 'text/plain'),
      ),
    );

    expect(request.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('"replaceFileId":"second"'),
      }),
    );
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'first' }),
      expect.objectContaining({ id: 'replacement' }),
    ]);
  });

  it('cancels an active attempt through the plan executor signal', async () => {
    mockCreateRequests(['cancel-1']);
    executeMock.mockImplementation(
      (_plan, _file, options) =>
        new Promise<StoredFile>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange: vi.fn(),
        messages,
      }),
    );

    let upload: Promise<void> = Promise.resolve();
    act(() => {
      upload = result.current.addFiles([testFile('cancel.txt', 'text/plain')]);
    });
    await waitFor(() =>
      expect(
        result.current.items.some((item) => item.status === 'uploading'),
      ).toBe(true),
    );
    const item = result.current.items.find((entry) => entry.rawFile)!;
    act(() => result.current.cancelItem(item.key));
    await act(async () => upload);
    expect(
      result.current.items.find((entry) => entry.key === item.key)?.status,
    ).toBe('cancelled');
  });

  it('retries failures by requesting a fresh file ID', async () => {
    const request = mockCreateRequests(['failed-id', 'retry-id']);
    executeMock
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce(readyFile('retry-id', 'retry.txt', 'text/plain'));
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange,
        messages,
      }),
    );

    await act(async () =>
      result.current.addFiles([testFile('retry.txt', 'text/plain')]),
    );
    const failed = result.current.items.find(
      (item) => item.status === 'error',
    )!;
    await act(async () => result.current.retryItem(failed.key));

    expect(request).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls.map(([plan]) => plan.fileId)).toEqual([
      'failed-id',
      'retry-id',
    ]);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'retry-id' }),
    ]);
  });

  it('detaches ready files through DELETE basePath/:fileId', async () => {
    const existing = readyFile('ready/delete', 'report.txt', 'text/plain');
    const request = vi
      .spyOn(appFileClient, 'request')
      .mockResolvedValue({ success: true });
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [existing],
        onChange,
        messages,
      }),
    );

    await act(async () => result.current.removeItem(existing.id));

    expect(request).toHaveBeenCalledWith(
      'orders/order-1/files/ready%2Fdelete',
      { method: 'DELETE' },
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('enforces maxBytes and accept before creating an upload', async () => {
    const request = vi.spyOn(appFileClient, 'request');
    const onUploadError = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange: vi.fn(),
        maxBytes: 4,
        accept: ['.pdf'],
        messages,
        onUploadError,
      }),
    );

    await act(async () =>
      result.current.addFiles([testFile('large.txt', 'text/plain', 8)]),
    );

    expect(request).not.toHaveBeenCalled();
    expect(onUploadError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Too large: 4' }),
      expect.any(File),
    );
    expect(result.current.items.some((item) => item.status === 'error')).toBe(
      true,
    );
    expect(
      matchesFileRules(testFile('ok.pdf', 'application/pdf'), ['.pdf']),
    ).toBe(true);
    expect(
      validateFile(testFile('bad.txt', 'text/plain'), {
        accept: '.pdf',
        messages,
      }),
    ).toMatchObject({ valid: false, code: 'type' });
  });

  it('renders maxFiles, disabled, and readOnly UX states', () => {
    const existing = readyFile('ready-1', 'report.txt', 'text/plain');
    const { rerender } = render(
      <FileUploadField
        basePath='orders/order-1/files'
        value={[existing]}
        onChange={vi.fn()}
        multiple
        maxFiles={1}
      />,
    );
    expect(screen.getByText('The file limit has been reached.')).toBeTruthy();
    expect(screen.queryByLabelText('Choose files')).toBeNull();

    rerender(
      <FileUploadField
        basePath='orders/order-1/files'
        value={[]}
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByText('File upload is disabled.')).toBeTruthy();
    expect(screen.queryByLabelText('Choose file')).toBeNull();

    rerender(
      <FileUploadField
        basePath='orders/order-1/files'
        value={[]}
        onChange={vi.fn()}
        readOnly
      />,
    );
    expect(screen.getByText('No files')).toBeTruthy();
  });

  it('supports drag selection and blocks form validation while uploading or failed', async () => {
    mockCreateRequests(['form-1']);
    const completion = deferred<StoredFile>();
    executeMock.mockReturnValue(completion.promise);
    let controller: FieldValidationController | undefined;
    const slot: FieldValidationSlot = {
      register(next) {
        controller = next;
        return () => {
          controller = undefined;
        };
      },
      validate: () => controller?.validate() ?? true,
    };
    const file = testFile('form.txt', 'text/plain');
    const { container } = render(
      <FieldValidationSlotContext.Provider value={slot}>
        <FileUploadField
          basePath='orders/order-1/files'
          value={[]}
          onChange={vi.fn()}
        />
      </FieldValidationSlotContext.Provider>,
    );
    const input = screen.getByLabelText('Choose file');
    const dropzone = input.parentElement!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(controller?.validate()).toBe(
        'Wait for all files to finish uploading.',
      ),
    );
    completion.reject(new Error('Upload failed'));
    await waitFor(() =>
      expect(controller?.validate()).toBe(
        'Retry or remove files that failed to upload.',
      ),
    );
    expect(
      container.querySelector('[data-slot="file-upload-field"]'),
    ).toBeTruthy();
  });

  it('builds preview GET and download HEAD paths through the current App client', async () => {
    const file = readyFile('file/1', 'image.png', 'image/png');
    const previewUrl = new URL(
      getPreviewFileUrl('orders/order-1/files', file),
      'http://localhost',
    );
    const downloadUrl = new URL(
      getDownloadUrl('orders/order-1/files', file),
      'http://localhost',
    );
    expect(previewUrl.pathname).toContain('/api/');
    expect(previewUrl.pathname).toContain(
      '/orders/order-1/files/file%2F1/content',
    );
    expect(previewUrl.searchParams.has('disposition')).toBe(false);
    expect(downloadUrl.searchParams.get('disposition')).toBe('attachment');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await triggerFileDownload('orders/order-1/files', file);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/order-1/files/file%2F1/content'),
      expect.objectContaining({ method: 'HEAD', credentials: 'include' }),
    );
    expect(click).toHaveBeenCalledOnce();
  });

  it('renders preview content only from basePath and StoredFile metadata', () => {
    const file = readyFile('image-1', 'image.png', 'image/png');
    render(
      <FilePreviewField
        basePath='orders/order-1/files'
        value={[file]}
        showFileName
      />,
    );
    expect(
      screen
        .getByRole('img', { name: 'Preview of image.png' })
        .getAttribute('src'),
    ).toContain('/orders/order-1/files/image-1/content');
    expect(screen.getByText('image.png')).toBeTruthy();
  });

  it.each([
    'https://evil.example/files',
    '//evil.example/files',
    '/absolute/files',
    'orders/files?token=secret',
    'orders/files#preview',
    'orders/../files',
    'orders/%2e%2e/files',
  ])('rejects invalid basePath %s', (basePath) => {
    expect(() => normalizeFileBasePath(basePath)).toThrow();
  });

  it('normalizes a valid relative basePath', () => {
    expect(normalizeFileBasePath(' orders/order-1/files/ ')).toBe(
      'orders/order-1/files',
    );
  });
});

function readyFile(
  id: string,
  name: string,
  contentType: string | null = null,
): StoredFile {
  return {
    id,
    status: 'ready',
    name,
    size: 8,
    contentType,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

function pendingUpload(id: string): CreateScopedFileResponse {
  return {
    file: {
      ...readyFile(id, `${id}.txt`, 'text/plain'),
      status: 'pending',
      size: null,
    },
    plan: {
      fileId: id,
      expiresAt: '2026-08-24T00:15:00.000Z',
      upload: { method: 'PUT', url: `/upload/${id}` },
      complete: { method: 'POST', url: `/complete/${id}` },
      cancel: { method: 'DELETE', url: `/cancel/${id}` },
    },
  };
}

function mockCreateRequests(ids: string[]) {
  let index = 0;
  return vi.spyOn(appFileClient, 'request').mockImplementation(async () => {
    const id = ids[index++];
    if (!id) throw new Error('Unexpected request');
    return pendingUpload(id);
  });
}

function testFile(name: string, contentType: string, size = 8): File {
  return new File([new Uint8Array(size)], name, { type: contentType });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
