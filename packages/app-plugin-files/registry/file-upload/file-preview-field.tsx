import { useMemo, useState } from 'react';

import { cn } from '@/components/ui/utils';

import { normalizeFileBasePath } from './base-path';
import { FilePreviewDialog } from './file-preview-dialog';
import { defaultFilePreviewMessages } from './file-preview-messages';
import type { FilePreviewFieldProps } from './file-preview-types';
import { FileThumbnail } from './file-thumbnail';
import { getFileName } from './file-url';

export function FilePreviewField({
  basePath,
  value,
  size = 80,
  showFileName,
  className,
  messages: messageOverrides,
  ...rootProps
}: FilePreviewFieldProps) {
  const path = useMemo(() => normalizeFileBasePath(basePath), [basePath]);
  const [open, setOpen] = useState(false);
  const [initialIndex, setInitialIndex] = useState(0);
  const messages = useMemo(
    () => ({ ...defaultFilePreviewMessages, ...messageOverrides }),
    [messageOverrides],
  );

  if (!value.length) {
    return (
      <div data-slot='file-preview-field' className={className} {...rootProps}>
        <p className='text-sm text-muted-foreground'>{messages.noFiles}</p>
      </div>
    );
  }

  return (
    <div
      data-slot='file-preview-field'
      className={cn('flex flex-wrap gap-3', className)}
      {...rootProps}
    >
      {value.map((file, index) => {
        const filename = getFileName(file);
        return (
          <button
            key={file.id}
            type='button'
            className='group min-w-0 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
            style={{ width: size }}
            title={filename}
            onClick={() => {
              setInitialIndex(index);
              setOpen(true);
            }}
          >
            <span
              className='flex items-center justify-center overflow-hidden rounded-lg border bg-card text-muted-foreground transition-colors group-hover:border-primary'
              style={{ width: size, height: size }}
            >
              <FileThumbnail
                basePath={path}
                file={file}
                alt={messages.imageAlt(filename)}
              />
            </span>
            {showFileName ? (
              <span
                className='mt-1 block truncate text-center text-xs text-muted-foreground'
                style={{ width: size }}
                title={filename}
              >
                {filename}
              </span>
            ) : null}
          </button>
        );
      })}

      <FilePreviewDialog
        basePath={path}
        open={open}
        onOpenChange={setOpen}
        files={value}
        initialIndex={initialIndex}
        messages={messages}
      />
    </div>
  );
}
