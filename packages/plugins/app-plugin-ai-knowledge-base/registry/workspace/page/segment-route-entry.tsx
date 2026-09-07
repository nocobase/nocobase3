import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { LoadingState } from '@/extensions/nocobase-ai-knowledge-base-components/app-shell-loading-state';
import {
  useKnowledgeBase,
  useKnowledgeBaseDocument,
} from '@/extensions/nocobase-ai-knowledge-base-providers';
import { canMaintainKnowledgeBaseDocument } from '@/extensions/nocobase-ai-knowledge-base-providers';
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
