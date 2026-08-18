export type FilesClientErrorOptions = {
  code: string;
  message: string;
  status?: number;
  retryable?: boolean;
  requestId?: string;
  details?: unknown;
  upload?: {
    uploadId?: string;
    fileId?: string;
    idempotencyKey?: string;
    phase: "prepare" | "transfer" | "complete";
  };
};
export class FilesClientError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly upload?: FilesClientErrorOptions["upload"];
  constructor(options: FilesClientErrorOptions) {
    super(options.message);
    this.name = "FilesClientError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.details = options.details;
    this.upload = options.upload;
  }
}
