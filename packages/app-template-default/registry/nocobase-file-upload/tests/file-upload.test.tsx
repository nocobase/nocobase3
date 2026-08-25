import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeFileBasePath } from '../base-path';
import { appFileClient } from '../app-client';
import { FilePreviewField } from '../file-preview-field';
import { FileUploadField } from '../file-upload-field';
import {
  fetchFileContent,
  getDownloadUrl,
  getPreviewFileUrl,
  triggerFileDownload,
} from '../file-url';
import { useFileUpload } from '../use-file-upload';
import { matchesFileRules, validateFile } from '../validation';
import type { FileUploadMessages, StoredFile } from '../types';

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

afterEach(() => {
  delete (window as Window & { NOCOBASE_PORTAL_BASE?: unknown })
    .NOCOBASE_PORTAL_BASE;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
