import {
  knowledgeBaseDocumentPath,
  knowledgeBaseListPath,
  knowledgeBaseRetrievalPath,
  knowledgeBaseSegmentPath,
  knowledgeBaseUploadPath,
  knowledgeBaseWorkspacePath,
  vectorDatabasesPath,
} from './route-paths.js';
export const knowledgeBaseLiveRoutes = {
  list: knowledgeBaseListPath,
  vectors: vectorDatabasesPath,
  workspace: knowledgeBaseWorkspacePath,
  document: knowledgeBaseDocumentPath,
  segment: knowledgeBaseSegmentPath,
  upload: knowledgeBaseUploadPath,
  retrieval: knowledgeBaseRetrievalPath,
};
