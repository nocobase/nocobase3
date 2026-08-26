import { Download, FileWarning } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { FilePreviewerProps } from '../file-preview-types';

export function OfficePreviewer({
  file,
  messages,
  onDownload,
}: FilePreviewerProps) {
  return (
    <div className='flex h-full min-h-[320px] items-center justify-center p-6'>
      <div className='max-w-md rounded-lg border p-4' role='alert'>
        <FileWarning className='size-4' />
        <div className='mt-2 space-y-4 text-sm text-muted-foreground'>
          <div>
            <p className='font-medium text-foreground'>
              {messages.officeError}
            </p>
            <p className='mt-1 text-muted-foreground'>
              {messages.unsupportedDescription}
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
