import { useMemo } from 'react';
import { useKnowledgeBaseService } from '../providers/context.js';
import type { KnowledgeBaseService } from '../providers/service/knowledge-base.js';
import type { RecordId } from '../providers/types.js';
import { serviceKey, useRequest } from './shared.js';

type PaginatedDocumentRequest = {
  knowledgeBaseKey: string;
  page: number;
  pageSize: number;
  query?: string;
};

function useAllKnowledgeBaseDocuments(
  knowledgeBaseKey: string | undefined,
  service: KnowledgeBaseService | undefined,
) {
  return useRequest(
    ['documents', knowledgeBaseKey, 'all', serviceKey(service)],
    (signal) =>
      service!.listDocuments({
        mode: 'all',
        knowledgeBaseKey: knowledgeBaseKey!,
        signal,
      }),
    !!service && !!knowledgeBaseKey,
  );
}

function usePaginatedKnowledgeBaseDocuments(
  request: PaginatedDocumentRequest | undefined,
  service: KnowledgeBaseService | undefined,
) {
  const key = useMemo(
    () => [
      'documents',
      request?.knowledgeBaseKey,
      request?.page,
      request?.pageSize,
      request?.query,
      serviceKey(service),
    ],
    [
      request?.knowledgeBaseKey,
      request?.page,
      request?.pageSize,
      request?.query,
      service,
    ],
  );
  return useRequest(
    key,
    (signal) => service!.listDocuments({ mode: 'server', ...request!, signal }),
    !!service && !!request?.knowledgeBaseKey,
  );
}

function useKnowledgeBaseDocumentRequest(
  request: { knowledgeBaseKey: string; documentId: RecordId } | undefined,
  service: KnowledgeBaseService | undefined,
) {
  return useRequest(
    [
      'document',
      request?.knowledgeBaseKey,
      request?.documentId,
      serviceKey(service),
    ],
    (signal) => service!.getDocument({ ...request!, signal }),
    !!service &&
      !!request?.knowledgeBaseKey &&
      request?.documentId !== undefined,
  );
}

export type KnowledgeBaseDocumentsOptions = {
  mode?: 'all' | 'paginated';
  page?: number;
  pageSize?: number;
  query?: string;
  enabled?: boolean;
};

export type UseKnowledgeBaseDocumentOptions = {
  knowledgeBaseKey?: string;
  documentId?: RecordId;
  documents?: KnowledgeBaseDocumentsOptions;
  document?: { enabled?: boolean };
  upload?: {
    enabled?: boolean;
    includeConstraints?: boolean;
    includeZipEncodingOptions?: boolean;
  };
};

/** Document-level state: document lists, one document, and upload metadata. */
export function useKnowledgeBaseDocument(
  options: UseKnowledgeBaseDocumentOptions = {},
) {
  const service = useKnowledgeBaseService();
  const knowledgeBaseKey = options.knowledgeBaseKey;
  const documentsMode = options.documents?.mode;
  const documentsEnabled =
    options.documents?.enabled !== false && !!knowledgeBaseKey;
  const documentsAll = useAllKnowledgeBaseDocuments(
    documentsMode === 'all' && documentsEnabled ? knowledgeBaseKey : undefined,
    documentsMode === 'all' && documentsEnabled ? service : undefined,
  );
  const documentsPaginated = usePaginatedKnowledgeBaseDocuments(
    documentsMode === 'paginated' && documentsEnabled
      ? {
          knowledgeBaseKey: knowledgeBaseKey,
          page: options.documents?.page ?? 1,
          pageSize: options.documents?.pageSize ?? 20,
          query: options.documents?.query,
        }
      : undefined,
    documentsMode === 'paginated' && documentsEnabled ? service : undefined,
  );
  const documentEnabled =
    options.document?.enabled !== false &&
    !!knowledgeBaseKey &&
    options.documentId !== undefined;
  const document = useKnowledgeBaseDocumentRequest(
    documentEnabled
      ? { knowledgeBaseKey: knowledgeBaseKey, documentId: options.documentId! }
      : undefined,
    documentEnabled ? service : undefined,
  );
  const uploadEnabled = options.upload?.enabled !== false && !!knowledgeBaseKey;
  const includeConstraints =
    options.upload?.includeConstraints ?? options.upload !== undefined;
  const includeZipEncodingOptions =
    options.upload?.includeZipEncodingOptions === true;
  const uploadConstraints = useRequest(
    ['upload-constraints', knowledgeBaseKey, serviceKey(service)],
    (signal) =>
      service.getUploadConstraints({
        knowledgeBaseKey: knowledgeBaseKey!,
        signal,
      }),
    uploadEnabled && includeConstraints,
  );
  const zipEncodingOptions = useRequest(
    ['zip-encoding-options', knowledgeBaseKey, serviceKey(service)],
    (signal) =>
      service.getZipFilenameEncodingOptions({
        knowledgeBaseKey: knowledgeBaseKey!,
        signal,
      }),
    uploadEnabled && includeZipEncodingOptions,
  );

  return {
    service,
    documents: {
      all: documentsAll,
      paginated: documentsPaginated,
    },
    document,
    upload: {
      constraints: uploadConstraints,
      zipEncodingOptions,
    },
  };
}
