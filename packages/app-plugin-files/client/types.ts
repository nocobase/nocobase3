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
