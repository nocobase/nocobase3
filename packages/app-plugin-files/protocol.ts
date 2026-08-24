export type FileDisposition = 'inline' | 'attachment';

export interface StoredFile {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  name: string;
  size: number | null;
  contentType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileUploadPlan {
  fileId: string;
  expiresAt: string;
  upload: {
    method: 'PUT';
    url: string;
    headers?: Record<string, string>;
  };
  complete: {
    method: 'POST';
    url: string;
    headers?: Record<string, string>;
  };
  cancel: {
    method: 'DELETE';
    url: string;
    headers?: Record<string, string>;
  };
}

export interface CreateBusinessFileRequest {
  name: string;
  size: number;
  contentType?: string;
  replaceFileId?: string;
}

export interface CreateBusinessFileResponse {
  file: StoredFile;
  plan: FileUploadPlan;
}

export interface FileResponse {
  file: StoredFile;
}

export interface PublicFileAccessRequest {
  disposition?: FileDisposition;
}

export interface PublicFileAccess {
  url: string;
  token: string;
  disposition: FileDisposition;
}

export interface PublicFileAccessResponse {
  file: StoredFile;
  access: PublicFileAccess;
}

export interface FileOperationResponse {
  success: true;
}

export interface FileErrorResponse {
  error: string;
  code: string;
}
