import { useState, type ReactElement } from 'react';

import type { FilePreviewFieldProps } from '../types.js';
import { FilePreviewDialog } from './file-preview-dialog.js';
import { FileThumbnail } from './file-thumbnail.js';

export function FilePreviewField({
  files,
  client,
  labels,
  emptyState,
  showFilenames = false,
  onError,
}: FilePreviewFieldProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [initialIndex, setInitialIndex] = useState(0);
  if (!files.length)
    return <>{emptyState ?? <span role='status'>No files.</span>}</>;
  return (
    <>
      <div data-slot='file-preview-field' className='flex flex-wrap gap-2'>
        {files.map((file, index) => (
          <div key={file.id} className='flex max-w-36 flex-col gap-1'>
            <button
              type='button'
              className='h-12 w-12 overflow-hidden rounded-md'
              aria-label={`${labels?.preview ?? 'Preview'}: ${file.filename}`}
              onClick={() => {
                setInitialIndex(index);
                setOpen(true);
              }}
            >
              <FileThumbnail file={file} />
            </button>
            {showFilenames ? (
              <span className='truncate text-xs' title={file.filename}>
                {file.filename}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <FilePreviewDialog
        client={client}
        files={files}
        initialIndex={initialIndex}
        open={open}
        onOpenChange={setOpen}
        labels={labels}
        onError={onError}
      />
    </>
  );
}
