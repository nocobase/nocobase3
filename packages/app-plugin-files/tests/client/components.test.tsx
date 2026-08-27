import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FileList,
  FilePreviewDialog,
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
  removeOnDelete,
}: {
  client: FilesClient;
  multiple?: boolean;
  accept?: readonly string[];
  maxSize?: number;
  maxFiles?: number;
  initialValue?: readonly FileRecord[];
  onError?: (error: Error) => void;
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
    expect(client.upload).toHaveBeenCalledWith(file, { public: undefined });
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
});

describe('FileList and FilePreviewDialog', () => {
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
        file={privateFile}
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
        file={privateFile}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );
    rerender(
      <FilePreviewDialog
        client={client}
        file={privateFile}
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
        file={html}
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

  it('does not render SVG active content as an image', () => {
    const svg = fileRecord({
      filename: 'unsafe.svg',
      mimeType: 'image/svg+xml',
      contentUrl: '/api/files/unsafe-svg/content',
    });
    render(
      <FilePreviewDialog
        client={mockClient()}
        file={svg}
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
        file={json}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('<script>window.executed = true</script>'),
    ).toBeVisible();
    expect(document.querySelector('script')).toBeNull();
  });
});
