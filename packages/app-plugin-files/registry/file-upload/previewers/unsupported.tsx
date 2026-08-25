import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { getFileName } from '../file-url';
import type { FilePreviewerProps } from '../file-preview-types';

export function UnsupportedPreviewer({
  file,
  messages,
  onDownload,
}: FilePreviewerProps) {
  return (
    <div className='flex h-full min-h-[320px] items-center justify-center p-6'>
      <div className='max-w-md rounded-lg border p-4' role='alert'>
        <div className='space-y-4 text-sm text-muted-foreground'>
          <div>
            <p className='font-medium text-foreground'>
              {messages.unsupportedTitle}
            </p>
            <p className='mt-1 text-muted-foreground'>
              {messages.unsupportedDescription}
            </p>
            <p className='mt-2 break-all text-xs text-muted-foreground'>
              {getFileName(file)}
            </p>
          </div>
          <Button type='button' onClick={() => onDownload(file)}>
            <Download />
            {messages.download}
          </Button>
        </div>
      </div>
    </div>
  );
}
