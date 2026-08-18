import type { FileAccessContext, FileObject, FilesClient } from "@nocobase/portal-sdk/files";

export type { FileAccessContext, FileObject, FilesClient };

export type FileUploadProps = {
  policy?: string;
  context?: FileAccessContext;
  value?: FileObject[];
  onChange?: (files: FileObject[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  accept?: string[];
  maxSize?: number;
  deleteOnRemove?: boolean;
  client?: FilesClient;
  onUploadStart?: (file: File) => void;
  onUploadComplete?: (file: FileObject) => void;
  onUploadError?: (error: Error, file: File) => void;
};

export type FileUploadItem = {
  key: string;
  file: File;
  status: "preparing" | "uploading" | "completing" | "success" | "error" | "aborted";
  record?: FileObject;
  error?: Error;
};
