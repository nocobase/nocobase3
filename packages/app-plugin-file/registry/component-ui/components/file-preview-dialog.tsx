import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type {
  FilePreviewDialogProps,
  FileRecord,
  FilesClient,
  FileUiLabels,
} from '@nocobase/app-plugin-file/client/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  fileUrlCredentials,
  publicDownloadUrl,
  resolveSafeFileUrl,
} from '../lib/file-url';
import { FileThumbnail } from './file-thumbnail';

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}
function isActive(file: FileRecord): boolean {
  const mime = file.mimeType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    Boolean(
      mime &&
      ([
        'text/html',
        'application/xhtml+xml',
        'image/svg+xml',
        'application/xml',
        'text/xml',
      ].includes(mime) ||
        mime.endsWith('+xml')),
    ) ||
    ['.html', '.htm', '.svg', '.xml', '.xhtml'].includes(
      extension(file.filename),
    )
  );
}
function isText(file: FileRecord): boolean {
  return (
    !isActive(file) &&
    (file.mimeType.startsWith('text/') ||
      file.mimeType === 'application/json' ||
      extension(file.filename) === '.json')
  );
}

export function FilePreviewDialog({
  client,
  files,
  initialIndex = 0,
  open,
  onOpenChange,
  download: allowDownload = true,
  labels,
}: FilePreviewDialogProps): ReactElement | null {
  if (!open || !files.length) return null;
  const normalizedIndex = Math.max(0, Math.min(initialIndex, files.length - 1));
  return (
    <OpenFilePreviewDialog
      key={`${normalizedIndex}:${files.map((file) => file.id).join(':')}`}
      client={client}
      files={files}
      initialIndex={normalizedIndex}
      onOpenChange={onOpenChange}
      download={allowDownload}
      labels={labels}
    />
  );
}

interface OpenFilePreviewDialogProps {
  readonly client: FilesClient;
  readonly files: readonly FileRecord[];
  readonly initialIndex: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly download: boolean;
  readonly labels?: FileUiLabels;
}

function OpenFilePreviewDialog({
  client,
  files,
  initialIndex,
  onOpenChange,
  download: allowDownload,
  labels,
}: OpenFilePreviewDialogProps): ReactElement {
  const [index, setIndex] = useState(initialIndex);
  const file = files[index];
  if (!file) throw new Error('A preview file is required.');
  const downloadLabel = labels?.download ?? 'Download';
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className='flex max-h-[calc(100vh-2rem)] max-w-4xl flex-col overflow-auto'
        showCloseButton
      >
        <div className='flex items-center justify-between gap-3 pr-10'>
          <div className='min-w-0'>
            <DialogTitle className='truncate'>{file.filename}</DialogTitle>
            <p className='text-sm text-muted-foreground'>
              {file.public ? 'Public' : 'Private'} · {file.mimeType}
            </p>
          </div>
          <div className='flex gap-1'>
            {files.length > 1 ? (
              <>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label='Previous file'
                  onClick={() =>
                    setIndex(
                      (value) => (value - 1 + files.length) % files.length,
                    )
                  }
                >
                  <ChevronLeft aria-hidden='true' />
                </Button>
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label='Next file'
                  onClick={() =>
                    setIndex((value) => (value + 1) % files.length)
                  }
                >
                  <ChevronRight aria-hidden='true' />
                </Button>
              </>
            ) : null}
            {allowDownload ? (
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`${downloadLabel}: ${file.filename}`}
                onClick={() => void downloadFile(client, file)}
              >
                <Download aria-hidden='true' />
              </Button>
            ) : null}
          </div>
        </div>
        <PreviewBody
          key={`${file.id}:${file.updatedAt}:${file.contentUrl}:${file.public}`}
          client={client}
          file={file}
        />
      </DialogContent>
    </Dialog>
  );
}

async function downloadFile(
  client: FilePreviewDialogProps['client'],
  file: FileRecord,
): Promise<void> {
  const raw = file.public
    ? publicDownloadUrl(file.contentUrl)
    : (await client.createAccessUrl(file.id)).url;
  const url = raw ? resolveSafeFileUrl(raw) : undefined;
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}

function PreviewBody({
  client,
  file,
}: {
  client: FilePreviewDialogProps['client'];
  file: FileRecord;
}): ReactElement {
  const initialUrl = file.public
    ? resolveSafeFileUrl(file.contentUrl)
    : undefined;
  const [url, setUrl] = useState<string | undefined>(() => initialUrl);
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string | undefined>(() =>
    file.public && !initialUrl ? 'File URL is not allowed.' : undefined,
  );
  const kind = useMemo(
    () =>
      isActive(file)
        ? 'unsupported'
        : file.mimeType.startsWith('image/')
          ? 'image'
          : file.mimeType === 'application/pdf' ||
              extension(file.filename) === '.pdf'
            ? 'pdf'
            : file.mimeType.startsWith('audio/')
              ? 'audio'
              : file.mimeType.startsWith('video/')
                ? 'video'
                : isText(file)
                  ? 'text'
                  : 'unsupported',
    [file],
  );
  useEffect(() => {
    if (file.public) return undefined;
    let active = true;
    void client
      .createAccessUrl(file.id)
      .then((access) => {
        if (!active) return;
        const accessUrl = resolveSafeFileUrl(access.url);
        if (accessUrl) setUrl(accessUrl);
        else setError('File URL is not allowed.');
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to create a file access URL.',
          );
      });
    return () => {
      active = false;
    };
  }, [client, file]);
  useEffect(() => {
    if (!url || !isText(file)) return undefined;
    const controller = new AbortController();
    void fetch(url, {
      credentials: fileUrlCredentials(url),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Preview request failed (${response.status}).`);
        return response.text();
      })
      .then(setText)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError'))
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load the file preview.',
          );
      });
    return () => controller.abort();
  }, [file, url]);
  if (error) return <div role='alert'>{error}</div>;
  if (!url && kind !== 'unsupported')
    return <div role='status'>Loading preview...</div>;
  if (url && kind === 'image')
    return (
      <img
        src={url}
        alt={file.filename}
        className='max-h-[70vh] max-w-full object-contain'
      />
    );
  if (url && kind === 'pdf')
    return (
      <iframe title={file.filename} src={url} className='h-[70vh] w-full' />
    );
  if (url && kind === 'audio')
    return <audio controls src={url} className='w-full' />;
  if (url && kind === 'video')
    return <video controls src={url} className='max-h-[70vh] max-w-full' />;
  if (kind === 'text')
    return (
      <pre className='max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm'>
        {text ?? 'Loading preview...'}
      </pre>
    );
  return (
    <div className='flex flex-col items-center gap-3 py-8'>
      <div className='h-24 w-24'>
        <FileThumbnail file={file} />
      </div>
      <p>Preview is unavailable for this file type.</p>
    </div>
  );
}
