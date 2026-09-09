const root = '/dev/ai-knowledge-base/workspace';

export const knowledgeBaseLiveRoutes = {
  list: root,
  workspace: (knowledgeBaseKey: string): string =>
    `${root}/${encodeURIComponent(knowledgeBaseKey)}`,
  document: (knowledgeBaseKey: string, documentId: string | number): string =>
    `${root}/${encodeURIComponent(knowledgeBaseKey)}/documents/${encodeURIComponent(String(documentId))}`,
  segment: (
    knowledgeBaseKey: string,
    documentId: string | number,
    segmentUid: string,
  ): string =>
    `${root}/${encodeURIComponent(knowledgeBaseKey)}/documents/${encodeURIComponent(String(documentId))}/segments/${encodeURIComponent(segmentUid)}`,
  upload: (knowledgeBaseKey: string): string =>
    `${root}/${encodeURIComponent(knowledgeBaseKey)}/upload`,
  retrieval: (knowledgeBaseKey: string, resultIndex: number): string =>
    `${root}/${encodeURIComponent(knowledgeBaseKey)}/retrieval/${encodeURIComponent(String(resultIndex))}`,
};
