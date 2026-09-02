import { Dialog } from '@base-ui/react/dialog';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { FILE_PLUGIN_NS } from '../../shared/namespace.js';
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
  const { t } = useTranslation(FILE_PLUGIN_NS);
  const [index, setIndex] = useState(initialIndex);
  const file = files[index];
  if (!file) throw new Error('A preview file is required.');
  const publicLabel = t('common.visibility.public', {
    defaultValue: 'Public',
  });
  const privateLabel = t('common.visibility.private', {
    defaultValue: 'Private',
  });
  const previousFileLabel = t('common.actions.previousFile', {
    defaultValue: 'Previous file',
  });
  const nextFileLabel = t('common.actions.nextFile', {
    defaultValue: 'Next file',
  });
  const closeLabel = t('common.actions.close', { defaultValue: 'Close' });
  const urlNotAllowed = t('errors.urlNotAllowed', {
    defaultValue: 'File URL is not allowed.',
  });
  const downloadFailed = t('errors.downloadFailed', {
    defaultValue: 'File download failed.',
  });

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
                {file.public ? publicLabel : privateLabel} · {file.mimeType}
              </p>
            </div>
            <div className='flex gap-1'>
              {files.length > 1 ? (
                <>
                  <button
                    type='button'
                    aria-label={previousFileLabel}
                    title={previousFileLabel}
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
                    aria-label={nextFileLabel}
                    title={nextFileLabel}
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
                  label={
                    labels?.download ??
                    t('common.actions.download', { defaultValue: 'Download' })
                  }
                  urlNotAllowed={urlNotAllowed}
                  downloadFailed={downloadFailed}
                  onError={onError}
                />
              ) : null}
              <Dialog.Close
                render={
                  <button
                    type='button'
                    aria-label={closeLabel}
                    title={closeLabel}
                  />
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
                    void downloadFile(client, file, urlNotAllowed).catch(
                      (error: unknown) =>
                        reportDownloadError(onError, error, downloadFailed),
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
  urlNotAllowed,
  downloadFailed,
  onError,
}: {
  client: FilePreviewDialogProps['client'];
  file: FileRecord;
  label: string;
  urlNotAllowed: string;
  downloadFailed: string;
  onError?: (error: Error) => void;
}): ReactElement {
  return (
    <button
      type='button'
      aria-label={`${label}: ${file.filename}`}
      title={label}
      onClick={() =>
        void downloadFile(client, file, urlNotAllowed).catch((error: unknown) =>
          reportDownloadError(onError, error, downloadFailed),
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
  urlNotAllowed: string,
): Promise<void> {
  const raw = file.public
    ? publicDownloadUrl(file.contentUrl)
    : (await client.createAccessUrl(file.id)).url;
  const url = raw ? resolveSafeFileUrl(raw) : undefined;
  if (!url) throw new Error(urlNotAllowed);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.rel = 'noopener';
  link.click();
}

function reportDownloadError(
  onError: ((error: Error) => void) | undefined,
  error: unknown,
  downloadFailed: string,
): void {
  onError?.(error instanceof Error ? error : new Error(downloadFailed));
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
  const { t } = useTranslation(FILE_PLUGIN_NS);
  const initialUrl = file.public
    ? resolveSafeFileUrl(file.contentUrl)
    : undefined;
  const [accessUrl, setAccessUrl] = useState<string | undefined>(
    () => initialUrl,
  );
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string | undefined>(() =>
    file.public && !initialUrl
      ? t('errors.urlNotAllowed', {
          defaultValue: 'File URL is not allowed.',
        })
      : undefined,
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
        else
          setError(
            t('errors.urlNotAllowed', {
              defaultValue: 'File URL is not allowed.',
            }),
          );
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : t('errors.createAccessUrlFailed', {
                  defaultValue: 'Unable to create a file access URL.',
                }),
          );
      });
    return () => {
      active = false;
    };
  }, [client, file, t]);

  useEffect(() => {
    if (!accessUrl || !['text', 'markdown'].includes(kind)) return undefined;
    const controller = new AbortController();
    void fetch(accessUrl, {
      credentials: fileUrlCredentials(accessUrl),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            t('errors.previewRequestFailed', {
              defaultValue: `Preview request failed (${response.status}).`,
              status: response.status,
            }),
          );
        return response.text();
      })
      .then((value) => setText(value))
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(
            cause instanceof Error
              ? cause.message
              : t('errors.loadPreviewFailed', {
                  defaultValue: 'Unable to load the file preview.',
                }),
          );
        }
      });
    return () => controller.abort();
  }, [accessUrl, file, kind, t]);

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
