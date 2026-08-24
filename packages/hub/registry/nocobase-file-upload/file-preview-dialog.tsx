import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

export function FilePreviewDialog({
  basePath,
  open,
  onOpenChange,
  files,
  initialIndex = 0,
  messages: messageOverrides,
}: FilePreviewDialogProps) {
  const [index, setIndex] = useState(initialIndex);
  const messages = useMemo(
    () => ({ ...defaultFilePreviewMessages, ...messageOverrides }),
    [messageOverrides],
  );

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [initialIndex, open]);
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, files.length - 1)));
  }, [files.length]);

  const file = files[index] ?? files[0];
  const previewType = useMemo(
    () => (file ? getPreviewType(file) : null),
    [file],
  );
  if (!file || !previewType) return null;

  const Previewer = previewType.Previewer;
  const download = (downloadFile: StoredFile): void => {
    void triggerFileDownload(basePath, downloadFile);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-file-preview-dialog=''
        className='max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl'
      >
        <DialogHeader className='border-b px-4 py-3'>
          <div className='flex min-w-0 items-center justify-between gap-3'>
            <div className='min-w-0'>
              <DialogTitle className='truncate'>
                {getFileName(file)}
              </DialogTitle>
              <DialogDescription>
                {files.length > 1
                  ? `${index + 1} / ${files.length}`
                  : messages.preview}
              </DialogDescription>
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              {files.length > 1 ? (
                <>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={messages.previous}
                    title={messages.previous}
                    disabled={index === 0}
                    onClick={() => setIndex((current) => current - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={messages.next}
                    title={messages.next}
                    disabled={index === files.length - 1}
                    onClick={() => setIndex((current) => current + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </>
              ) : null}
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={messages.download}
                title={messages.download}
                onClick={() => download(file)}
              >
                <Download />
              </Button>
              <DialogClose
                render={
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    aria-label={messages.close}
                    title={messages.close}
                  />
                }
              >
                <X />
              </DialogClose>
            </div>
          </div>
        </DialogHeader>
        <div className='h-[min(70vh,720px)] overflow-hidden'>
          <Previewer
            basePath={basePath}
            file={file}
            index={index}
            list={files}
            messages={messages}
            onDownload={download}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
