import {
  FileAudio,
  FileCode2,
  FileIcon,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';
import type { ReactElement } from 'react';

import type { FileThumbnailProps } from '../types.js';
import { isSafeImagePreview } from '../lib/file-preview.js';
import { resolveSafeFileUrl } from '../lib/file-url.js';

function extension(filename: string): string {
  const value = filename.toLowerCase();
  const dot = value.lastIndexOf('.');
  return dot < 0 ? '' : value.slice(dot);
}

function thumbnailIcon(file: FileThumbnailProps['file']): ReactElement {
  if (isSafeImagePreview(file)) return <FileImage aria-hidden='true' />;
  if (file.mimeType.startsWith('audio/'))
    return <FileAudio aria-hidden='true' />;
  if (file.mimeType.startsWith('video/'))
    return <FileVideo aria-hidden='true' />;
  if (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    ['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.xml', '.svg'].includes(
      extension(file.filename),
    )
  ) {
    return <FileCode2 aria-hidden='true' />;
  }
  if (
    file.mimeType === 'application/pdf' ||
    extension(file.filename) === '.pdf'
  ) {
    return <FileText aria-hidden='true' />;
  }
  return <FileIcon aria-hidden='true' />;
}

export function FileThumbnail({
  file,
  url,
  alt = file.filename,
}: FileThumbnailProps): ReactElement {
  const imageUrl = resolveSafeFileUrl(
    url ?? (file.public && isSafeImagePreview(file) ? file.contentUrl : ''),
  );
  if (imageUrl) {
    return (
      <img
        data-slot='file-thumbnail'
        src={imageUrl}
        alt={alt}
        className='h-full w-full object-cover'
      />
    );
  }
  return (
    <span
      data-slot='file-thumbnail'
      aria-label={file.filename}
      className='flex h-full w-full items-center justify-center rounded-md bg-muted/50 p-3 text-muted-foreground'
    >
      {thumbnailIcon(file)}
    </span>
  );
}
