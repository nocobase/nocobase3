import { Download, Eye, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import type { FileListProps } from '../types.js';
import { FilePreviewDialog } from './file-preview-dialog.js';
import { FileThumbnail } from './file-thumbnail.js';

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
}

function publicDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin !== window.location.origin) return url;
    parsed.searchParams.set('download', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? 'No extension' : filename.slice(dot + 1).toUpperCase();
}

export function FileList({
  client,
  files,
  onPreview,
  onDownload,
  onRemove,
  labels,
  emptyState,
}: FileListProps): ReactElement {
  const [previewFile, setPreviewFile] = useState<
    FileListProps['files'][number] | null
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const choose = labels?.preview ?? 'Preview';
  const download = labels?.download ?? 'Download';
  const remove = labels?.remove ?? 'Remove';

  const downloadFile = (file: FileListProps['files'][number]): void => {
    if (onDownload) {
      onDownload(file);
      return;
    }
    void (async () => {
      const url = file.public
        ? publicDownloadUrl(file.contentUrl)
        : (await client.createAccessUrl(file.id)).url;
      triggerDownload(url, file.filename);
    })();
  };

  if (!files.length) {
    return (
      <div role='status'>{emptyState ?? labels?.empty ?? 'No files.'}</div>
    );
  }

  return (
    <>
      <ul data-slot='file-list' className='grid gap-3 sm:grid-cols-2'>
        {files.map((file) => (
          <li
            key={file.id}
            className='flex min-w-0 items-center gap-3 rounded-md border p-3'
          >
            <div className='h-12 w-12 shrink-0 overflow-hidden rounded-md'>
              <FileThumbnail file={file} />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='truncate font-medium' title={file.filename}>
                {file.filename}
              </div>
              <div className='text-sm text-muted-foreground'>
                {formatSize(file.size)} · {file.mimeType} ·{' '}
                {extension(file.filename)} ·{' '}
                {file.public ? 'Public' : 'Private'}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              <button
                type='button'
                aria-label={`${choose}: ${file.filename}`}
                title={choose}
                onClick={() => {
                  onPreview?.(file);
                  setPreviewFile(file);
                  setPreviewOpen(true);
                }}
              >
                <Eye aria-hidden='true' />
              </button>
              <button
                type='button'
                aria-label={`${download}: ${file.filename}`}
                title={download}
                onClick={() => downloadFile(file)}
              >
                <Download aria-hidden='true' />
              </button>
              {onRemove ? (
                <button
                  type='button'
                  aria-label={`${remove}: ${file.filename}`}
                  title={remove}
                  onClick={() => void onRemove(file)}
                >
                  <Trash2 aria-hidden='true' />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {previewOpen ? (
        <FilePreviewDialog
          client={client}
          file={previewFile}
          open
          onOpenChange={setPreviewOpen}
          labels={labels}
        />
      ) : null}
    </>
  );
}
