import { Download, FileWarning } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import type { FilePreviewerProps } from '../file-preview-types';

export function OfficePreviewer({
  file,
  messages,
  onDownload,
}: FilePreviewerProps) {
  return (
    <div className='flex h-full min-h-[320px] items-center justify-center p-6'>
      <Alert className='max-w-md'>
        <FileWarning className='size-4' />
        <AlertDescription className='space-y-4'>
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
        </AlertDescription>
      </Alert>
    </div>
  );
}
