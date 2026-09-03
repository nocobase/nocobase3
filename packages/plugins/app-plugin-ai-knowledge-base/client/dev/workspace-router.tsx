import type { ReactElement } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
} from 'react-router';

import KnowledgeBaseDocumentPage from './live/document-page.js';
import KnowledgeBaseWorkspacePage from './live/knowledge-base-workspace-page.js';
import KnowledgeBasesPage from './live/knowledge-bases-page.js';
import KnowledgeBaseRetrievalPage from './live/retrieval-result-route-entry.js';
import KnowledgeBaseSegmentPage from './live/segment-route-entry.js';
import KnowledgeBaseUploadPage from './live/upload-controller.js';

const workspacePath = '/dev/ai-knowledge-base/workspace';

/**
 * Keeps all workspace subpages inside the Demo component. The application
 * registers only the workspace entry route, while this isolated memory router
 * handles knowledge bases, documents, uploads, retrieval results, and segments.
 */
export default function KnowledgeBaseDevWorkspaceRouter(): ReactElement {
  return (
    <UNSAFE_RouteContext.Provider
      value={{ matches: [], outlet: null, isDataRoute: false }}
    >
      <UNSAFE_LocationContext.Provider value={null!}>
        <MemoryRouter initialEntries={[workspacePath]}>
          <Routes>
            <Route path={workspacePath} element={<KnowledgeBasesPage />} />
            <Route
              path={`${workspacePath}/:knowledgeBaseKey`}
              element={<KnowledgeBaseWorkspacePage />}
            >
              <Route
                path='retrieval/:resultIndex'
                element={<KnowledgeBaseRetrievalPage />}
              />
              <Route path='upload' element={<KnowledgeBaseUploadPage />} />
              <Route
                path='documents/:documentId'
                element={<KnowledgeBaseDocumentPage />}
              >
                <Route
                  path='segments/:segmentUid'
                  element={<KnowledgeBaseSegmentPage />}
                />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
    </UNSAFE_RouteContext.Provider>
  );
}
