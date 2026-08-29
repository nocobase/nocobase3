import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FileList,
  FilePreviewDialog,
  FilePreviewField,
  FileThumbnail,
  FileUploadField,
} from '../../client/components/index.js';
import type { FileRecord, FilesClient } from '../../client/types.js';

function fileRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'file-1',
    filename: 'image.png',
    mimeType: 'image/png',
    size: 2048,
    public: true,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    contentUrl: '/api/files/file-1/content',
    ...overrides,
  };
}

function mockClient(overrides: Partial<FilesClient> = {}): FilesClient {
  return {
    list: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue(fileRecord()),
    get: vi.fn().mockResolvedValue(fileRecord()),
    createAccessUrl: vi.fn().mockResolvedValue({
      url: '/api/files/file-1/content?token=signed',
      expiresAt: '2026-08-27T00:15:00.000Z',
    }),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function UploadHarness({
  client,
  multiple,
  accept,
  maxSize,
  maxFiles,
  initialValue = [],
  onError,
  onStatusChange,
  removeOnDelete,
}: {
  client: FilesClient;
  multiple?: boolean;
  accept?: readonly string[];
  maxSize?: number;
  maxFiles?: number;
  initialValue?: readonly FileRecord[];
  onError?: (error: Error) => void;
  onStatusChange?: (status: 'idle' | 'uploading' | 'error') => void;
  removeOnDelete?: boolean;
}): ReactElement {
  const [value, setValue] = useState<readonly FileRecord[]>(initialValue);
  return (
    <>
      <FileUploadField
        client={client}
        value={value}
        onChange={setValue}
        multiple={multiple}
        accept={accept}
        maxSize={maxSize}
        maxFiles={maxFiles}
        onError={onError}
        onStatusChange={onStatusChange}
        removeOnDelete={removeOnDelete}
      />
      <output data-testid='value'>
        {value.map((file) => file.filename).join(',')}
      </output>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileUploadField', () => {
  it('uploads one file and updates the controlled value', async () => {
    const uploaded = fileRecord({
      filename: 'one.txt',
      mimeType: 'text/plain',
    });
    const client = mockClient({ upload: vi.fn().mockResolvedValue(uploaded) });
    render(<UploadHarness client={client} />);

    const input = screen.getByLabelText('Choose file');
    const file = new File(['one'], 'one.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('one.txt'),
    );
    expect(client.upload).toHaveBeenCalledWith(file, {
      public: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(
      screen.getByRole('button', { name: 'Remove: one.txt' }),
    ).toBeVisible();
  });

  it('uploads multiple files without losing controlled results', async () => {
    const client = mockClient({
      upload: vi.fn(async (file: File) =>
        fileRecord({ id: file.name, filename: file.name, mimeType: file.type }),
      ),
    });
    render(<UploadHarness client={client} multiple />);
    const files = [
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ];

    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: { files },
    });

    await waitFor(() => {
      expect(screen.getByTestId('value')).toHaveTextContent('a.txt,b.txt');
    });
    expect(client.upload).toHaveBeenCalledTimes(2);
  });

  it('does not carry a rejected controlled change into a later upload', async () => {
    const resolvers = new Map<string, (record: FileRecord) => void>();
    const upload = vi.fn<FilesClient['upload']>(
      (file) =>
        new Promise((resolve) => {
          resolvers.set(file.name, resolve);
        }),
    );
    const onChange = vi.fn();
    render(
      <FileUploadField
        client={mockClient({ upload })}
        value={[]}
        onChange={onChange}
        multiple
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: {
        files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')],
      },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    resolvers.get('a.txt')?.(fileRecord({ id: 'a', filename: 'a.txt' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ filename: 'a.txt' }),
      ]),
    );

    resolvers.get('b.txt')?.(fileRecord({ id: 'b', filename: 'b.txt' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ filename: 'b.txt' }),
      ]),
    );
  });

  it('rejects oversized and disallowed files before calling the client', () => {
    const client = mockClient();
    const onError = vi.fn();
    render(
      <UploadHarness
        client={client}
        multiple
        maxSize={3}
        accept={['image/*']}
        onError={onError}
      />,
    );
    const input = screen.getByLabelText('Choose files');

    fireEvent.change(input, {
      target: {
        files: [new File(['large'], 'large.png', { type: 'image/png' })],
      },
    });
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'note.txt', { type: 'text/plain' })] },
    });

    expect(client.upload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('exceeds') }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'File type is not allowed.' }),
    );
  });

  it('rejects files beyond maxFiles', () => {
    const client = mockClient();
    const onError = vi.fn();
    render(
      <UploadHarness
        client={client}
        multiple
        maxFiles={1}
        initialValue={[fileRecord()]}
        onError={onError}
      />,
    );

    fireEvent.change(screen.getByLabelText('Choose files'), {
      target: { files: [new File(['x'], 'extra.txt')] },
    });

    expect(client.upload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The maximum number of files has been reached.',
      }),
    );
  });

  it('shows an accessible retry action after an upload error', async () => {
    const upload = vi
      .fn<FilesClient['upload']>()
      .mockRejectedValueOnce(new Error('Network failed.'))
      .mockResolvedValueOnce(fileRecord({ filename: 'retry.txt' }));
    const client = mockClient({ upload });
    render(<UploadHarness client={client} onError={vi.fn()} />);
    const file = new File(['retry'], 'retry.txt', { type: 'text/plain' });

    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [file] },
    });
    const retry = await screen.findByRole('button', {
      name: 'Retry: retry.txt',
    });
    fireEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('retry.txt'),
    );
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('removes a controlled record through the client when configured', async () => {
    const client = mockClient();
    render(
      <UploadHarness
        client={client}
        initialValue={[fileRecord()]}
        removeOnDelete
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove: image.png' }));

    await waitFor(() =>
      expect(screen.getByTestId('value')).toBeEmptyDOMElement(),
    );
    expect(client.remove).toHaveBeenCalledWith('file-1');
  });

  it('reports removal failure and keeps the controlled record', async () => {
    const onError = vi.fn();
    const client = mockClient({
      remove: vi.fn().mockRejectedValue(new Error('Delete failed.')),
    });
    render(
      <UploadHarness
        client={client}
        initialValue={[fileRecord()]}
        removeOnDelete
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove: image.png' }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Delete failed.' }),
      ),
    );
    expect(screen.getByTestId('value')).toHaveTextContent('image.png');
    expect(screen.getByRole('img', { name: 'image.png' })).toBeVisible();
  });

  it('does not restore a completed record after the controlled value is cleared', async () => {
    const uploaded = fileRecord({ filename: 'replacement.png' });
    const client = mockClient({ upload: vi.fn().mockResolvedValue(uploaded) });
    const { rerender } = render(
      <FileUploadField client={client} value={[]} onChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [new File(['x'], 'replacement.png')] },
    });
    await waitFor(() => expect(client.upload).toHaveBeenCalledOnce());
    rerender(<FileUploadField client={client} value={[]} onChange={vi.fn()} />);
    expect(screen.queryByText('replacement.png')).not.toBeInTheDocument();
  });

  it('replaces a controlled single file without retaining the old record', async () => {
    const client = mockClient({
      upload: vi
        .fn()
        .mockResolvedValue(fileRecord({ id: 'new-file', filename: 'new.png' })),
    });
    render(
      <UploadHarness
        client={client}
        initialValue={[fileRecord({ filename: 'old.png' })]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: {
        files: [new File(['new'], 'new.png', { type: 'image/png' })],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('value')).toHaveTextContent('new.png'),
    );
    expect(screen.getByTestId('value')).not.toHaveTextContent('old.png');
    expect(screen.queryByText('old.png')).not.toBeInTheDocument();
  });

  it.each(['*', '*/*'])(
    'accepts any file for the %s wildcard',
    async (rule) => {
      const client = mockClient();
      render(<UploadHarness client={client} accept={[rule]} />);
      fireEvent.change(screen.getByLabelText('Choose file'), {
        target: { files: [new File(['x'], 'file.bin', { type: '' })] },
      });
      await waitFor(() => expect(client.upload).toHaveBeenCalledOnce());
    },
  );

  it('reports upload status and cancels without an error notification', async () => {
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    const upload = vi.fn<FilesClient['upload']>(
      (_file, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    render(
      <UploadHarness
        client={mockClient({ upload })}
        onError={onError}
        onStatusChange={onStatusChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [new File(['x'], 'cancel.txt')] },
    });
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith('uploading'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel: cancel.txt' }));
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith('idle'),
    );
    expect(onError).not.toHaveBeenCalled();
    expect(upload.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('aborts an unfinished upload when the field unmounts', async () => {
    const upload = vi.fn<FilesClient['upload']>(() => new Promise(() => {}));
    const onStatusChange = vi.fn();
    const { unmount } = render(
      <UploadHarness
        client={mockClient({ upload })}
        onStatusChange={onStatusChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [new File(['x'], 'pending.txt')] },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith('uploading'),
    );

    unmount();
    expect(upload.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(onStatusChange).toHaveBeenLastCalledWith('idle');
  });

  it('ignores a late upload result from a custom client after unmount', async () => {
    let resolveUpload: ((record: FileRecord) => void) | undefined;
    const upload = vi.fn<FilesClient['upload']>(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const onChange = vi.fn();
    const { unmount } = render(
      <FileUploadField
        client={mockClient({ upload })}
        value={[]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [new File(['x'], 'late.txt')] },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    unmount();
    resolveUpload?.(fileRecord({ filename: 'late.txt' }));
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FileList and FilePreviewDialog', () => {
  it.each([
    ['image/svg+xml; charset=utf-8', 'unsafe.png'],
    ['image/png', 'unsafe.svg'],
  ])(
    'does not render active image content for %s and %s',
    (mimeType, filename) => {
      render(<FileThumbnail file={fileRecord({ mimeType, filename })} />);
      expect(
        screen.queryByRole('img', { name: filename }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(filename)).toBeVisible();
    },
  );

  it('renders an empty state and invokes the optional remove callback', () => {
    const client = mockClient();
    const { rerender } = render(<FileList client={client} files={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No files.');

    const onRemove = vi.fn();
    rerender(
      <FileList client={client} files={[fileRecord()]} onRemove={onRemove} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove: image.png' }));
    expect(onRemove).toHaveBeenCalledWith(fileRecord());
  });

  it('uses the unsigned Public URL for preview', () => {
    const client = mockClient();
    render(<FileList client={client} files={[fileRecord()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview: image.png' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByRole('img', { name: 'image.png' }),
    ).toHaveAttribute('src', '/api/files/file-1/content');
    expect(client.createAccessUrl).not.toHaveBeenCalled();
  });

  it('requests a temporary URL immediately before Private preview', async () => {
    const privateFile = fileRecord({ public: false });
    const client = mockClient();
    render(<FileList client={client} files={[privateFile]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview: image.png' }));

    await waitFor(() =>
      expect(client.createAccessUrl).toHaveBeenCalledWith('file-1'),
    );
    expect(screen.getByRole('img', { name: 'image.png' })).toHaveAttribute(
      'src',
      '/api/files/file-1/content?token=signed',
    );
  });

  it('requests a fresh Private URL after the preview lifetime ends', async () => {
    const privateFile = fileRecord({ public: false });
    const client = mockClient();
    const { rerender } = render(
      <FilePreviewDialog
        client={client}
        files={[privateFile]}
        open
        onOpenChange={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(client.createAccessUrl).toHaveBeenCalledTimes(1),
    );

    rerender(
      <FilePreviewDialog
        client={client}
        files={[privateFile]}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    rerender(
      <FilePreviewDialog
        client={client}
        files={[privateFile]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(client.createAccessUrl).toHaveBeenCalledTimes(2),
    );
  });

  it('adds download=1 safely for same-origin Public downloads', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const client = mockClient();
    render(<FileList client={client} files={[fileRecord()]} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Download: image.png' }),
    );

    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement).href).toBe(
      'http://localhost:3000/api/files/file-1/content?download=1',
    );
  });

  it('does not append download flags to third-party absolute URLs', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const external = fileRecord({
      contentUrl: 'https://cdn.example.com/image.png?signature=one',
    });
    render(<FileList client={mockClient()} files={[external]} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Download: image.png' }),
    );

    expect((click.mock.instances[0] as HTMLAnchorElement).href).toBe(
      'https://cdn.example.com/image.png?signature=one',
    );
  });

  it('reports a Private download URL failure without an unhandled rejection', async () => {
    const onError = vi.fn();
    const client = mockClient({
      createAccessUrl: vi.fn().mockRejectedValue(new Error('Token failed.')),
    });
    render(
      <FileList
        client={client}
        files={[fileRecord({ public: false })]}
        onError={onError}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Download: image.png' }),
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Token failed.' }),
      ),
    );
  });

  it('falls back to download for unsupported and active content', () => {
    const client = mockClient();
    const html = fileRecord({
      filename: 'unsafe.html',
      mimeType: 'text/html; charset=utf-8',
      contentUrl: '/api/files/unsafe/content',
    });
    render(
      <FilePreviewDialog
        client={client}
        files={[html]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Preview is unavailable for this file type.'),
    ).toBeVisible();
    expect(screen.queryByTitle('unsafe.html')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'unsafe.html' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Download/ }),
    ).not.toHaveLength(0);
  });

  it('hides fallback download actions when download is disabled', () => {
    const html = fileRecord({
      filename: 'unsafe.html',
      mimeType: 'text/html',
    });
    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[html]}
        open
        download={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Preview is unavailable for this file type.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it('does not render SVG active content as an image', () => {
    const svg = fileRecord({
      filename: 'unsafe.svg',
      mimeType: 'image/svg+xml',
      contentUrl: '/api/files/unsafe-svg/content',
    });
    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[svg]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Preview is unavailable for this file type.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('img', { name: 'unsafe.svg' }),
    ).not.toBeInTheDocument();
  });

  it('renders text and JSON responses as inert text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('<script>window.executed = true</script>', {
          status: 200,
        }),
      ),
    );
    const json = fileRecord({
      filename: 'data.json',
      mimeType: 'application/json',
      contentUrl: '/api/files/data/content',
    });
    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[json]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('<script>window.executed = true</script>'),
    ).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders Markdown with GFM and safe external links', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            [
              '# Notes',
              '',
              '~~obsolete~~',
              '',
              '[Documentation](https://example.com/docs)',
              '',
              '<script>window.executed = true</script>',
            ].join('\n'),
            { status: 200 },
          ),
        ),
    );
    const markdown = fileRecord({
      filename: 'notes.md',
      mimeType: 'text/markdown',
      contentUrl: '/api/files/notes/content',
    });

    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[markdown]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeVisible();
    expect(screen.getByText('obsolete').closest('del')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'rel',
      'noreferrer',
    );
    expect(document.querySelector('script')).toBeNull();
  });

  it('previews a Public Office file through Office Online', () => {
    const office = fileRecord({
      filename: 'report.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentUrl: 'https://cdn.example.com/report.docx?version=1',
    });

    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[office]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    const iframe = screen.getByTitle('report.docx');
    const embedUrl = new URL(iframe.getAttribute('src') ?? '');
    expect(embedUrl.origin).toBe('https://view.officeapps.live.com');
    expect(embedUrl.pathname).toBe('/op/embed.aspx');
    expect(embedUrl.searchParams.get('src')).toBe(
      'https://cdn.example.com/report.docx?version=1',
    );
  });

  it('uses a fresh Private access URL for Office Online', async () => {
    const office = fileRecord({
      filename: 'budget.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      public: false,
    });
    let resolveAccess:
      | ((value: Awaited<ReturnType<FilesClient['createAccessUrl']>>) => void)
      | undefined;
    const createAccessUrl = vi.fn<FilesClient['createAccessUrl']>(
      () =>
        new Promise((resolve) => {
          resolveAccess = resolve;
        }),
    );
    const client = mockClient({ createAccessUrl });

    render(
      <FilePreviewDialog
        client={client}
        files={[office]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading preview...');
    resolveAccess?.({
      url: 'https://files.example.com/budget.xlsx?token=signed',
      expiresAt: '2026-08-27T00:15:00.000Z',
    });

    await waitFor(() =>
      expect(client.createAccessUrl).toHaveBeenCalledWith('file-1'),
    );
    const iframe = await screen.findByTitle('budget.xlsx');
    const embedUrl = new URL(iframe.getAttribute('src') ?? '');
    expect(embedUrl.searchParams.get('src')).toBe(
      'https://files.example.com/budget.xlsx?token=signed',
    );
  });

  it.each([
    '/api/files/report/content',
    'http://localhost:3000/report.docx',
    'blob:http://localhost:3000/temporary',
  ])('uses a download fallback for non-public Office URL %s', (contentUrl) => {
    const office = fileRecord({
      filename: 'report.docx',
      mimeType: 'application/msword',
      contentUrl,
    });

    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[office]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByTitle('report.docx')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        contentUrl.startsWith('blob:')
          ? 'File URL is not allowed.'
          : 'Office Online requires an internet-accessible absolute file URL.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download file' })).toBeVisible();
  });

  it('shows a download fallback when the Office Online iframe fails', async () => {
    const office = fileRecord({
      filename: 'slides.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      contentUrl: 'https://cdn.example.com/slides.pptx',
    });
    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[office]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByTitle('slides.pptx'));

    expect(
      await screen.findByText('Office Online could not load this file.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download file' })).toBeVisible();
  });

  it('omits credentials for cross-origin text preview requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('external text', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const text = fileRecord({
      filename: 'external.txt',
      mimeType: 'text/plain',
      contentUrl: 'https://cdn.example.com/external.txt',
    });
    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[text]}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('external text')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/external.txt',
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('rejects dangerous content URLs and navigates between files', () => {
    const first = fileRecord({ contentUrl: 'javascript:alert(1)' });
    const second = fileRecord({ id: 'file-2', filename: 'second.png' });
    render(
      <FilePreviewDialog
        client={mockClient()}
        files={[first, second]}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'File URL is not allowed.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(screen.getByRole('img', { name: 'second.png' })).toBeVisible();
  });

  it('closes on Escape and restores focus to the opener', async () => {
    const client = mockClient();
    render(<FileList client={client} files={[fileRecord()]} />);
    const opener = screen.getByRole('button', { name: 'Preview: image.png' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(opener).toHaveFocus();
  });

  it('keeps Tab focus inside the preview dialog', async () => {
    const user = userEvent.setup();
    render(<FileList client={mockClient()} files={[fileRecord()]} />);
    await user.click(
      screen.getByRole('button', { name: 'Preview: image.png' }),
    );
    const dialog = screen.getByRole('dialog');

    expect(
      document.querySelectorAll('[data-base-ui-focus-guard]').length,
    ).toBeGreaterThan(0);
    await user.tab();
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(
        dialog.contains(active) ||
          active.hasAttribute('data-base-ui-focus-guard') ||
          active === document.body,
      ).toBe(true);
    });
  });

  it('opens the compact preview field at the selected file', () => {
    const files = [
      fileRecord({ filename: 'first.png' }),
      fileRecord({ id: 'file-2', filename: 'second.png' }),
    ];
    render(<FilePreviewField client={mockClient()} files={files} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Preview: second.png' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('second.png');
  });

  it('optionally shows filenames in the compact preview field', () => {
    const files = [fileRecord({ filename: 'quarterly-report.png' })];
    const { rerender } = render(
      <FilePreviewField client={mockClient()} files={files} />,
    );
    expect(screen.queryByTitle('quarterly-report.png')).not.toBeInTheDocument();

    rerender(
      <FilePreviewField client={mockClient()} files={files} showFilenames />,
    );
    expect(screen.getByTitle('quarterly-report.png')).toHaveTextContent(
      'quarterly-report.png',
    );
  });
});
