import type { ApiClient } from '@nocobase/app-client';
import type { ReactNode } from 'react';

export interface FileRecord {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly contentUrl: string;
}

export interface FileAccessUrl {
  readonly url: string;
  readonly expiresAt: string | null;
}

export interface FileUploadOptions {
  readonly public?: boolean;
  readonly signal?: AbortSignal;
}

export type FileUploadStatus = 'idle' | 'uploading' | 'error';

export interface FilesClient {
  list(): Promise<readonly FileRecord[]>;
  upload(file: File, options?: FileUploadOptions): Promise<FileRecord>;
  get(id: string): Promise<FileRecord>;
  createAccessUrl(id: string, expiresIn?: number): Promise<FileAccessUrl>;
  remove(id: string): Promise<void>;
}

export interface CreateFilesClientOptions {
  readonly api: ApiClient;
  readonly endpoint: string;
}

export interface FileUiLabels {
  readonly choose?: string;
  readonly empty?: string;
  readonly preview?: string;
  readonly download?: string;
  readonly remove?: string;
  readonly retry?: string;
}

export interface FileUploadFieldProps {
  readonly client: FilesClient;
  readonly value: readonly FileRecord[];
  readonly onChange: (value: readonly FileRecord[]) => void;
  readonly onError?: (error: Error) => void;
  readonly onStatusChange?: (status: FileUploadStatus) => void;
  readonly multiple?: boolean;
  readonly accept?: readonly string[];
  readonly maxSize?: number;
  readonly maxFiles?: number;
  readonly public?: boolean;
  readonly disabled?: boolean;
  readonly removeOnDelete?: boolean;
  readonly labels?: FileUiLabels;
}

export interface FileListProps {
  readonly client: FilesClient;
  readonly files: readonly FileRecord[];
  readonly onPreview?: (file: FileRecord) => void;
  readonly onDownload?: (file: FileRecord) => void;
  readonly onRemove?: (file: FileRecord) => void | Promise<void>;
  readonly onError?: (error: Error) => void;
  readonly labels?: FileUiLabels;
  readonly emptyState?: ReactNode;
}

export interface FilePreviewDialogProps {
  readonly client: FilesClient;
  readonly files: readonly FileRecord[];
  readonly initialIndex?: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onError?: (error: Error) => void;
  readonly download?: boolean;
  readonly labels?: FileUiLabels;
}

export interface FilePreviewFieldProps {
  readonly client: FilesClient;
  readonly files: readonly FileRecord[];
  readonly labels?: FileUiLabels;
  readonly emptyState?: ReactNode;
  readonly showFilenames?: boolean;
  readonly onError?: (error: Error) => void;
}

export interface FileThumbnailProps {
  readonly file: FileRecord;
  readonly url?: string;
  readonly alt?: string;
}
