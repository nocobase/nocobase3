import type {
  FileUploadPlan,
  FileUploadProgress,
  StoredFile,
} from '@nocobase/app-plugin-files/client';

export type { FileUploadPlan, FileUploadProgress, StoredFile };

export type FileUploadFieldValue = StoredFile[];

export type FileUploadItemStatus =
  'queued' | 'uploading' | 'completing' | 'done' | 'error' | 'cancelled';

export type FileUploadItem = {
  key: string;
  displayName: string;
  status: FileUploadItemStatus;
  rawFile?: File;
  record?: StoredFile;
  replaceFileId?: string;
  progress?: FileUploadProgress;
  error?: Error;
};

export type FileUploadMessages = {
  chooseFiles: string;
  chooseFile: string;
  replace: string;
  dragActive: string;
  dragInactive: string;
  queued: string;
  uploading: string;
  completing: string;
  uploaded: string;
  failed: string;
  cancelled: string;
  retry: string;
  remove: string;
  cancel: string;
  maxFilesReached: string;
  uploadDisabled: string;
  noFiles: string;
  fileSizeExceeded: (maxBytes: number) => string;
  fileTypeRejected: string;
};

export type FilePreviewMessages = {
  preview: string;
  download: string;
  previous: string;
  next: string;
  close: string;
  noFiles: string;
  loading: string;
  loadError: string;
  unsupportedTitle: string;
  unsupportedDescription: string;
  imageAlt: (filename: string) => string;
  pdfTitle: string;
  textTitle: string;
  audioTitle: string;
  videoTitle: string;
  officeTitle: string;
  officeError: string;
};

export type CreateScopedFileResponse = {
  file: StoredFile;
  plan: FileUploadPlan;
};
