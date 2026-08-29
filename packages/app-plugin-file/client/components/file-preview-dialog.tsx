import { Dialog } from '@base-ui/react/dialog';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import {
  fileUrlCredentials,
  publicDownloadUrl,
  resolveSafeFileUrl,
} from '../lib/file-url.js';
import {
  resolveFilePreviewKind,
  type FilePreviewKind,
} from '../lib/file-preview.js';
import type {
  FilePreviewDialogProps,
  FileRecord,
  FilesClient,
  FileUiLabels,
} from '../types.js';
import { FilePreviewContent } from './previewers/file-preview-content.js';

export function FilePreviewDialog({
  client,
  files,
  initialIndex = 0,
  open,
  onOpenChange,
  download = true,
  labels,
  onError,
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
      onError={onError}
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
  readonly onError?: (error: Error) => void;
}

function OpenFilePreviewDialog({
  client,
  files,
  initialIndex,
  onOpenChange,
  download,
  labels,
  onError,
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
                  onError={onError}
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
            onDownload={
              download
                ? () =>
                    void downloadFile(client, file).catch((error: unknown) =>
                      reportDownloadError(onError, error),
                    )
                : undefined
            }
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
  onError,
}: {
  client: FilePreviewDialogProps['client'];
  file: FileRecord;
  label: string;
  onError?: (error: Error) => void;
}): ReactElement {
  return (
    <button
      type='button'
      aria-label={`${label}: ${file.filename}`}
      title={label}
      onClick={() =>
        void downloadFile(client, file).catch((error: unknown) =>
          reportDownloadError(onError, error),
        )
      }
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
  if (!url) throw new Error('File URL is not allowed.');
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}

function reportDownloadError(
  onError: ((error: Error) => void) | undefined,
  error: unknown,
): void {
  onError?.(
    error instanceof Error ? error : new Error('File download failed.'),
  );
}

function PreviewBody({
  client,
  file,
  onDownload,
}: {
  client: FilePreviewDialogProps['client'];
  file: FileRecord;
  onDownload?: () => void;
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
  const kind: FilePreviewKind = useMemo(
    () => resolveFilePreviewKind(file),
    [file],
  );

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
    if (!accessUrl || !['text', 'markdown'].includes(kind)) return undefined;
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
  }, [accessUrl, file, kind]);

  return (
    <FilePreviewContent
      file={file}
      kind={kind}
      url={accessUrl}
      text={text}
      error={error}
      onDownload={onDownload}
    />
  );
}
