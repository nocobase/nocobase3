import {
  FileAudio,
  FileCode2,
  FileIcon,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';
import type { ReactElement } from 'react';

import type { FileThumbnailProps } from '@nocobase/app-plugin-file/client/types';

function extension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

function isSafeImage(file: FileThumbnailProps['file']): boolean {
  return (
    file.mimeType.startsWith('image/') && file.mimeType !== 'image/svg+xml'
  );
}

function icon(file: FileThumbnailProps['file']): ReactElement {
  if (isSafeImage(file)) return <FileImage aria-hidden='true' />;
  if (file.mimeType.startsWith('audio/'))
    return <FileAudio aria-hidden='true' />;
  if (file.mimeType.startsWith('video/'))
    return <FileVideo aria-hidden='true' />;
  if (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    ['.css', '.html', '.js', '.json', '.md', '.ts', '.tsx', '.xml'].includes(
      extension(file.filename),
    )
  ) {
    return <FileCode2 aria-hidden='true' />;
  }
  if (
    file.mimeType === 'application/pdf' ||
    extension(file.filename) === '.pdf'
  )
    return <FileText aria-hidden='true' />;
  return <FileIcon aria-hidden='true' />;
}

export function FileThumbnail({
  file,
  url,
  alt = file.filename,
}: FileThumbnailProps): ReactElement {
  const imageUrl =
    url ?? (file.public && isSafeImage(file) ? file.contentUrl : undefined);
  return imageUrl ? (
    <img
      data-slot='file-thumbnail'
      src={imageUrl}
      alt={alt}
      className='h-full w-full object-cover'
    />
  ) : (
    <span
      data-slot='file-thumbnail'
      aria-label={file.filename}
      className='flex h-full w-full items-center justify-center rounded-md bg-muted/50 p-3 text-muted-foreground'
    >
      {icon(file)}
    </span>
  );
}
