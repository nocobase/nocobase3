import { useKnowledgeBaseService } from '../providers/context.js';
import type { KnowledgeBaseService } from '../providers/service/knowledge-base.js';
import type { RecordId, SegmentRequest } from '../providers/types.js';
import { serviceKey, useRequest } from './shared.js';

type PaginatedSegmentRequest = {
  knowledgeBaseKey: string;
  documentId: RecordId;
  page: number;
  pageSize: number;
  keyword?: string;
  enabled?: boolean;
};

function useKnowledgeBaseSegmentsRequest(
  request: PaginatedSegmentRequest | undefined,
  service: KnowledgeBaseService | undefined,
) {
  return useRequest(
    [
      'segments',
      request?.knowledgeBaseKey,
      request?.documentId,
      request?.page,
      request?.pageSize,
      request?.keyword,
      request?.enabled,
      serviceKey(service),
    ],
    (signal) => service!.listSegments({ mode: 'server', ...request!, signal }),
    !!service &&
      !!request?.knowledgeBaseKey &&
      request?.documentId !== undefined,
  );
}

function useKnowledgeBaseSegmentRequest(
  request: SegmentRequest | undefined,
  service: KnowledgeBaseService | undefined,
) {
  return useRequest(
    [
      'segment',
      request?.knowledgeBaseKey,
      request?.documentId,
      request?.segmentUid,
      serviceKey(service),
    ],
    (signal) => service!.getSegment({ ...request!, signal }),
    !!service &&
      !!request?.knowledgeBaseKey &&
      request?.documentId !== undefined &&
      !!request?.segmentUid,
  );
}

export type KnowledgeBaseSegmentsOptions = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  enabledOnly?: boolean;
  enabled?: boolean;
};

export type UseKnowledgeBaseSegmentOptions = {
  knowledgeBaseKey?: string;
  documentId?: RecordId;
  segmentUid?: string;
  segments?: KnowledgeBaseSegmentsOptions;
  segment?: { enabled?: boolean };
};

/** Segment-level state: segment list and one segment. */
export function useKnowledgeBaseSegment(
  options: UseKnowledgeBaseSegmentOptions = {},
) {
  const service = useKnowledgeBaseService();
  const knowledgeBaseKey = options.knowledgeBaseKey;
  const documentId = options.documentId;
  const segmentsEnabled =
    options.segments?.enabled !== false &&
    !!knowledgeBaseKey &&
    documentId !== undefined;
  const segments = useKnowledgeBaseSegmentsRequest(
    segmentsEnabled
      ? {
          knowledgeBaseKey: knowledgeBaseKey,
          documentId: documentId,
          page: options.segments?.page ?? 1,
          pageSize: options.segments?.pageSize ?? 20,
          keyword: options.segments?.keyword,
          enabled: options.segments?.enabledOnly ? true : undefined,
        }
      : undefined,
    segmentsEnabled ? service : undefined,
  );
  const segmentEnabled =
    options.segment?.enabled !== false &&
    !!knowledgeBaseKey &&
    documentId !== undefined &&
    !!options.segmentUid;
  const segment = useKnowledgeBaseSegmentRequest(
    segmentEnabled
      ? {
          knowledgeBaseKey: knowledgeBaseKey,
          documentId: documentId,
          segmentUid: options.segmentUid!,
        }
      : undefined,
    segmentEnabled ? service : undefined,
  );

  return { service, segments, segment };
}
