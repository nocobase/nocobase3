import { getPreviewFileUrl } from '../file-url';
import type { FilePreviewerProps } from '../file-preview-types';

export function PdfPreviewer({ basePath, file, messages }: FilePreviewerProps) {
  return (
    <iframe
      src={getPreviewFileUrl(basePath, file)}
      title={messages.pdfTitle}
      className='h-full min-h-[520px] w-full bg-background'
    />
  );
}
