import { useTranslation } from '@nocobase/i18n/client';
import { Download, Eye, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { FILE_PLUGIN_NS } from '../../shared/namespace.js';
import type { FileListProps } from '../types.js';
import { publicDownloadUrl, resolveSafeFileUrl } from '../lib/file-url.js';
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

function extension(filename: string, noExtension: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? noExtension : filename.slice(dot + 1).toUpperCase();
}

export function FileList({
  client,
  files,
  onPreview,
  onDownload,
  onRemove,
  onError,
  labels,
  emptyState,
}: FileListProps): ReactElement {
  const { t } = useTranslation(FILE_PLUGIN_NS);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const choose =
    labels?.preview ?? t('common.actions.preview', { defaultValue: 'Preview' });
  const download =
    labels?.download ??
    t('common.actions.download', { defaultValue: 'Download' });
  const remove =
    labels?.remove ?? t('common.actions.remove', { defaultValue: 'Remove' });
  const publicLabel = t('common.visibility.public', {
    defaultValue: 'Public',
  });
  const privateLabel = t('common.visibility.private', {
    defaultValue: 'Private',
  });
  const noExtension = t('list.noExtension', {
    defaultValue: 'No extension',
  });

  const downloadFile = (file: FileListProps['files'][number]): void => {
    if (onDownload) {
      onDownload(file);
      return;
    }
    void (async () => {
      const raw = file.public
        ? publicDownloadUrl(file.contentUrl)
        : (await client.createAccessUrl(file.id)).url;
      const url = raw ? resolveSafeFileUrl(raw) : undefined;
      if (!url) {
        throw new Error(
          t('errors.urlNotAllowed', {
            defaultValue: 'File URL is not allowed.',
          }),
        );
      }
      triggerDownload(url, file.filename);
    })().catch((error: unknown) => {
      onError?.(
        error instanceof Error
          ? error
          : new Error(
              t('errors.downloadFailed', {
                defaultValue: 'File download failed.',
              }),
            ),
      );
    });
  };

  if (!files.length) {
    return (
      <div role='status'>
        {emptyState ??
          labels?.empty ??
          t('common.states.noFiles', { defaultValue: 'No files.' })}
      </div>
    );
  }

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
                {formatSize(file.size)} · {file.mimeType} ·{' '}
                {extension(file.filename, noExtension)} ·{' '}
                {file.public ? publicLabel : privateLabel}
              </div>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              <button
                type='button'
                aria-label={`${choose}: ${file.filename}`}
                title={choose}
                onClick={() => {
                  onPreview?.(file);
                  setPreviewIndex(index);
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
          files={files}
          initialIndex={previewIndex}
          open
          onOpenChange={setPreviewOpen}
          labels={labels}
          onError={onError}
        />
      ) : null}
    </>
  );
}
