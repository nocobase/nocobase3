export const SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.pptx',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.txt',
  '.md',
  '.json',
  '.csv',
] as const;

export const MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

export interface KnowledgeBaseDocumentUploadConstraints {
  readonly acceptedExtensions: readonly string[];
  readonly maxFileSizeBytes: number;
}

export const KNOWLEDGE_BASE_DOCUMENT_UPLOAD_CONSTRAINTS: KnowledgeBaseDocumentUploadConstraints =
  Object.freeze({
    acceptedExtensions: Object.freeze([
      ...SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS,
    ]),
    maxFileSizeBytes: MAX_KNOWLEDGE_BASE_DOCUMENT_UPLOAD_SIZE_BYTES,
  });

export interface KnowledgeBaseDocumentUploadFile {
  readonly name: string;
  readonly type?: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type KnowledgeBaseUploadErrorCode =
  | 'UPLOAD_INPUT_INVALID'
  | 'LOCAL_KNOWLEDGE_BASE_REQUIRED'
  | 'KNOWLEDGE_BASE_NOT_FOUND'
  | 'UPLOAD_TOO_LARGE'
  | 'UNSUPPORTED_UPLOAD_CONTENT_TYPE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'STORAGE_UNAVAILABLE';

export type KnowledgeBaseUploadErrorStatus = 400 | 404 | 413 | 415 | 503;

export class KnowledgeBaseUploadError extends Error {
  public readonly code: KnowledgeBaseUploadErrorCode;
  public readonly status: KnowledgeBaseUploadErrorStatus;

  public constructor(
    code: KnowledgeBaseUploadErrorCode,
    message: string,
    status: KnowledgeBaseUploadErrorStatus,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'KnowledgeBaseUploadError';
    this.code = code;
    this.status = status;
  }
}

export function assertKnowledgeBaseDocumentUploadSize(
  size: number,
  constraints: KnowledgeBaseDocumentUploadConstraints = KNOWLEDGE_BASE_DOCUMENT_UPLOAD_CONSTRAINTS,
): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new KnowledgeBaseUploadError(
      'UPLOAD_INPUT_INVALID',
      'The uploaded file has an invalid size.',
      400,
    );
  }
  if (size > constraints.maxFileSizeBytes) {
    throw new KnowledgeBaseUploadError(
      'UPLOAD_TOO_LARGE',
      'File exceeds upload size limit.',
      413,
    );
  }
}
