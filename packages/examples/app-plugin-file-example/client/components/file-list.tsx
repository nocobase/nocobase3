import { Download, Eye, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { FileRecord } from '@nocobase/app-plugin-file/client';

import { formatBytes } from '../lib/files.js';
import {
  FilePreviewDialog,
  type FilePreviewLabels,
} from './file-preview-dialog.js';
import { FileThumbnail } from './file-thumbnail.js';

export interface FileListLabels extends FilePreviewLabels {
  readonly remove: string;
  readonly empty: string;
}

export interface FileListProps {
  readonly files: readonly FileRecord[];
  readonly labels: FileListLabels;
  readonly onRemove?: (file: FileRecord) => void | Promise<void>;
  readonly emptyState?: string;
  /** Adds a busy lock while a relation mutation is in flight. */
  readonly disabled?: boolean;
}

export function FileList({
  files,
  labels,
  onRemove,
  emptyState,
  disabled = false,
}: FileListProps): ReactElement {
  const [index, setIndex] = useState(-1);
  if (!files.length)
    return (
      <p role='status' className='text-sm text-muted-foreground'>
        {emptyState ?? labels.empty}
      </p>
    );
  return (
    <>
      <ul data-slot='file-list' className='divide-y rounded-lg border'>
        {files.map((file, position) => (
          <li key={file.id} className='flex items-center gap-3 p-3'>
            <span className='size-10 shrink-0 overflow-hidden rounded-md'>
              <FileThumbnail file={file} />
            </span>
            <span className='min-w-0 flex-1'>
              <span
                className='block truncate text-sm font-medium'
                title={file.filename}
              >
                {file.filename}
              </span>
              <span className='block text-xs text-muted-foreground'>
                {file.mimeType} · {formatBytes(file.size)}
              </span>
            </span>
            <span className='flex shrink-0 items-center gap-1'>
              <button
                type='button'
                aria-label={`${labels.preview}: ${file.filename}`}
                title={labels.preview}
                className='rounded-md p-2 hover:bg-accent'
                onClick={() => setIndex(position)}
              >
                <Eye aria-hidden='true' className='size-4' />
              </button>
              <a
                aria-label={`${labels.download}: ${file.filename}`}
                title={labels.download}
                className='rounded-md p-2 hover:bg-accent'
                href={file.contentUrl}
                download={file.filename}
              >
                <Download aria-hidden='true' className='size-4' />
              </a>
              {onRemove ? (
                <button
                  type='button'
                  aria-label={`${labels.remove}: ${file.filename}`}
                  title={labels.remove}
                  className='rounded-md p-2 text-destructive hover:bg-accent disabled:opacity-50'
                  disabled={disabled}
                  onClick={() => void onRemove(file)}
                >
                  <Trash2 aria-hidden='true' className='size-4' />
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <FilePreviewDialog
        files={files}
        index={index}
        labels={labels}
        onIndexChange={setIndex}
        onClose={() => setIndex(-1)}
      />
    </>
  );
}
