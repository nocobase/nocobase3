import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { LoadingState } from '../../components/app-shell-loading-state.js';
import {
  useKnowledgeBase,
  useKnowledgeBaseDocument,
} from '../../hooks/index.js';
import { canMaintainKnowledgeBaseDocument } from '../../providers/index.js';
import SegmentRoute from './segment-route.js';

export default function SegmentRouteEntry(): ReactElement {
  const { knowledgeBaseKey, documentId } = useParams();
  const knowledgeBaseState = useKnowledgeBase({ knowledgeBaseKey });
  const base = knowledgeBaseState.knowledgeBase;
  const documentState = useKnowledgeBaseDocument({
    knowledgeBaseKey: base.data?.key,
    documentId,
  });
  const document = documentState.document;

  if (!base.data || !document.data) {
    return <LoadingState className='min-h-64' />;
  }

  return (
    <SegmentRoute
      routeContext={{
        knowledgeBase: base.data,
        document: document.data,
        canMaintainDocument: canMaintainKnowledgeBaseDocument(document.data),
      }}
    />
  );
}
