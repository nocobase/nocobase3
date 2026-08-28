import { Dialog } from '@base-ui/react/dialog';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import {
  fileUrlCredentials,
  publicDownloadUrl,
  resolveSafeFileUrl,
} from '../lib/file-url.js';
import type {
  FilePreviewDialogProps,
  FileRecord,
  FilesClient,
  FileUiLabels,
} from '../types.js';
import { FileThumbnail } from './file-thumbnail.js';

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

function isActiveContent(file: FileRecord): boolean {
  const mimeType = file.mimeType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    Boolean(
      mimeType &&
      ([
        'text/html',
        'application/xhtml+xml',
        'image/svg+xml',
        'application/xml',
        'text/xml',
      ].includes(mimeType) ||
        mimeType.endsWith('+xml')),
    ) ||
    ['.html', '.htm', '.svg', '.xml', '.xhtml'].includes(
      extension(file.filename),
    )
  );
}

function isText(file: FileRecord): boolean {
  return (
    !isActiveContent(file) &&
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
  download = true,
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
      download={download}
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
  download,
  labels,
}: OpenFilePreviewDialogProps): ReactElement {
  const [index, setIndex] = useState(initialIndex);
  const file = files[index];
  if (!file) throw new Error('A preview file is required.');

  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className='fixed inset-0 z-50 bg-black/50' />
        <Dialog.Popup className='fixed inset-4 z-50 m-auto flex max-h-[calc(100vh-2rem)] w-[min(64rem,calc(100vw-2rem))] flex-col gap-3 overflow-auto rounded-md bg-background p-4 outline-none'>
          <div className='flex items-center justify-between gap-3'>
            <div className='min-w-0'>
              <Dialog.Title className='truncate text-lg font-semibold'>
                {file.filename}
              </Dialog.Title>
              <p className='text-sm text-muted-foreground'>
                {file.public ? 'Public' : 'Private'} · {file.mimeType}
              </p>
            </div>
            <div className='flex gap-1'>
              {files.length > 1 ? (
                <>
                  <button
                    type='button'
                    aria-label='Previous file'
                    title='Previous file'
                    onClick={() =>
                      setIndex(
                        (value) => (value - 1 + files.length) % files.length,
                      )
                    }
                  >
                    <ChevronLeft aria-hidden='true' />
                  </button>
                  <button
                    type='button'
                    aria-label='Next file'
                    title='Next file'
                    onClick={() =>
                      setIndex((value) => (value + 1) % files.length)
                    }
                  >
                    <ChevronRight aria-hidden='true' />
                  </button>
                </>
              ) : null}
              {download ? (
                <DownloadButton
                  client={client}
                  file={file}
                  label={labels?.download ?? 'Download'}
                />
              ) : null}
              <Dialog.Close
                render={
                  <button type='button' aria-label='Close' title='Close' />
                }
              >
                <X aria-hidden='true' />
              </Dialog.Close>
            </div>
          </div>
          <PreviewBody
            key={`${file.id}:${file.updatedAt}:${file.contentUrl}:${file.public}`}
            client={client}
            file={file}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DownloadButton({
  client,
  file,
  label,
}: {
  client: FilePreviewDialogProps['client'];
  file: FileRecord;
  label: string;
}): ReactElement {
  return (
    <button
      type='button'
      aria-label={`${label}: ${file.filename}`}
      title={label}
      onClick={() => void downloadFile(client, file)}
    >
      <Download aria-hidden='true' />
    </button>
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
  const [accessUrl, setAccessUrl] = useState<string | undefined>(
    () => initialUrl,
  );
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string | undefined>(() =>
    file.public && !initialUrl ? 'File URL is not allowed.' : undefined,
  );
  const kind = useMemo(() => {
    if (isActiveContent(file)) return 'unsupported';
    if (file.mimeType.startsWith('image/')) return 'image';
    if (
      file.mimeType === 'application/pdf' ||
      extension(file.filename) === '.pdf'
    )
      return 'pdf';
    if (file.mimeType.startsWith('audio/')) return 'audio';
    if (file.mimeType.startsWith('video/')) return 'video';
    if (isText(file)) return 'text';
    return 'unsupported';
  }, [file]);

  useEffect(() => {
    if (file.public) return undefined;
    let active = true;
    void client
      .createAccessUrl(file.id)
      .then((access) => {
        if (!active) return;
        const url = resolveSafeFileUrl(access.url);
        if (url) setAccessUrl(url);
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
    if (!accessUrl || !isText(file)) return undefined;
    const controller = new AbortController();
    void fetch(accessUrl, {
      credentials: fileUrlCredentials(accessUrl),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Preview request failed (${response.status}).`);
        return response.text();
      })
      .then((value) => setText(value))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load the file preview.',
          );
        }
      });
    return () => controller.abort();
  }, [accessUrl, file]);

  if (error) return <div role='alert'>{error}</div>;
  if (!accessUrl && kind !== 'unsupported')
    return <div role='status'>Loading preview...</div>;
  if (kind === 'image' && accessUrl)
    return (
      <img
        src={accessUrl}
        alt={file.filename}
        className='max-h-[70vh] max-w-full object-contain'
      />
    );
  if (kind === 'pdf' && accessUrl)
    return (
      <iframe
        title={file.filename}
        src={accessUrl}
        className='h-[70vh] w-full'
      />
    );
  if (kind === 'audio' && accessUrl)
    return <audio controls src={accessUrl} className='w-full' />;
  if (kind === 'video' && accessUrl)
    return (
      <video controls src={accessUrl} className='max-h-[70vh] max-w-full' />
    );
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
