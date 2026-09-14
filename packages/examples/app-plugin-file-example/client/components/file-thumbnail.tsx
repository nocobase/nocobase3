import {
  FileAudio,
  FileIcon,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';
import type { ReactElement } from 'react';
import type { FileRecord } from '@nocobase/app-plugin-file/client';

import { isSafeImage, previewKind } from '../lib/files.js';

function icon(file: FileRecord): ReactElement {
  const className = 'size-5';
  if (isSafeImage(file))
    return <FileImage aria-hidden='true' className={className} />;
  switch (previewKind(file)) {
    case 'pdf':
    case 'text':
      return <FileText aria-hidden='true' className={className} />;
    case 'audio':
      return <FileAudio aria-hidden='true' className={className} />;
    case 'video':
      return <FileVideo aria-hidden='true' className={className} />;
    default:
      return <FileIcon aria-hidden='true' className={className} />;
  }
}

export interface FileThumbnailProps {
  readonly file: FileRecord;
  readonly className?: string;
}

/** Image preview when the record is a safe raster image, an icon otherwise. */
export function FileThumbnail({
  file,
  className = '',
}: FileThumbnailProps): ReactElement {
  if (isSafeImage(file) && file.contentUrl)
    return (
      <img
        data-slot='file-thumbnail'
        src={file.contentUrl}
        alt={file.filename}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  return (
    <span
      data-slot='file-thumbnail'
      aria-label={file.filename}
      className={`flex h-full w-full items-center justify-center bg-muted/50 text-muted-foreground ${className}`}
    >
      {icon(file)}
    </span>
  );
}
