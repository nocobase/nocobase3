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
} from '@nocobase/app-plugin-files/client/types';
import { Button } from '@/components/ui/button';
import { FileThumbnail } from './file-thumbnail';

type UploadItem = {
  readonly key: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'done' | 'error';
  readonly record?: FileRecord;
  readonly error?: Error;
};

function accepts(file: File, rules: readonly string[]): boolean {
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  return rules.some((rule) => {
    const value = rule.trim().toLowerCase();
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
  const maximum = multiple ? (maxFiles ?? Infinity) : 1;
  const chooseLabel =
    labels?.choose ?? (multiple ? 'Choose files' : 'Choose file');

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const upload = async (item: UploadItem): Promise<void> => {
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
            ? { ...candidate, record, status: 'done' }
            : candidate,
        ),
      );
      const next = multiple ? [...valueRef.current, record] : [record];
      valueRef.current = next;
      onChange(next);
    } catch (error) {
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
    const pending = items.filter((item) => !item.record).length;
    if (files.length + value.length + pending > maximum) {
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

  const remove = async (item: UploadItem): Promise<void> => {
    if (item.record && removeOnDelete) await client.remove(item.record.id);
    setItems((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
    if (item.record) {
      const next = valueRef.current.filter(
        (record) => record.id !== item.record?.id,
      );
      valueRef.current = next;
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
  const displayed = [
    ...value.map((record): UploadItem => ({
      key: `record:${record.id}`,
      file: new File([], record.filename, { type: record.mimeType }),
      record,
      status: 'done',
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
        {displayed.map((item) => (
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
              {item.status === 'error'
                ? (item.error?.message ?? 'Failed')
                : item.status === 'uploading'
                  ? 'Uploading'
                  : item.status === 'pending'
                    ? 'Pending'
                    : 'Done'}
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
              {item.status !== 'uploading' ? (
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  aria-label={`${item.record ? 'Remove' : 'Cancel'} ${item.file.name}`}
                  onClick={() => void remove(item)}
                  disabled={disabled}
                >
                  {item.record ? (
                    <Trash2 aria-hidden='true' />
                  ) : (
                    <X aria-hidden='true' />
                  )}
                </Button>
              ) : null}
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
            value.length + items.filter((item) => !item.record).length >=
              maximum
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
    </div>
  );
}
