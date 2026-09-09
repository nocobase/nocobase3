import type { ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { LoadingState } from '../../components/app-shell-loading-state.js';
import { useKnowledgeBase } from '../../hooks/index.js';
import RetrievalResultRoute from './retrieval-result-route.js';
import { parseKnowledgeBaseWorkspaceState } from './url-state.js';

export default function RetrievalResultRouteEntry(): ReactElement {
  const { knowledgeBaseKey } = useParams();
  const [search] = useSearchParams();
  const workspace = parseKnowledgeBaseWorkspaceState(search);
  const state = useKnowledgeBase({
    knowledgeBaseKey,
    retrieval: {
      query: workspace.retrievalQuery,
      topK: workspace.topK,
      score: workspace.score,
    },
  });

  if (state.retrieval.loading && !state.retrieval.data) {
    return <LoadingState className='min-h-64' />;
  }

  return <RetrievalResultRoute retrievalResults={state.retrieval.data ?? []} />;
}
