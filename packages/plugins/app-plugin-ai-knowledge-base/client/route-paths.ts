export {
  aiEmployeePath,
  llmServicePath,
  knowledgeBasePath,
  knowledgeBaseListPath,
  vectorDatabasesPath,
} from '@nocobase/app-plugin-ai-employee/client';

import { knowledgeBaseRoutePath } from '@nocobase/app-plugin-ai-employee/client';

export const knowledgeBaseWorkspacePath = (knowledgeBaseKey: string): string =>
  `${knowledgeBaseRoutePath}/${encodeURIComponent(knowledgeBaseKey)}`;
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
