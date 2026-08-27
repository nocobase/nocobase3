import { Download, X } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import type {
  FilePreviewDialogProps,
  FileRecord,
} from '@nocobase/app-plugin-files/client/types';
import { Button } from '@/components/ui/button';
import { FileThumbnail } from './file-thumbnail';

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

function isText(file: FileRecord): boolean {
  return (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    extension(file.filename) === '.json'
  );
}

function isActive(file: FileRecord): boolean {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    (mimeType !== undefined &&
      ([
        'text/html',
        'application/xhtml+xml',
        'image/svg+xml',
        'application/xml',
        'text/xml',
      ].includes(mimeType) ||
        mimeType.endsWith('+xml'))) ||
    ['.html', '.htm', '.svg', '.xml', '.xhtml'].includes(
      extension(file.filename),
    )
  );
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
}

export function FilePreviewDialog({
  client,
  file,
  open,
  onOpenChange,
  download: allowDownload = true,
  labels,
}: FilePreviewDialogProps): ReactElement | null {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !file) return;
    let active = true;
    setUrl(null);
    setText(null);
    setError(null);
    const access = file.public
      ? Promise.resolve({ url: file.contentUrl })
      : client.createAccessUrl(file.id);
    void access
      .then((result) => {
        if (!active) return;
        setUrl(result.url);
        if (!isText(file) || isActive(file)) return;
        return fetch(result.url, { credentials: 'include' })
          .then((response) => {
            if (!response.ok)
              throw new Error(`Preview request failed (${response.status}).`);
            return response.text();
          })
          .then((value) => {
            if (active) setText(value);
          });
      })
      .catch((previewError: unknown) => {
        if (active)
          setError(
            previewError instanceof Error
              ? previewError.message
              : 'Unable to load the preview.',
          );
      });
    return () => {
      active = false;
    };
  }, [client, file, open]);

  if (!open || !file) return null;
  const previewLabel = labels?.preview ?? 'Preview';
  const downloadLabel = labels?.download ?? 'Download';
  const kind = isActive(file)
    ? 'unsupported'
    : file.mimeType.startsWith('image/')
      ? 'image'
      : file.mimeType === 'application/pdf'
        ? 'pdf'
        : file.mimeType.startsWith('audio/')
          ? 'audio'
          : file.mimeType.startsWith('video/')
            ? 'video'
            : isText(file)
              ? 'text'
              : 'unsupported';
  const downloadFile = async (): Promise<void> => {
    triggerDownload(
      file.public
        ? file.contentUrl
        : (await client.createAccessUrl(file.id)).url,
      file.filename,
    );
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={`${previewLabel}: ${file.filename}`}
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
      onClick={() => onOpenChange(false)}
    >
      <div
        className='flex max-h-full w-full max-w-4xl flex-col gap-3 overflow-auto rounded-md bg-background p-4'
        onClick={(event) => event.stopPropagation()}
      >
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <h2 className='truncate text-lg font-semibold'>{file.filename}</h2>
            <p className='text-sm text-muted-foreground'>
              {file.public ? 'Public' : 'Private'} · {file.mimeType}
            </p>
          </div>
          <div className='flex gap-1'>
            {allowDownload ? (
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`${downloadLabel}: ${file.filename}`}
                title={downloadLabel}
                onClick={() => void downloadFile()}
              >
                <Download aria-hidden='true' />
              </Button>
            ) : null}
            <Button
              type='button'
              size='icon'
              variant='ghost'
              aria-label='Close'
              title='Close'
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden='true' />
            </Button>
          </div>
        </div>
        {error ? <div role='alert'>{error}</div> : null}
        {!error && !url ? <div role='status'>Loading preview...</div> : null}
        {!error && url && kind === 'image' ? (
          <img
            src={url}
            alt={file.filename}
            className='max-h-[70vh] max-w-full object-contain'
          />
        ) : null}
        {!error && url && kind === 'pdf' ? (
          <iframe title={file.filename} src={url} className='h-[70vh] w-full' />
        ) : null}
        {!error && url && kind === 'audio' ? (
          <audio controls src={url} className='w-full' />
        ) : null}
        {!error && url && kind === 'video' ? (
          <video controls src={url} className='max-h-[70vh] max-w-full' />
        ) : null}
        {!error && kind === 'text' ? (
          <pre className='max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm'>
            {text ?? 'Loading preview...'}
          </pre>
        ) : null}
        {!error && kind === 'unsupported' ? (
          <div className='flex flex-col items-center gap-3 py-8'>
            <div className='h-24 w-24'>
              <FileThumbnail file={file} />
            </div>
            <p>Preview is unavailable for this file type.</p>
            {allowDownload ? (
              <Button type='button' onClick={() => void downloadFile()}>
                {downloadLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
