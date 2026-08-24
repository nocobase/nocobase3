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
  complete?: {
    method: 'POST';
    url: string;
    headers?: Record<string, string>;
  };
}

export interface FileReference {
  referenceId: string;
  file: StoredFile;
}

export interface ListFileReferencesResponse {
  references: FileReference[];
}

export interface CreateFileUploadRequest {
  name: string;
  size: number;
  contentType?: string;
  replaceReferenceId?: string;
}

export interface FileUploadAttempt {
  file: StoredFile;
  plan: FileUploadPlan;
  bindingCredential: string;
}

export interface CreateFileUploadResponse {
  upload: FileUploadAttempt;
}

export interface CommitFileUploadRequest {
  bindingCredential: string;
}

export interface FileReferenceResponse {
  reference: FileReference;
}

export interface CancelFileUploadRequest {
  bindingCredential: string;
}

export interface FileAccessRequest {
  disposition?: FileDisposition;
}

export interface TemporaryFileAccess {
  url: string;
  expiresAt: string;
  disposition: FileDisposition;
}

export interface FileAccessResponse {
  access: TemporaryFileAccess;
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
  reference: FileReference;
  access: PublicFileAccess;
}

export interface FileOperationResponse {
  success: true;
}

export interface FileErrorResponse {
  error: string;
  code: string;
}
