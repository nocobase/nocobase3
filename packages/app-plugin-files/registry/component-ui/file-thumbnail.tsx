import {
  FileArchive,
  FileAudio,
  FileChartColumn,
  FileCode,
  FileIcon,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { useFilesUi } from '@/extensions/nocobase-files-provider-ui';
import { cn } from '@/lib/utils';

import {
  classifyFileThumbnail,
  normalizeFileThumbnailInput,
  type FileThumbnailKind,
} from './file-thumbnail-classifier';
import { getThumbnailUrl } from './file-url';
import { isImageFile } from './file-preview-types';
import type { StoredFile } from './types';

export type FileThumbnailProps = {
  basePath?: string;
  file?: StoredFile;
  rawFile?: File;
  alt?: string;
  className?: string;
  iconClassName?: string;
  imageClassName?: string;
  showExtensionBadge?: boolean;
};

const thumbnailStyles: Record<
  FileThumbnailKind,
  { Icon: LucideIcon; className: string; badgeClassName: string }
> = {
  archive: {
    Icon: FileArchive,
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    badgeClassName: 'bg-amber-600 text-white dark:bg-amber-500 dark:text-black',
  },
  audio: {
    Icon: FileAudio,
    className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    badgeClassName:
      'bg-violet-600 text-white dark:bg-violet-500 dark:text-black',
  },
  code: {
    Icon: FileCode,
    className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    badgeClassName: 'bg-slate-700 text-white dark:bg-slate-300 dark:text-black',
  },
  default: {
    Icon: FileIcon,
    className: 'bg-muted/40 text-muted-foreground',
    badgeClassName: 'bg-muted-foreground text-background',
  },
  document: {
    Icon: FileText,
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    badgeClassName: 'bg-blue-600 text-white dark:bg-blue-500 dark:text-black',
  },
  image: {
    Icon: FileImage,
    className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    badgeClassName: 'bg-sky-600 text-white dark:bg-sky-500 dark:text-black',
  },
  json: {
    Icon: FileJson,
    className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    badgeClassName:
      'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-black',
  },
  pdf: {
    Icon: FileText,
    className: 'bg-red-500/10 text-red-700 dark:text-red-300',
    badgeClassName: 'bg-red-600 text-white dark:bg-red-500 dark:text-black',
  },
  presentation: {
    Icon: FileChartColumn,
    className: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    badgeClassName:
      'bg-orange-600 text-white dark:bg-orange-500 dark:text-black',
  },
  spreadsheet: {
    Icon: FileSpreadsheet,
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    badgeClassName:
      'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-black',
  },
  video: {
    Icon: FileVideo,
    className: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
    badgeClassName:
      'bg-fuchsia-600 text-white dark:bg-fuchsia-500 dark:text-black',
  },
};

function getExtensionLabel(extension: string): string {
  const label = extension.replace(/^\./, '').toUpperCase();
  if (!label) return '';
  return label.length > 5 ? label.slice(0, 5) : label;
}

export function FileThumbnail({
  basePath,
  file,
  rawFile,
  alt,
  className,
  iconClassName,
  imageClassName,
  showExtensionBadge = true,
}: FileThumbnailProps) {
  const { buildFileUrl } = useFilesUi();
  const thumbnailUrl =
    file && basePath ? getThumbnailUrl(basePath, file, buildFileUrl) : '';
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const showImage = Boolean(
    file &&
    isImageFile(file) &&
    thumbnailUrl &&
    thumbnailUrl !== failedImageUrl,
  );

  if (showImage) {
    return (
      <img
        data-slot='file-thumbnail'
        src={thumbnailUrl}
        alt={alt ?? file?.name ?? ''}
        className={cn('h-full w-full object-cover', imageClassName)}
        onError={() => setFailedImageUrl(thumbnailUrl)}
      />
    );
  }

  const normalizedFile = file
    ? normalizeFileThumbnailInput(file)
    : rawFile
      ? normalizeFileThumbnailInput(rawFile)
      : { extension: '', mimeType: '' };
  const kind = classifyFileThumbnail(normalizedFile);
  const extensionLabel = getExtensionLabel(normalizedFile.extension);
  const style = thumbnailStyles[kind];
  const Icon = style.Icon;

  return (
    <span
      data-slot='file-thumbnail'
      className={cn(
        'relative flex h-full w-full items-center justify-center rounded-md',
        style.className,
        className,
      )}
    >
      <Icon className={cn('size-7', iconClassName)} />
      {showExtensionBadge && extensionLabel ? (
        <span
          className={cn(
            'absolute bottom-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-normal shadow-sm',
            style.badgeClassName,
          )}
        >
          {extensionLabel}
        </span>
      ) : null}
    </span>
  );
}
