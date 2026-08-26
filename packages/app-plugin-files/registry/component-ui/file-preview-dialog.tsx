import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useFilesUi } from '@/extensions/nocobase-files-provider-ui';

import { defaultFilePreviewMessages } from './file-preview-messages';
import { getPreviewType } from './file-preview-types';
import { getFileName, triggerFileDownload } from './file-url';
import type { FilePreviewMessages, StoredFile } from './types';

export type FilePreviewDialogProps = {
  basePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: StoredFile[];
  initialIndex?: number;
  messages?: Partial<FilePreviewMessages>;
};

export function FilePreviewDialog({ open, ...props }: FilePreviewDialogProps) {
  return open ? <OpenFilePreviewDialog {...props} /> : null;
}

function OpenFilePreviewDialog({
  basePath,
  onOpenChange,
  files,
  initialIndex = 0,
  messages: messageOverrides,
}: Omit<FilePreviewDialogProps, 'open'>) {
  const { buildFileUrl } = useFilesUi();
  const [index, setIndex] = useState(initialIndex);
  const messages = { ...defaultFilePreviewMessages, ...messageOverrides };
  const safeIndex = Math.min(index, Math.max(0, files.length - 1));
  const file = files[safeIndex] ?? files[0];
  const previewType = file ? getPreviewType(file) : null;
  if (!file || !previewType) return null;

  const Previewer = previewType.Previewer;
  const download = (downloadFile: StoredFile): void => {
    void triggerFileDownload(basePath, downloadFile, buildFileUrl);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className='fixed inset-0 z-50 bg-black/40' />
        <DialogPrimitive.Popup
          data-file-preview-dialog=''
          className='fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-lg bg-background text-foreground shadow-xl outline-none'
        >
          <div className='border-b px-4 py-3'>
            <div className='flex min-w-0 items-center justify-between gap-3'>
              <div className='min-w-0'>
                <DialogPrimitive.Title className='truncate font-medium'>
                  {getFileName(file)}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className='text-sm text-muted-foreground'>
                  {files.length > 1
                    ? `${safeIndex + 1} / ${files.length}`
                    : messages.preview}
                </DialogPrimitive.Description>
              </div>
              <div className='flex shrink-0 items-center gap-1'>
                {files.length > 1 ? (
                  <>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      aria-label={messages.previous}
                      title={messages.previous}
                      disabled={safeIndex === 0}
                      onClick={() => setIndex(safeIndex - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      aria-label={messages.next}
                      title={messages.next}
                      disabled={safeIndex === files.length - 1}
                      onClick={() => setIndex(safeIndex + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </>
                ) : null}
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  aria-label={messages.download}
                  title={messages.download}
                  onClick={() => download(file)}
                >
                  <Download />
                </Button>
                <DialogPrimitive.Close
                  render={
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-7'
                      aria-label={messages.close}
                      title={messages.close}
                    />
                  }
                >
                  <X />
                </DialogPrimitive.Close>
              </div>
            </div>
          </div>
          <div className='h-[min(70vh,720px)] overflow-hidden'>
            <Previewer
              key={`${basePath}:${file.id}:${file.updatedAt}`}
              basePath={basePath}
              buildFileUrl={buildFileUrl}
              file={file}
              index={safeIndex}
              list={files}
              messages={messages}
              onDownload={download}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
