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
}

export interface FilesClient {
  list(): Promise<readonly FileRecord[]>;
  upload(file: File, options?: FileUploadOptions): Promise<FileRecord>;
  get(id: string): Promise<FileRecord>;
  createAccessUrl(id: string, expiresIn?: number): Promise<FileAccessUrl>;
  remove(id: string): Promise<void>;
}

export interface CreateFilesClientOptions {
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
  readonly labels?: FileUiLabels;
  readonly emptyState?: ReactNode;
}

export interface FilePreviewDialogProps {
  readonly client: FilesClient;
  readonly file: FileRecord | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly download?: boolean;
  readonly labels?: FileUiLabels;
}

export interface FileThumbnailProps {
  readonly file: FileRecord;
  readonly url?: string;
  readonly alt?: string;
}
