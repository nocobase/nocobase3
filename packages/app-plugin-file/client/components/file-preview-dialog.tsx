import { Download, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import type { FilePreviewDialogProps, FileRecord } from '../types.js';
import { FileThumbnail } from './file-thumbnail.js';

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

function isActiveContent(file: FilePreviewDialogProps['file']): boolean {
  if (!file) return false;
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

function isText(file: FilePreviewDialogProps['file']): boolean {
  if (!file || isActiveContent(file)) return false;
  return (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    extension(file.filename) === '.json'
  );
}

function safePublicDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin !== window.location.origin) return url;
    parsed.searchParams.set('download', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
}

type OpenFilePreviewDialogProps = Omit<
  FilePreviewDialogProps,
  'file' | 'open'
> & {
  readonly file: FileRecord;
};

export function FilePreviewDialog(
  props: FilePreviewDialogProps,
): ReactElement | null {
  if (!props.open || !props.file) return null;
  return <OpenFilePreviewDialog {...props} file={props.file} />;
}

function OpenFilePreviewDialog({
  client,
  file,
  onOpenChange,
  download = true,
  labels,
}: OpenFilePreviewDialogProps): ReactElement {
  const [accessState, setAccessState] = useState<{
    key: string;
    url?: string;
    error?: string;
  } | null>(null);
  const [textState, setTextState] = useState<{
    key: string;
    text?: string;
    error?: string;
  } | null>(null);
  const preview = labels?.preview ?? 'Preview';
  const downloadLabel = labels?.download ?? 'Download';
  const closeLabel = 'Close';

  useEffect(() => {
    let active = true;
    if (file.public)
      return () => {
        active = false;
      };
    void client
      .createAccessUrl(file.id)
      .then((access) => {
        if (active) setAccessState({ key: file.id, url: access.url });
      })
      .catch((accessError: unknown) => {
        if (active) {
          setAccessState({
            key: file.id,
            error:
              accessError instanceof Error
                ? accessError.message
                : 'Unable to create a file access URL.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [client, file]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const currentUrl = file?.public
      ? file.contentUrl
      : accessState?.key === file?.id
        ? accessState?.url
        : undefined;
    if (!currentUrl || !file || !isText(file)) {
      return () => {
        active = false;
        controller.abort();
      };
    }
    void fetch(currentUrl, {
      credentials:
        new URL(currentUrl, window.location.href).origin ===
        window.location.origin
          ? 'include'
          : 'omit',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Preview request failed (${response.status}).`);
        return response.text();
      })
      .then((value) => {
        if (active) setTextState({ key: currentUrl, text: value });
      })
      .catch((fetchError: unknown) => {
        if (
          active &&
          !(
            fetchError instanceof DOMException &&
            fetchError.name === 'AbortError'
          )
        ) {
          setTextState({
            key: currentUrl,
            error:
              fetchError instanceof Error
                ? fetchError.message
                : 'Unable to load the file preview.',
          });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [accessState, file]);

  const kind = useMemo(() => {
    if (!file) return 'unsupported';
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

  const url = file.public
    ? file.contentUrl
    : accessState?.key === file.id
      ? (accessState.url ?? null)
      : null;
  const error =
    (accessState?.key === file.id ? accessState.error : undefined) ??
    (url && textState?.key === url ? textState.error : undefined) ??
    null;
  const text = url && textState?.key === url ? (textState.text ?? null) : null;
  const loadingText =
    kind === 'text' && Boolean(url) && text === null && !error;

  const handleDownload = async (): Promise<void> => {
    const downloadUrl = file.public
      ? safePublicDownloadUrl(file.contentUrl)
      : (await client.createAccessUrl(file.id)).url;
    triggerDownload(downloadUrl, file.filename);
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={`${preview}: ${file.filename}`}
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
            {download ? (
              <button
                type='button'
                aria-label={`${downloadLabel}: ${file.filename}`}
                title={downloadLabel}
                onClick={() => void handleDownload()}
              >
                <Download aria-hidden='true' />
              </button>
            ) : null}
            <button
              type='button'
              aria-label={closeLabel}
              title={closeLabel}
              onClick={() => onOpenChange(false)}
            >
              <X aria-hidden='true' />
            </button>
          </div>
        </div>
        {error ? <div role='alert'>{error}</div> : null}
        {!error && !url && kind !== 'unsupported' ? (
          <div role='status'>Loading preview...</div>
        ) : null}
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
            {loadingText ? 'Loading preview...' : (text ?? '')}
          </pre>
        ) : null}
        {!error && kind === 'unsupported' ? (
          <div className='flex flex-col items-center gap-3 py-8'>
            <div className='h-24 w-24'>
              <FileThumbnail file={file} />
            </div>
            <p>Preview is unavailable for this file type.</p>
            {download ? (
              <button type='button' onClick={() => void handleDownload()}>
                {downloadLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
