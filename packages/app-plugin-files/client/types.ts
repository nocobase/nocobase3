export type { FileUploadPlan, StoredFile } from '../protocol.js';

export interface FileUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ExecuteFileUploadPlanOptions {
  signal?: AbortSignal;
  onProgress?(progress: FileUploadProgress): void;
}

export type FileClientOperation = 'upload' | 'complete' | 'cancel';

export interface FileClientErrorOptions {
  code: string;
  status: number;
  operation: FileClientOperation;
  cause?: unknown;
}
