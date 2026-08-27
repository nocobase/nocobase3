export const aiSettingsPath = '/ai/settings';
export const aiEmployeePath = '/ai/ai-employee';
export const knowledgeBasePath = '/ai/knowledge-base';
export const knowledgeBaseListPath = knowledgeBasePath;
export const vectorDatabasesPath = '/ai/vector-database';
export const knowledgeBaseWorkspacePath = (knowledgeBaseKey: string): string =>
  `${knowledgeBasePath}/${encodeURIComponent(knowledgeBaseKey)}`;
export const knowledgeBaseDocumentPath = (
  knowledgeBaseKey: string,
  documentId: string | number,
): string =>
  `${knowledgeBaseWorkspacePath(knowledgeBaseKey)}/documents/${encodeURIComponent(String(documentId))}`;
export const knowledgeBaseSegmentPath = (
  knowledgeBaseKey: string,
  documentId: string | number,
  segmentUid: string,
): string =>
  `${knowledgeBaseDocumentPath(knowledgeBaseKey, documentId)}/segments/${encodeURIComponent(segmentUid)}`;
export const knowledgeBaseUploadPath = (knowledgeBaseKey: string): string =>
  `${knowledgeBaseWorkspacePath(knowledgeBaseKey)}/upload`;
export const knowledgeBaseRetrievalPath = (
  knowledgeBaseKey: string,
  resultIndex: number,
): string =>
  `${knowledgeBaseWorkspacePath(knowledgeBaseKey)}/retrieval/${encodeURIComponent(String(resultIndex))}`;
