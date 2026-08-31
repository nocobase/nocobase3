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
  status: 'pending' | 'uploading' | 'error';
  controller?: AbortController;
  error?: Error;
};

function accepted(file: File, accept: readonly string[]): boolean {
  if (!accept.length) return true;
  const name = file.name.toLowerCase();
  return accept.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    if (normalized === '*' || normalized === '*/*') return true;
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
  onStatusChange,
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
  const completedRecordsRef = useRef<FileUploadFieldProps['value'][number][]>(
    [],
  );
  const commitScheduledRef = useRef(false);
  const statusChangeRef = useRef(onStatusChange);
  const controllersRef = useRef(new Map<string, AbortController>());
  const mountedRef = useRef(true);
  const [dragging, setDragging] = useState(false);
  const chooseLabel =
    labels?.choose ?? (multiple ? 'Choose files' : 'Choose file');
  const removeLabel = labels?.remove ?? 'Remove';
  const retryLabel = labels?.retry ?? 'Retry';
  const effectiveMax = multiple ? (maxFiles ?? Infinity) : 1;

  useEffect(() => {
    controlledValueRef.current = value;
  }, [value]);
  useEffect(() => {
    statusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChange?.(
      items.some((item) => item.status === 'error')
        ? 'error'
        : items.some(
              (item) =>
                item.status === 'pending' || item.status === 'uploading',
            )
          ? 'uploading'
          : 'idle',
    );
  }, [items, onStatusChange]);

  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      for (const controller of controllers.values()) {
        controller.abort();
      }
      statusChangeRef.current?.('idle');
    };
  }, []);

  const report = (message: string): void => {
    onError?.(new Error(message));
  };

  const commitCompletedRecord = (
    record: FileUploadFieldProps['value'][number],
  ): void => {
    completedRecordsRef.current.push(record);
    if (commitScheduledRef.current) return;
    commitScheduledRef.current = true;
    queueMicrotask(() => {
      commitScheduledRef.current = false;
      const completed = completedRecordsRef.current.splice(0);
      if (!mountedRef.current || !completed.length) return;
      onChange(
        multiple
          ? [...controlledValueRef.current, ...completed]
          : [completed.at(-1) as FileUploadFieldProps['value'][number]],
      );
    });
  };

  const uploadItem = async (item: UploadItem): Promise<void> => {
    const controller = new AbortController();
    controllersRef.current.set(item.key, controller);
    setItems((current) =>
      current.map((candidate) =>
        candidate.key === item.key
          ? { ...candidate, status: 'uploading', controller, error: undefined }
          : candidate,
      ),
    );
    try {
      const record = await client.upload(item.file, {
        public: isPublic,
        signal: controller.signal,
      });
      controllersRef.current.delete(item.key);
      if (!mountedRef.current || controller.signal.aborted) return;
      setItems((current) =>
        current.filter((candidate) => candidate.key !== item.key),
      );
      commitCompletedRecord(record);
    } catch (error) {
      controllersRef.current.delete(item.key);
      if (controller.signal.aborted || isAbortError(error)) {
        if (mountedRef.current) {
          setItems((current) =>
            current.filter((candidate) => candidate.key !== item.key),
          );
        }
        return;
      }
      if (!mountedRef.current) return;
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
    const available = multiple
      ? effectiveMax - value.length - items.length
      : 1 - items.length;
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

  const removeRecord = async (
    record: FileUploadFieldProps['value'][number],
  ): Promise<void> => {
    if (removeOnDelete) {
      try {
        await client.remove(record.id);
      } catch (error) {
        onError?.(
          error instanceof Error ? error : new Error('File removal failed.'),
        );
        return;
      }
    }
    const next = controlledValueRef.current.filter(
      (candidate) => candidate.id !== record.id,
    );
    onChange(next);
  };

  const cancelItem = (item: UploadItem): void => {
    controllersRef.current.get(item.key)?.abort();
    controllersRef.current.delete(item.key);
    setItems((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
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
        {value.map((record) => (
          <div key={record.id} className='w-36 rounded-md border p-2'>
            <div className='flex h-20 items-center justify-center overflow-hidden rounded-sm bg-muted/30'>
              <FileThumbnail file={record} />
            </div>
            <div className='mt-2 truncate text-sm' title={record.filename}>
              {record.filename}
            </div>
            <div className='text-xs text-muted-foreground'>
              {formatSize(record.size)} · Done
            </div>
            <div className='mt-2 flex gap-1'>
              <button
                type='button'
                aria-label={`${removeLabel}: ${record.filename}`}
                onClick={() => void removeRecord(record)}
                disabled={disabled}
              >
                <Trash2 aria-hidden='true' />
              </button>
            </div>
          </div>
        ))}
        {items.map((item) => (
          <div key={item.key} className='w-36 rounded-md border p-2'>
            <div className='flex h-20 items-center justify-center overflow-hidden rounded-sm bg-muted/30'>
              {item.status === 'uploading' ? (
                <LoaderCircle className='animate-spin' aria-label='Uploading' />
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
                    : 'Failed'}
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
              <button
                type='button'
                aria-label={`Cancel: ${item.file.name}`}
                onClick={() => cancelItem(item)}
                disabled={disabled}
              >
                <X aria-hidden='true' />
              </button>
            </div>
          </div>
        ))}
        <button
          type='button'
          className='flex min-h-20 min-w-32 flex-col items-center justify-center rounded-md border border-dashed px-3 py-2'
          onClick={() => inputRef.current?.click()}
          disabled={
            disabled ||
            (multiple
              ? value.length + items.length >= effectiveMax
              : items.length >= 1)
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
        {[
          ...value.map((record) => `${record.filename}: done`),
          ...items.map((item) => `${item.file.name}: ${item.status}`),
        ].join('. ')}
      </div>
    </div>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
