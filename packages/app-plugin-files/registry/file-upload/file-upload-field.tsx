import {
  AlertCircle,
  Check,
  CircleX,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ComponentProps } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

import { FilePreviewDialog } from './file-preview-dialog';
import { defaultFilePreviewMessages } from './file-preview-messages';
import { FileThumbnail } from './file-thumbnail';
import { getFileName } from './file-url';
import { useFileUpload } from './use-file-upload';
import { getAcceptAttribute } from './validation';
import type {
  FilePreviewMessages,
  FileUploadItem,
  FileUploadMessages,
  FileUploadProgress,
  StoredFile,
} from './types';

export type FileUploadFieldProps = Omit<ComponentProps<'div'>, 'onChange'> & {
  basePath: string;
  value: StoredFile[];
  onChange: (value: StoredFile[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  accept?: string | readonly string[];
  messages?: Partial<FileUploadMessages>;
  previewMessages?: Partial<FilePreviewMessages>;
  onUploadStart?: (file: File) => void;
  onUploadProgress?: (progress: FileUploadProgress, file: File) => void;
  onUploadComplete?: (file: StoredFile) => void | Promise<void>;
  onUploadError?: (error: Error, file: File) => void;
};

const defaultMessages: FileUploadMessages = {
  chooseFiles: 'Choose files',
  chooseFile: 'Choose file',
  replace: 'Replace',
  dragActive: 'Drop files here',
  dragInactive: 'Drag files here, or choose from your device.',
  queued: 'Queued',
  uploading: 'Uploading',
  completing: 'Completing',
  uploaded: 'Uploaded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  retry: 'Retry',
  remove: 'Remove',
  cancel: 'Cancel',
  maxFilesReached: 'The file limit has been reached.',
  uploadDisabled: 'File upload is disabled.',
  noFiles: 'No files',
  fileSizeExceeded: (maxBytes) =>
    `File size exceeds ${formatFileSize(maxBytes)}.`,
  fileTypeRejected: 'File type is not allowed.',
};

export function FileUploadField({
  basePath,
  value,
  onChange,
  disabled,
  readOnly,
  multiple = false,
  maxFiles,
  maxBytes,
  accept,
  className,
  messages: messageOverrides,
  previewMessages: previewMessageOverrides,
  onUploadStart,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
  ...rootProps
}: FileUploadFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const messages = useMemo(
    () => ({ ...defaultMessages, ...messageOverrides }),
    [messageOverrides],
  );
  const previewMessages = useMemo(
    () => ({
      ...defaultFilePreviewMessages,
      noFiles: messages.noFiles,
      ...previewMessageOverrides,
    }),
    [messages.noFiles, previewMessageOverrides],
  );
  const {
    items,
    addFiles,
    replaceFile,
    removeItem,
    cancelItem,
    retryItem,
    operationError,
    canUpload,
    reachedLimit,
    uploadActive,
  } = useFileUpload({
    basePath,
    value,
    onChange,
    disabled,
    readOnly,
    multiple,
    maxFiles,
    maxBytes,
    accept,
    messages,
    onUploadStart,
    onUploadProgress,
    onUploadComplete,
    onUploadError,
  });
  const uploadDisabled = !canUpload || (multiple ? reachedLimit : uploadActive);
  const selectable = !readOnly && !uploadDisabled;
  const previewableFiles = useMemo(
    () =>
      items
        .filter((item) => item.status === 'done' && item.record)
        .map((item) => item.record!),
    [items],
  );

  const handleDrop = (event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (!uploadDisabled) void addFiles(event.dataTransfer.files);
  };

  return (
    <div
      data-slot='file-upload-field'
      className={cn('space-y-3', className)}
      aria-busy={uploadActive || undefined}
      {...rootProps}
    >
      {operationError ? (
        <div
          className='rounded-lg border border-destructive/40 p-3 text-sm text-destructive'
          role='alert'
        >
          {operationError.message}
        </div>
      ) : null}

      <div
        className={cn(
          'flex flex-wrap items-start gap-3',
          readOnly && !items.length && 'hidden',
        )}
      >
        {items.map((item) => {
          const itemPreviewIndex = item.record
            ? previewableFiles.findIndex((file) => file.id === item.record?.id)
            : -1;
          const canPreview = item.status === 'done' && itemPreviewIndex >= 0;
          const filename = item.record
            ? getFileName(item.record)
            : item.displayName;
          return (
            <div key={item.key} className='w-[104px]'>
              <div
                className={cn(
                  'group relative flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-lg border bg-card p-1 transition-colors',
                  item.status === 'error' && 'border-destructive',
                  canPreview && 'hover:border-primary',
                )}
              >
                {isActiveItem(item) ? (
                  <div className='flex size-full flex-col items-center justify-center gap-2 rounded-md bg-muted/40 px-2'>
                    <Loader2 className='size-6 animate-spin text-muted-foreground' />
                    <div className='h-1.5 w-full overflow-hidden rounded bg-muted'>
                      <div
                        className='h-full bg-primary transition-[width]'
                        style={{
                          width: `${Math.round(item.progress?.percentage ?? 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <FileThumbnail
                    basePath={basePath}
                    file={item.record}
                    rawFile={item.rawFile}
                    alt={item.record?.name || item.displayName}
                  />
                )}

                {canPreview ? (
                  <button
                    type='button'
                    className='absolute inset-0 z-10 cursor-zoom-in rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
                    aria-label={`${previewMessages.preview}: ${filename}`}
                    onClick={() => {
                      setPreviewIndex(itemPreviewIndex);
                      setPreviewOpen(true);
                    }}
                  />
                ) : null}

                {item.rawFile ? (
                  <div className='pointer-events-none absolute bottom-2 right-2 z-20'>
                    <UploadStatusIcon item={item} messages={messages} />
                  </div>
                ) : null}

                {!readOnly ? (
                  <div className='pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'>
                    {item.status === 'done' && item.record ? (
                      <ReplaceButton
                        accept={accept}
                        disabled={disabled}
                        label={messages.replace}
                        onFile={(file) =>
                          void replaceFile(item.record!.id, file)
                        }
                      />
                    ) : null}
                    {item.status === 'error' && item.rawFile ? (
                      <IconButton
                        icon={RotateCcw}
                        label={messages.retry}
                        disabled={disabled}
                        onClick={() => void retryItem(item.key)}
                      />
                    ) : null}
                    {isActiveItem(item) ? (
                      <IconButton
                        icon={X}
                        label={messages.cancel}
                        disabled={disabled}
                        onClick={() => cancelItem(item.key)}
                      />
                    ) : (
                      <IconButton
                        icon={Trash2}
                        label={messages.remove}
                        disabled={disabled}
                        onClick={() => void removeItem(item.key)}
                      />
                    )}
                  </div>
                ) : null}
              </div>
              <div
                className={cn(
                  'mt-1 w-[104px] truncate text-center text-xs text-muted-foreground',
                  item.status === 'error' && 'text-destructive',
                )}
                title={
                  item.status === 'error'
                    ? item.error?.message || messages.failed
                    : item.displayName
                }
              >
                {item.status === 'error'
                  ? item.error?.message || messages.failed
                  : item.displayName}
              </div>
            </div>
          );
        })}

        {selectable ? (
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'relative flex h-[104px] w-[104px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-card p-2 text-center transition-colors hover:bg-muted/40',
              isDragging && 'border-primary bg-primary/5',
            )}
          >
            <input
              type='file'
              multiple={multiple}
              accept={getAcceptAttribute(accept)}
              aria-label={multiple ? messages.chooseFiles : messages.chooseFile}
              className='absolute inset-0 z-10 size-full cursor-pointer opacity-0'
              onChange={(event) => {
                if (event.currentTarget.files?.length) {
                  void addFiles(event.currentTarget.files);
                }
                event.currentTarget.value = '';
              }}
            />
            <div className='pointer-events-none flex flex-col items-center justify-center'>
              <Plus className='mb-1 size-5 text-muted-foreground' />
              <span className='px-1 text-xs font-medium'>
                {multiple ? messages.chooseFiles : messages.chooseFile}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <p className='text-xs text-muted-foreground'>
          {multiple && reachedLimit
            ? messages.maxFilesReached
            : disabled
              ? messages.uploadDisabled
              : isDragging
                ? messages.dragActive
                : getAcceptAttribute(accept) || messages.dragInactive}
        </p>
      ) : null}
      {readOnly && !items.length ? (
        <p className='text-sm text-muted-foreground'>{messages.noFiles}</p>
      ) : null}

      <div className='sr-only' aria-live='polite'>
        {items
          .map(
            (item) => `${item.displayName}: ${getStatusLabel(item, messages)}`,
          )
          .join('. ')}
      </div>

      <FilePreviewDialog
        basePath={basePath}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        files={previewableFiles}
        initialIndex={previewIndex}
        messages={previewMessages}
      />
    </div>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isActiveItem(item: FileUploadItem): boolean {
  return (
    item.status === 'queued' ||
    item.status === 'uploading' ||
    item.status === 'completing'
  );
}

function getStatusLabel(
  item: FileUploadItem,
  messages: FileUploadMessages,
): string {
  if (item.status === 'queued') return messages.queued;
  if (item.status === 'uploading') return messages.uploading;
  if (item.status === 'completing') return messages.completing;
  if (item.status === 'done') return messages.uploaded;
  if (item.status === 'cancelled') return messages.cancelled;
  return messages.failed;
}

function UploadStatusIcon({
  item,
  messages,
}: {
  item: FileUploadItem;
  messages: FileUploadMessages;
}) {
  const label = getStatusLabel(item, messages);
  const pending = isActiveItem(item);
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-full border shadow-sm',
        item.status === 'done' && 'border-green-600/20 bg-green-600 text-white',
        item.status === 'error' &&
          'border-destructive/20 bg-destructive text-destructive-foreground',
        item.status === 'cancelled' &&
          'border-muted-foreground/20 bg-muted text-muted-foreground',
        pending && 'border-primary/20 bg-primary text-primary-foreground',
      )}
    >
      {item.status === 'done' ? (
        <Check className='size-3.5' />
      ) : item.status === 'error' ? (
        <AlertCircle className='size-3.5' />
      ) : item.status === 'cancelled' ? (
        <CircleX className='size-3.5' />
      ) : (
        <Loader2 className='size-3.5 animate-spin' />
      )}
    </span>
  );
}

function ReplaceButton({
  accept,
  disabled,
  label,
  onFile,
}: {
  accept?: string | readonly string[];
  disabled?: boolean;
  label: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <IconButton
        icon={RefreshCw}
        label={label}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type='file'
        accept={getAcceptAttribute(accept)}
        className='hidden'
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
    </>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className='size-6 border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background hover:text-foreground'
    >
      <Icon />
    </Button>
  );
}
