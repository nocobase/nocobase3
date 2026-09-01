import { lazy, Suspense, type ReactElement } from 'react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
} from 'react-router';
import KnowledgeBasesPage from './page/knowledge-bases-page.js';
import {
  knowledgeBaseRoutePath,
  vectorDatabaseRoutePath,
} from '@nocobase/app-plugin-ai-employee/client';

const DocumentPage = lazy(() => import('./page/document-page.js'));
const RetrievalResultRouteEntry = lazy(
  () => import('./page/retrieval-result-route-entry.js'),
);
const SegmentRouteEntry = lazy(() => import('./page/segment-route-entry.js'));
const UploadController = lazy(() => import('./page/upload-controller.js'));
const WorkspaceRoute = lazy(() => import('./page/workspace-route.js'));
const VectorDatabasesPage = lazy(
  () => import('./page/vector-databases-page.js'),
);

export function KnowledgeBaseSettingsPage(): ReactElement {
  return (
    <UNSAFE_RouteContext.Provider
      value={{ matches: [], outlet: null, isDataRoute: false }}
    >
      <UNSAFE_LocationContext.Provider value={null!}>
        <MemoryRouter initialEntries={['/settings/ai']}>
          <Suspense
            fallback={
              <main className='p-8 text-sm text-muted-foreground'>
                Loading…
              </main>
            }
          >
            <Routes>
              <Route path='/settings/ai' element={<KnowledgeBasesPage />} />
              <Route
                path={`${knowledgeBaseRoutePath}/:knowledgeBaseKey`}
                element={<WorkspaceRoute />}
              >
                <Route
                  path='documents/:documentId/segments/:segmentUid'
                  element={<SegmentRouteEntry />}
                />
              </Route>
              <Route
                path={`${knowledgeBaseRoutePath}/:knowledgeBaseKey/documents/:documentId`}
                element={<DocumentPage />}
              />
              <Route
                path={`${knowledgeBaseRoutePath}/:knowledgeBaseKey/upload`}
                element={<UploadController />}
              />
              <Route
                path={`${knowledgeBaseRoutePath}/:knowledgeBaseKey/retrieval/:resultIndex`}
                element={<RetrievalResultRouteEntry />}
              />
              <Route
                path={vectorDatabaseRoutePath}
                element={<VectorDatabasesPage />}
              />
              <Route
                path='*'
                element={<Navigate to='/settings/ai' replace />}
              />
            </Routes>
          </Suspense>
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
    </UNSAFE_RouteContext.Provider>
  );
}

export function VectorDatabaseSettingsPage(): ReactElement {
  return <VectorDatabasesPage />;
}
