import { Download, Eye, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import type {
  FileListProps,
  FileRecord,
} from '@nocobase/app-plugin-file/client/types';
import { Button } from '@/components/ui/button';
import { publicDownloadUrl, resolveSafeFileUrl } from '../lib/file-url';
import { FilePreviewDialog } from './file-preview-dialog';
import { FileThumbnail } from './file-thumbnail';

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
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
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewLabel = labels?.preview ?? 'Preview';
  const downloadLabel = labels?.download ?? 'Download';
  const removeLabel = labels?.remove ?? 'Remove';

  if (!files.length)
    return (
      <div role='status'>{emptyState ?? labels?.empty ?? 'No files.'}</div>
    );

  const downloadFile = (file: FileRecord): void => {
    if (onDownload) {
      onDownload(file);
      return;
    }
    void (async () => {
      const raw = file.public
        ? publicDownloadUrl(file.contentUrl)
        : (await client.createAccessUrl(file.id)).url;
      const url = raw ? resolveSafeFileUrl(raw) : undefined;
      if (url) triggerDownload(url, file.filename);
    })();
  };

  return (
    <>
      <ul data-slot='file-list' className='grid gap-3 sm:grid-cols-2'>
        {files.map((file, index) => (
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
                {file.mimeType} · {file.public ? 'Public' : 'Private'}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`${previewLabel}: ${file.filename}`}
                title={previewLabel}
                onClick={() => {
                  onPreview?.(file);
                  setPreviewIndex(index);
                  setPreviewOpen(true);
                }}
              >
                <Eye aria-hidden='true' />
              </Button>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`${downloadLabel}: ${file.filename}`}
                title={downloadLabel}
                onClick={() => downloadFile(file)}
              >
                <Download aria-hidden='true' />
              </Button>
              {onRemove ? (
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={`${removeLabel}: ${file.filename}`}
                  title={removeLabel}
                  onClick={() => void onRemove(file)}
                >
                  <Trash2 aria-hidden='true' />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <FilePreviewDialog
        client={client}
        files={files}
        initialIndex={previewIndex}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        labels={labels}
      />
    </>
  );
}
