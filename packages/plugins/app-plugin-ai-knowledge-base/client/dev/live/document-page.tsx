import {
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';
import { Button } from '../../components/ui/button.js';
import { LoadingState } from '../../components/app-shell-loading-state.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '../../components/ui/empty.js';
import { FileText } from 'lucide-react';
import {
  useKnowledgeBase,
  useKnowledgeBaseDocument,
  useKnowledgeBaseSegment,
} from '../../hooks/index.js';
import {
  KnowledgeBaseDirectoryError,
  SegmentList,
  SegmentTable,
} from '../../components/index.js';
import {
  isLocalKnowledgeBase,
  canMaintainKnowledgeBaseDocument,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
} from '../../providers/index.js';
import { knowledgeBaseLiveRoutes } from '../knowledge-base-routes.js';
import {
  isLiveSegmentDrawerState,
  liveLocationPath,
  liveReturnTo,
} from './url-state.js';
import { useT } from '../../locales/index.js';
import type { KnowledgeBaseWorkspaceOutletContext } from './knowledge-base-workspace-page.js';

export type LiveDocumentOutletContext = {
  knowledgeBase: KnowledgeBase;
  document: KnowledgeBaseDocument;
  canMaintainDocument: boolean;
};

export default function LiveDocumentPage() {
  const t = useT();
  const workspaceContext = useOutletContext<
    KnowledgeBaseWorkspaceOutletContext | undefined
  >();
  const { knowledgeBaseKey, documentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const openedFromSegmentDrawer =
    isLiveSegmentDrawerState(location.state) ||
    new URLSearchParams(location.search).has('segmentsDocument');
  const knowledgeBase = useKnowledgeBase({
    knowledgeBaseKey,
    knowledgeBase: workspaceContext?.knowledgeBase,
  });
  const base = knowledgeBase.knowledgeBase;
  const local = !!base.data && isLocalKnowledgeBase(base.data);
  const documentState = useKnowledgeBaseDocument({
    knowledgeBaseKey: base.data?.key,
    documentId,
    document: { enabled: local },
  });
  const document = documentState.document;
  const isAuthorizedLocalDocument =
    local &&
    !!document.data &&
    document.data.knowledgeBaseKey === base.data!.key;
  const canMaintainDocument =
    !!document.data && canMaintainKnowledgeBaseDocument(document.data);
  const segmentState = useKnowledgeBaseSegment({
    knowledgeBaseKey: base.data?.key,
    documentId: document.data?.id,
    segments: {
      enabled: local && !!document.data && !openedFromSegmentDrawer,
      page: 1,
      pageSize: 20,
    },
  });
  const segments = segmentState.segments;
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

  if (base.loading && !base.data) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <LoadingState className='min-h-64' />
      </main>
    );
  }
  if (base.error || !base.data) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <KnowledgeBaseDirectoryError
          error={
            base.error ??
            new Error(t('Knowledge base unavailable or not authorized.'))
          }
          onRetry={base.retry}
        />
      </main>
    );
  }
  if (!local) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <KnowledgeBaseDirectoryError
          error={
            new Error(
              t(
                'Documents and segments are unavailable for this knowledge base type.',
              ),
            )
          }
        />
      </main>
    );
  }
  if (document.loading && !document.data) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <LoadingState className='min-h-64' />
      </main>
    );
  }
  if (document.error || !document.data || !isAuthorizedLocalDocument) {
    return (
      <main className='px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
        <KnowledgeBaseDirectoryError
          error={
            document.error ??
            new Error(
              t(
                'Document unavailable or not authorized for this knowledge base.',
              ),
            )
          }
          onRetry={document.retry}
        />
      </main>
    );
  }

  const open = (uid: string) =>
    navigate(
      `${knowledgeBaseLiveRoutes.segment(base.data!.key, document.data!.id, uid)}${location.search}${location.hash}`,
      { state: { from: liveLocationPath(location) } },
    );
  const outletContext: LiveDocumentOutletContext = {
    knowledgeBase: base.data,
    document: document.data,
    canMaintainDocument,
  };

  if (openedFromSegmentDrawer) return <Outlet context={outletContext} />;
  return (
    <main className='space-y-5 px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold'>
            {document.data.title || document.data.filename || t('Document')}
          </h1>
          <p className='text-muted-foreground'>
            {t('{{count}} segments', {
              count: document.data.segmentCount ?? 0,
            })}
          </p>
        </div>
        <Button variant='outline' onClick={() => navigate(closeTo)}>
          {t('Back to workspace')}
        </Button>
      </header>
      {!canMaintainDocument ? (
        <p className='rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
          {t(
            'You can view this shared document. Only its uploader can change segments, re-index, or delete it.',
          )}
        </p>
      ) : null}
      {segments.loading && !segments.data ? (
        <LoadingState className='min-h-48' />
      ) : segments.error ? (
        <KnowledgeBaseDirectoryError
          error={segments.error}
          onRetry={segments.retry}
        />
      ) : segments.data?.rows.length ? (
        <>
          <div className='hidden md:block'>
            <SegmentTable
              segments={segments.data.rows}
              onOpen={(segment) => open(segment.uid)}
            />
          </div>
          <div className='md:hidden'>
            <SegmentList
              segments={segments.data.rows}
              onOpen={(segment) => open(segment.uid)}
            />
          </div>
        </>
      ) : (
        <Empty className='min-h-48 border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <FileText aria-hidden='true' />
            </EmptyMedia>
            <EmptyDescription>
              {t('This document has no segments yet.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <Outlet context={outletContext} />
    </main>
  );
}
