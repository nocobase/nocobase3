import { LoaderCircle, UploadCloud } from 'lucide-react';
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from 'react';
import type {
  ClientFileRepository,
  FileRecord,
} from '@nocobase/app-plugin-file/client';

import { acceptsFile, formatBytes } from '../lib/files.js';

export interface FileUploadLabels {
  readonly choose: string;
  readonly dropHint: string;
  readonly uploading: string;
  readonly tooLarge: string;
  readonly rejected: string;
  readonly uploadFailed: string;
}

export interface FileUploadFieldProps {
  readonly repository: ClientFileRepository;
  /** Called with the uploaded records once the server has committed them. */
  readonly onChange: (records: readonly FileRecord[]) => void | Promise<void>;
  readonly labels: FileUploadLabels;
  readonly multiple?: boolean;
  readonly accept?: readonly string[];
  readonly maxSize?: number;
  readonly disabled?: boolean;
  /** Renders only the trigger button, for use inside a list row. */
  readonly compact?: boolean;
}

/**
 * Upload control for File Repository resources: one file uses `uploadOne`,
 * a batch uses `uploadMany`. The caller owns what happens to the records.
 */
export function FileUploadField({
  repository,
  onChange,
  labels,
  multiple = false,
  accept = [],
  maxSize,
  disabled = false,
  compact = false,
}: FileUploadFieldProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const submit = async (selected: readonly File[]): Promise<void> => {
    const files = (multiple ? selected : selected.slice(0, 1)).filter(
      (file) => {
        if (maxSize !== undefined && file.size > maxSize) {
          setError(`${labels.tooLarge} (${formatBytes(maxSize)})`);
          return false;
        }
        if (!acceptsFile(file, accept)) {
          setError(labels.rejected);
          return false;
        }
        return true;
      },
    );
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      if (files.length === 1)
        await onChange([
          (await repository.uploadOne({ file: files[0] })).record,
        ]);
      else await onChange((await repository.uploadMany({ files })).records);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    void submit(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = '';
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    if (!disabled && !busy) void submit(Array.from(event.dataTransfer.files));
  };

  const control = (
    <>
      <button
        type='button'
        className='inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50'
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <LoaderCircle aria-hidden='true' className='size-4 animate-spin' />
        ) : (
          <UploadCloud aria-hidden='true' className='size-4' />
        )}
        {busy ? labels.uploading : labels.choose}
      </button>
      <span className={compact ? 'sr-only' : 'text-sm text-muted-foreground'}>
        {labels.dropHint}
      </span>
      <input
        ref={inputRef}
        className='sr-only'
        type='file'
        multiple={multiple}
        accept={accept.join(',')}
        aria-label={labels.choose}
        disabled={disabled || busy}
        onChange={handleChange}
      />
    </>
  );

  return (
    <div data-slot='file-upload-field' className='space-y-2'>
      {compact ? (
        <div className='inline-flex items-center'>{control}</div>
      ) : (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 ${dragging ? 'border-primary bg-primary/5' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {control}
        </div>
      )}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
