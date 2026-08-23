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

export interface FileUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ExecuteFileUploadPlanOptions {
  signal?: AbortSignal;
  onProgress?(progress: FileUploadProgress): void;
}
