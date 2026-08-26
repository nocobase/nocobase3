import { useLocation, useOutletContext, useParams } from 'react-router';
import { RouteDrawer } from '../extensions/nocobase-route-surfaces/index.js';
import { RetrievalResultDetail } from '../components/index.js';
import { knowledgeBaseLiveRoutes } from '../knowledge-base-routes.js';
import type { KnowledgeBaseWorkspaceOutletContext } from './knowledge-base-workspace-page.js';
import { liveReturnTo } from './url-state.js';
import { useT } from '../locales/index.js';

export default function RetrievalResultRoute({
  retrievalResults: routeResults,
}: {
  retrievalResults?: KnowledgeBaseWorkspaceOutletContext['retrievalResults'];
} = {}) {
  const t = useT();
  const { knowledgeBaseKey, resultIndex } = useParams();
  const location = useLocation();
  const outletContext = useOutletContext<
    KnowledgeBaseWorkspaceOutletContext | undefined
  >();
  const retrievalResults =
    routeResults ?? outletContext?.retrievalResults ?? [];
  const index = Number.parseInt(resultIndex || '', 10);
  const result = Number.isInteger(index) ? retrievalResults[index] : undefined;
  const fallback = knowledgeBaseKey
    ? `${knowledgeBaseLiveRoutes.workspace(knowledgeBaseKey)}${location.search}${location.hash}`
    : knowledgeBaseLiveRoutes.list;
  const closeTo = knowledgeBaseKey
    ? liveReturnTo(
        location.state,
        fallback,
        knowledgeBaseLiveRoutes.workspace(knowledgeBaseKey),
      )
    : fallback;

  return (
    <RouteDrawer
      title={result?.title || result?.filename || t('Retrieval result')}
      closeLabel={t('Close')}
      closeTo={closeTo}
    >
      <div className='p-5'>
        <RetrievalResultDetail result={result} showTitle={false} />
      </div>
    </RouteDrawer>
  );
}
