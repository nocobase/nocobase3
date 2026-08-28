import { LoaderCircle, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from 'react';

import type {
  FileRecord,
  FileUploadFieldProps,
} from '@nocobase/app-plugin-file/client/types';
import { Button } from '@/components/ui/button';
import { FileThumbnail } from './file-thumbnail';

type UploadItem = {
  readonly key: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'error';
  readonly controller?: AbortController;
  readonly error?: Error;
};

function accepts(file: File, rules: readonly string[]): boolean {
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  return rules.some((rule) => {
    const value = rule.trim().toLowerCase();
    if (value === '*' || value === '*/*') return true;
    return value.endsWith('/*')
      ? file.type.toLowerCase().startsWith(value.slice(0, -1))
      : value.startsWith('.')
        ? name.endsWith(value)
        : file.type.toLowerCase() === value;
  });
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
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const controllersRef = useRef(new Map<string, AbortController>());
  const mountedRef = useRef(true);
  const maximum = multiple ? (maxFiles ?? Infinity) : 1;
  const chooseLabel =
    labels?.choose ?? (multiple ? 'Choose files' : 'Choose file');

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onStatusChange?.(
      items.some((item) => item.status === 'error')
        ? 'error'
        : items.length
          ? 'uploading'
          : 'idle',
    );
  }, [items, onStatusChange]);
  useEffect(() => {
    mountedRef.current = true;
    const controllers = controllersRef.current;
    return () => {
      mountedRef.current = false;
      for (const controller of controllers.values()) controller.abort();
    };
  }, []);

  const upload = async (item: UploadItem): Promise<void> => {
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
      const next = multiple ? [...valueRef.current, record] : [record];
      valueRef.current = next;
      onChange(next);
    } catch (error) {
      controllersRef.current.delete(item.key);
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
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
            ? { ...candidate, error: uploadError, status: 'error' }
            : candidate,
        ),
      );
      onError?.(uploadError);
    }
  };

  const addFiles = (files: readonly File[]): void => {
    if (disabled) return;
    if (files.length + (multiple ? value.length : 0) + items.length > maximum) {
      onError?.(new Error('The maximum number of files has been reached.'));
      return;
    }
    const selected = (multiple ? files : files.slice(0, 1)).filter((file) => {
      if (maxSize !== undefined && file.size > maxSize) {
        onError?.(new Error('File exceeds the maximum size.'));
        return false;
      }
      if (!accepts(file, accept)) {
        onError?.(new Error('File type is not allowed.'));
        return false;
      }
      return true;
    });
    const nextItems = selected.map((file): UploadItem => ({
      key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
      file,
      status: 'pending',
    }));
    setItems((current) => [...current, ...nextItems]);
    nextItems.forEach((item) => void upload(item));
  };

  const removeRecord = async (record: FileRecord): Promise<void> => {
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
    const next = valueRef.current.filter(
      (candidate) => candidate.id !== record.id,
    );
    valueRef.current = next;
    onChange(next);
  };
  const cancel = (item: UploadItem): void => {
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
            <div className='text-xs text-muted-foreground'>Done</div>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              aria-label={`Remove ${record.filename}`}
              onClick={() => void removeRecord(record)}
              disabled={disabled}
            >
              <Trash2 aria-hidden='true' />
            </Button>
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
              {item.status === 'error'
                ? (item.error?.message ?? 'Failed')
                : item.status === 'uploading'
                  ? 'Uploading'
                  : 'Pending'}
            </div>
            <div className='mt-2 flex gap-1'>
              {item.status === 'error' ? (
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={`Retry ${item.file.name}`}
                  onClick={() => void upload(item)}
                >
                  <RotateCcw aria-hidden='true' />
                </Button>
              ) : null}
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`Cancel ${item.file.name}`}
                onClick={() => cancel(item)}
                disabled={disabled}
              >
                <X aria-hidden='true' />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          className='min-h-20 min-w-32'
          onClick={() => inputRef.current?.click()}
          disabled={
            disabled ||
            (multiple
              ? value.length + items.length >= maximum
              : items.length >= 1)
          }
        >
          <UploadCloud aria-hidden='true' />
          {chooseLabel}
        </Button>
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
