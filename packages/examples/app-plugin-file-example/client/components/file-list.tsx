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
      <div className='flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center bg-card/40'>
        <p role='status' className='text-xs text-muted-foreground'>
          {emptyState ?? labels.empty}
        </p>
      </div>
    );
  return (
    <>
      <ul
        data-slot='file-list'
        className='divide-y divide-border/60 rounded-xl border bg-card shadow-2xs overflow-hidden'
      >
        {files.map((file, position) => (
          <li
            key={file.id}
            className='flex items-center gap-3.5 p-3.5 hover:bg-muted/30 transition-colors'
          >
            <span className='size-10 shrink-0 overflow-hidden rounded-lg border bg-muted/40 shadow-2xs'>
              <FileThumbnail file={file} />
            </span>
            <span className='min-w-0 flex-1 space-y-0.5'>
              <span
                className='block truncate text-sm font-medium text-foreground'
                title={file.filename}
              >
                {file.filename}
              </span>
              <span className='block text-xs text-muted-foreground font-mono'>
                {file.mimeType} · {formatBytes(file.size)}
              </span>
            </span>
            <span className='flex shrink-0 items-center gap-1'>
              <button
                type='button'
                aria-label={`${labels.preview}: ${file.filename}`}
                title={labels.preview}
                className='rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer'
                onClick={() => setIndex(position)}
              >
                <Eye aria-hidden='true' className='size-4' />
              </button>
              <a
                aria-label={`${labels.download}: ${file.filename}`}
                title={labels.download}
                className='rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer'
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
                  className='rounded-lg p-2 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 cursor-pointer'
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
