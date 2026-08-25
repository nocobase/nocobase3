import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  completeFileUploadPlan,
  executeFileUploadPlan,
  FileClientError,
} from '@nocobase/app-plugin-files/client';

import { normalizeFileBasePath } from '../../client/extensions/nocobase-file-upload/base-path';
import { appFileClient } from '../../client/extensions/nocobase-file-upload/app-client';
import { FilePreviewField } from '../../client/extensions/nocobase-file-upload/file-preview-field';
import { FileUploadField } from '../../client/extensions/nocobase-file-upload/file-upload-field';
import {
  fetchFileContent,
  getDownloadUrl,
  getPreviewFileUrl,
  triggerFileDownload,
} from '../../client/extensions/nocobase-file-upload/file-url';
import { useFileUpload } from '../../client/extensions/nocobase-file-upload/use-file-upload';
import {
  matchesFileRules,
  validateFile,
} from '../../client/extensions/nocobase-file-upload/validation';
import type {
  CreateScopedFileResponse,
  FileUploadPlan,
  FileUploadMessages,
  StoredFile,
} from '../../client/extensions/nocobase-file-upload/types';

vi.mock('@nocobase/app-plugin-files/client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@nocobase/app-plugin-files/client')
  >()),
  completeFileUploadPlan: vi.fn(),
  executeFileUploadPlan: vi.fn(),
}));

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
};

afterEach(() => {
  delete (window as Window & { NOCOBASE_PORTAL_BASE?: unknown })
    .NOCOBASE_PORTAL_BASE;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(completeFileUploadPlan).mockReset();
  vi.mocked(executeFileUploadPlan).mockReset();
});

describe('V3 file upload Registry', () => {
  it('uses the current App base path without a host client package', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', request);
    Object.defineProperty(window, 'NOCOBASE_PORTAL_BASE', {
      configurable: true,
      value: '/embedded/app/',
    });

    await expect(appFileClient.request('files')).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(
      '/embedded/app/api/files',
      expect.objectContaining({ credentials: 'include' }),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'file route rejected the request',
            code: 'FILE_ROUTE_INVALID',
          }),
          {
            status: 409,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );
    await expect(appFileClient.request('files')).rejects.toMatchObject({
      message: 'file route rejected the request',
      status: 409,
      payload: {
        error: 'file route rejected the request',
        code: 'FILE_ROUTE_INVALID',
      },
    });
  });

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

  it('enforces maxBytes and accept before creating an upload', async () => {
    const request = vi.spyOn(globalThis, 'fetch');
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
      matchesFileRules(testFile('archive.tar.gz', 'application/gzip'), [
        '.tar.gz',
      ]),
    ).toBe(true);
    expect(
      matchesFileRules(testFile('archive.gz', 'application/gzip'), ['.tar.gz']),
    ).toBe(false);
    expect(
      validateFile(testFile('bad.txt', 'text/plain'), {
        accept: '.pdf',
        messages,
      }),
    ).toMatchObject({ valid: false, code: 'type' });
  });

  it('commits a successful upload to the controlled value', async () => {
    const ready = readyFile('ready-upload', 'report.txt', 'text/plain');
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(uploadResponse('ready-upload'))),
    );
    vi.mocked(executeFileUploadPlan).mockResolvedValue(ready);
    const onChange = vi.fn();
    const onUploadComplete = vi.fn();
    const file = testFile('report.txt', 'text/plain');
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange,
        messages,
        onUploadComplete,
      }),
    );

    await act(async () => result.current.addFiles([file]));

    expect(executeFileUploadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'ready-upload' }),
      file,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onChange).toHaveBeenCalledWith([ready]);
    expect(onUploadComplete).toHaveBeenCalledWith(ready);
    expect(result.current.items).toEqual([]);
  });

  it('does not abort plan creation and passes an aborted signal to plan execution', async () => {
    let resolvePlan: ((response: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvePlan = resolve;
        }),
    );
    vi.stubGlobal('fetch', request);
    vi.mocked(executeFileUploadPlan).mockImplementation(
      async (_plan, _file, options) => {
        expect(options?.signal?.aborted).toBe(true);
        throw new Error('Upload was cancelled.');
      },
    );
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange: vi.fn(),
        messages,
      }),
    );

    const upload = result.current.addFiles([
      testFile('cancel.txt', 'text/plain'),
    ]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith(
      '/api/orders/order-1/files',
      expect.not.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const key = result.current.items[0]?.key;
    if (!key) throw new Error('Expected a queued upload item.');
    act(() => result.current.cancelItem(key));
    resolvePlan?.(jsonResponse(uploadResponse('cancelled-upload')));
    await act(async () => upload);

    expect(executeFileUploadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'cancelled-upload' }),
      expect.any(File),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('starts a new upload after a stable complete failure was cancelled', async () => {
    const ready = readyFile('retry-upload', 'retry.txt', 'text/plain');
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse(uploadResponse('retry-upload')),
      );
    vi.stubGlobal('fetch', request);
    vi.mocked(executeFileUploadPlan)
      .mockRejectedValueOnce(
        new FileClientError('The upload type is not allowed.', {
          code: 'UPLOAD_TYPE_NOT_ALLOWED',
          status: 400,
          operation: 'complete',
        }),
      )
      .mockResolvedValueOnce(ready);
    const onChange = vi.fn();
    const onUploadError = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [],
        onChange,
        messages,
        onUploadError,
      }),
    );

    await act(async () =>
      result.current.addFiles([testFile('retry.txt', 'text/plain')]),
    );
    expect(result.current.items).toEqual([
      expect.objectContaining({ status: 'error' }),
    ]);
    expect(onUploadError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The upload type is not allowed.' }),
      expect.any(File),
    );

    const key = result.current.items[0]?.key;
    if (!key) throw new Error('Expected a retryable upload item.');
    await act(async () => result.current.retryItem(key));

    expect(request).toHaveBeenCalledTimes(2);
    expect(executeFileUploadPlan).toHaveBeenCalledTimes(2);
    expect(completeFileUploadPlan).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([ready]);
    expect(result.current.items).toEqual([]);
  });

  it('retries field replacement completion with the original plan', async () => {
    const original = readyFile('old-avatar', 'old.txt', 'text/plain');
    const ready = readyFile('new-avatar', 'new.txt', 'text/plain');
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(uploadResponse('new-avatar')));
    vi.stubGlobal('fetch', request);
    vi.mocked(executeFileUploadPlan).mockRejectedValueOnce(
      new FileClientError('File complete failed with status 503.', {
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
        operation: 'complete',
      }),
    );
    vi.mocked(completeFileUploadPlan).mockResolvedValueOnce(ready);
    const onChange = vi.fn();
    const file = testFile('new.txt', 'text/plain');
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'employees/employee-1/avatar',
        value: [original],
        onChange,
        messages,
      }),
    );

    await act(async () => result.current.replaceFile(original.id, file));
    expect(result.current.items).toEqual([
      expect.objectContaining({ key: original.id, status: 'done' }),
      expect.objectContaining({
        status: 'error',
        replaceFileId: original.id,
      }),
    ]);

    const retryKey = result.current.items.find(
      (item) => item.status === 'error',
    )?.key;
    if (!retryKey) throw new Error('Expected a retryable replacement.');
    await act(async () => result.current.retryItem(retryKey));

    expect(request).toHaveBeenCalledTimes(1);
    expect(executeFileUploadPlan).toHaveBeenCalledTimes(1);
    expect(completeFileUploadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'new-avatar' }),
    );
    expect(onChange).toHaveBeenCalledWith([ready]);
  });

  it('retries relation addition completion with the original plan', async () => {
    const existing = readyFile('existing-file', 'existing.txt', 'text/plain');
    const ready = readyFile('added-file', 'added.txt', 'text/plain');
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(uploadResponse('added-file')));
    vi.stubGlobal('fetch', request);
    vi.mocked(executeFileUploadPlan).mockRejectedValueOnce(
      new FileClientError('File complete transport failed.', {
        code: 'UPLOAD_FAILED',
        status: 0,
        operation: 'complete',
      }),
    );
    vi.mocked(completeFileUploadPlan).mockResolvedValueOnce(ready);
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useFileUpload({
        basePath: 'orders/order-1/files',
        value: [existing],
        onChange,
        multiple: true,
        messages,
      }),
    );

    await act(async () =>
      result.current.addFiles([testFile('added.txt', 'text/plain')]),
    );
    const retryKey = result.current.items.find(
      (item) => item.status === 'error',
    )?.key;
    if (!retryKey) throw new Error('Expected a retryable relation upload.');
    await act(async () => result.current.retryItem(retryKey));

    expect(request).toHaveBeenCalledTimes(1);
    expect(executeFileUploadPlan).toHaveBeenCalledTimes(1);
    expect(completeFileUploadPlan).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'added-file' }),
    );
    expect(onChange).toHaveBeenCalledWith([existing, ready]);
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

  it('does not render Cancel while an upload is completing', async () => {
    const ready = readyFile('completing-upload', 'report.txt', 'text/plain');
    let resolveUpload: ((value: StoredFile) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(uploadResponse('completing-upload'))),
    );
    vi.mocked(executeFileUploadPlan).mockImplementation(
      (_plan, file, options) =>
        new Promise<StoredFile>((resolve) => {
          options?.onProgress?.({
            loaded: file.size,
            total: file.size,
            percentage: 100,
          });
          resolveUpload = resolve;
        }),
    );
    const onChange = vi.fn();
    render(
      <FileUploadField
        basePath='orders/order-1/files'
        value={[]}
        onChange={onChange}
        messages={messages}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [testFile('report.txt', 'text/plain')] },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Completing')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Cancel')).toBeNull();
    resolveUpload?.(ready);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([ready]));
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
    await fetchFileContent('orders/order-1/files', file);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/orders/order-1/files/file%2F1/content'),
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
    fetchSpy.mockClear();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await triggerFileDownload('orders/order-1/files', file);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/order-1/files/file%2F1/content'),
      expect.objectContaining({ method: 'HEAD', credentials: 'same-origin' }),
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

function testFile(name: string, contentType: string, size = 8): File {
  return new File([new Uint8Array(size)], name, { type: contentType });
}

function uploadResponse(fileId: string): CreateScopedFileResponse {
  const plan: FileUploadPlan = {
    fileId,
    expiresAt: '2026-08-25T01:00:00.000Z',
    upload: { method: 'PUT', url: `/api/files/${fileId}/upload` },
    complete: { method: 'POST', url: `/api/files/${fileId}/complete` },
    cancel: { method: 'DELETE', url: `/api/files/${fileId}/upload` },
  };
  return {
    file: {
      id: fileId,
      status: 'pending',
      name: `${fileId}.txt`,
      size: null,
      contentType: null,
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
    plan,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}
