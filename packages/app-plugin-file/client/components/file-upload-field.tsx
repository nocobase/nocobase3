import { LoaderCircle, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from 'react';

import type { FileUploadFieldProps } from '../types.js';
import { FileThumbnail } from './file-thumbnail.js';

type UploadItem = {
  key: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  record?: FileUploadFieldProps['value'][number];
  error?: Error;
};

function accepted(file: File, accept: readonly string[]): boolean {
  if (!accept.length) return true;
  const name = file.name.toLowerCase();
  return accept.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    return normalized.endsWith('/*')
      ? file.type.toLowerCase().startsWith(normalized.slice(0, -1))
      : normalized.startsWith('.')
        ? name.endsWith(normalized)
        : file.type.toLowerCase() === normalized;
  });
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function makeKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`;
}

export function FileUploadField({
  client,
  value,
  onChange,
  onError,
  multiple = false,
  accept = [],
  maxSize,
  maxFiles,
  public: isPublic,
  disabled = false,
  removeOnDelete = false,
  labels,
}: FileUploadFieldProps): ReactElement {
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlledValueRef = useRef(value);
  const [dragging, setDragging] = useState(false);
  const chooseLabel =
    labels?.choose ?? (multiple ? 'Choose files' : 'Choose file');
  const removeLabel = labels?.remove ?? 'Remove';
  const retryLabel = labels?.retry ?? 'Retry';
  const effectiveMax = multiple ? (maxFiles ?? Infinity) : 1;

  useEffect(() => {
    controlledValueRef.current = value;
  }, [value]);

  const report = (message: string): void => {
    onError?.(new Error(message));
  };

  const uploadItem = async (item: UploadItem): Promise<void> => {
    setItems((current) =>
      current.map((candidate) =>
        candidate.key === item.key
          ? { ...candidate, status: 'uploading' }
          : candidate,
      ),
    );
    try {
      const record = await client.upload(item.file, { public: isPublic });
      setItems((current) =>
        current.map((candidate) =>
          candidate.key === item.key
            ? { ...candidate, status: 'done', record }
            : candidate,
        ),
      );
      const next = multiple
        ? [...controlledValueRef.current, record]
        : [record];
      controlledValueRef.current = next;
      onChange(next);
    } catch (error) {
      const uploadError =
        error instanceof Error ? error : new Error('File upload failed.');
      setItems((current) =>
        current.map((candidate) =>
          candidate.key === item.key
            ? { ...candidate, status: 'error', error: uploadError }
            : candidate,
        ),
      );
      onError?.(uploadError);
    }
  };

  const addFiles = (files: readonly File[]): void => {
    if (disabled) return;
    const available =
      effectiveMax - value.length - items.filter((item) => !item.record).length;
    if (files.length > available) {
      report('The maximum number of files has been reached.');
      return;
    }
    const acceptedFiles: File[] = [];
    for (const file of files) {
      if (maxSize !== undefined && file.size > maxSize) {
        report(`File size exceeds ${formatSize(maxSize)}.`);
        continue;
      }
      if (!accepted(file, accept)) {
        report('File type is not allowed.');
        continue;
      }
      acceptedFiles.push(file);
    }
    const selected = multiple ? acceptedFiles : acceptedFiles.slice(0, 1);
    const nextItems = selected.map((file): UploadItem => ({
      key: makeKey(file),
      file,
      status: 'pending',
    }));
    setItems((current) => [...current, ...nextItems]);
    nextItems.forEach((item) => void uploadItem(item));
  };

  const removeItem = async (item: UploadItem): Promise<void> => {
    if (item.record && removeOnDelete) {
      try {
        await client.remove(item.record.id);
      } catch (error) {
        onError?.(
          error instanceof Error ? error : new Error('File removal failed.'),
        );
        return;
      }
    }
    setItems((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
    if (item.record) {
      const next = controlledValueRef.current.filter(
        (record) => record.id !== item.record?.id,
      );
      controlledValueRef.current = next;
      onChange(next);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    addFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const displayItems: UploadItem[] = [
    ...value.map((record): UploadItem => ({
      key: `record:${record.id}`,
      file: new File([], record.filename, { type: record.mimeType }),
      status: 'done',
      record,
    })),
    ...items.filter(
      (item) =>
        !item.record || !value.some((record) => record.id === item.record?.id),
    ),
  ];

  return (
    <div
      data-slot='file-upload-field'
      className='space-y-3'
      aria-busy={items.some((item) => item.status === 'uploading')}
    >
      <div
        className={`flex min-h-24 flex-wrap gap-3 rounded-md border border-dashed p-3 ${dragging ? 'border-primary bg-primary/5' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {displayItems.map((item) => (
          <div key={item.key} className='w-36 rounded-md border p-2'>
            <div className='flex h-20 items-center justify-center overflow-hidden rounded-sm bg-muted/30'>
              {item.status === 'uploading' ? (
                <LoaderCircle className='animate-spin' aria-label='Uploading' />
              ) : item.record ? (
                <FileThumbnail file={item.record} />
              ) : (
                <UploadCloud aria-hidden='true' />
              )}
            </div>
            <div className='mt-2 truncate text-sm' title={item.file.name}>
              {item.file.name}
            </div>
            <div className='text-xs text-muted-foreground'>
              {item.status === 'pending'
                ? 'Pending'
                : item.status === 'uploading'
                  ? 'Uploading'
                  : item.status === 'error'
                    ? (item.error?.message ?? 'Failed')
                    : `${formatSize(item.record?.size ?? item.file.size)} · Done`}
            </div>
            <div className='mt-2 flex gap-1'>
              {item.status === 'error' ? (
                <button
                  type='button'
                  aria-label={`${retryLabel}: ${item.file.name}`}
                  onClick={() => void uploadItem(item)}
                  disabled={disabled}
                >
                  <RotateCcw aria-hidden='true' />
                </button>
              ) : null}
              {item.status !== 'uploading' ? (
                <button
                  type='button'
                  aria-label={`${removeLabel}: ${item.file.name}`}
                  onClick={() => void removeItem(item)}
                  disabled={disabled}
                >
                  {item.record ? (
                    <Trash2 aria-hidden='true' />
                  ) : (
                    <X aria-hidden='true' />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <button
          type='button'
          className='flex min-h-20 min-w-32 flex-col items-center justify-center rounded-md border border-dashed px-3 py-2'
          onClick={() => inputRef.current?.click()}
          disabled={
            disabled ||
            value.length + items.filter((item) => !item.record).length >=
              effectiveMax
          }
        >
          <UploadCloud aria-hidden='true' />
          <span>{chooseLabel}</span>
        </button>
        <input
          ref={inputRef}
          className='sr-only'
          type='file'
          multiple={multiple}
          accept={accept.join(',')}
          onChange={handleChange}
          aria-label={chooseLabel}
          disabled={disabled}
        />
      </div>
      <div className='sr-only' aria-live='polite'>
        {displayItems
          .map((item) => `${item.file.name}: ${item.status}`)
          .join('. ')}
      </div>
    </div>
  );
}
