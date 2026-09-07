import { useEffect, useState } from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router';
import { useNotification, useWarnAboutChange } from '@refinedev/core';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LoadingState } from '@/extensions/nocobase-ai-knowledge-base-components/app-shell-loading-state';
import { RouteDrawer } from '../extensions/nocobase-route-surfaces/index.js';
import { useRefineUnsavedChangesGuard } from '../extensions/nocobase-route-surfaces/use-refine-unsaved-changes.js';
import { useKnowledgeBaseSegment } from '@/extensions/nocobase-ai-knowledge-base-providers';
import {
  SegmentConflictAlert,
  SegmentEditor,
  SegmentPartialSaveAlert,
  SegmentPendingAlert,
  SegmentUnavailableState,
} from '@/extensions/nocobase-ai-knowledge-base-components/index';
import {
  isKnowledgeBaseDocumentProcessing,
  normalizeKnowledgeBaseError,
  type KnowledgeBaseSegment,
  type KnowledgeBaseSegmentQuestion,
} from '@/extensions/nocobase-ai-knowledge-base-providers';
import { knowledgeBaseLiveRoutes } from '../knowledge-base-routes.js';
import type { LiveDocumentOutletContext } from './document-page.js';
import { notifyKnowledgeBaseMutationError } from './notifications.js';
import { isLiveSegmentDrawerState, liveReturnTo } from './url-state.js';
import { useT } from '@/extensions/nocobase-ai-knowledge-base-components/locales';

type Draft = {
  title?: string;
  content: string;
  questions: KnowledgeBaseSegmentQuestion[];
};
type PartialSave = { message: string; contentHash: string };

const toDraft = (segment: KnowledgeBaseSegment): Draft => ({
  title: segment.title,
  content: segment.content || '',
  questions: (segment.questions || []).map((question) => ({ ...question })),
});

export default function SegmentRoute({
  routeContext,
}: {
  routeContext?: LiveDocumentOutletContext;
} = {}) {
  const { open: notify } = useNotification();
  const t = useT();
  const notificationText = (message: string) => t(message);
  const { knowledgeBaseKey, documentId, segmentUid } = useParams();
  const location = useLocation();
  const outletContext = useOutletContext<
    LiveDocumentOutletContext | undefined
  >();
  const context = routeContext ?? outletContext;
  const knowledgeBase = context?.knowledgeBase;
  const document = context?.document;
  const canMaintainDocument = context?.canMaintainDocument ?? false;
  const identity = `${knowledgeBaseKey ?? ''}\u0000${documentId ?? ''}\u0000${segmentUid ?? ''}`;
  const [stateIdentity, setStateIdentity] = useState(identity);
  const [draft, setDraft] = useState<Draft>();
  const [baseline, setBaseline] = useState<Draft>();
  const [serverSegment, setServerSegment] = useState<KnowledgeBaseSegment>();
  const [conflictSegment, setConflictSegment] =
    useState<KnowledgeBaseSegment>();
  const [partialSave, setPartialSave] = useState<PartialSave>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const { setWarnWhen } = useWarnAboutChange();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  const segmentState = useKnowledgeBaseSegment({
    knowledgeBaseKey: knowledgeBase?.key,
    documentId: document?.id,
    segmentUid,
  });
  const { service, segment: segmentRequest } = segmentState;
  const segment =
    stateIdentity === identity
      ? (serverSegment ?? segmentRequest.data)
      : undefined;
  const activeDraft = stateIdentity === identity ? draft : undefined;
  const activeBaseline = stateIdentity === identity ? baseline : undefined;
  const pending = isKnowledgeBaseDocumentProcessing(document);
  const returnToSegmentDrawer =
    isLiveSegmentDrawerState(location.state) ||
    new URLSearchParams(location.search).has('segmentsDocument');
  const documentRoute =
    knowledgeBaseKey && documentId
      ? `${knowledgeBaseLiveRoutes.document(knowledgeBaseKey, documentId)}${location.search}${location.hash}`
      : knowledgeBaseLiveRoutes.list;
  const workspaceRoute = knowledgeBaseKey
    ? `${knowledgeBaseLiveRoutes.workspace(knowledgeBaseKey)}${location.search}${location.hash}`
    : knowledgeBaseLiveRoutes.list;
  const fallback = returnToSegmentDrawer ? workspaceRoute : documentRoute;
  const closeTo =
    knowledgeBaseKey && documentId
      ? liveReturnTo(
          location.state,
          fallback,
          returnToSegmentDrawer
            ? knowledgeBaseLiveRoutes.workspace(knowledgeBaseKey)
            : knowledgeBaseLiveRoutes.document(knowledgeBaseKey, documentId),
        )
      : fallback;

  useEffect(() => {
    setStateIdentity(identity);
    setDraft(undefined);
    setBaseline(undefined);
    setServerSegment(undefined);
    setConflictSegment(undefined);
    setPartialSave(undefined);
    setSaveError(undefined);
  }, [identity]);

  useEffect(() => {
    if (stateIdentity === identity && segment && !activeDraft) {
      const next = toDraft(segment);
      setDraft(next);
      setBaseline(next);
    }
  }, [activeDraft, identity, segment, stateIdentity]);

  const dirty =
    !!activeDraft &&
    JSON.stringify(activeDraft) !== JSON.stringify(activeBaseline);
  useEffect(() => {
    setWarnWhen(dirty);
    return () => setWarnWhen(false);
  }, [dirty, setWarnWhen]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);

  const recoverConflict = async (error: unknown) => {
    const normalized = normalizeKnowledgeBaseError(error);
    if (
      !normalized.conflict ||
      !knowledgeBaseKey ||
      !documentId ||
      !segmentUid
    ) {
      const message = notificationText('Unable to save segment');
      notifyKnowledgeBaseMutationError(notify, message, error, message);
      return;
    }
    try {
      const current = await service.getSegment({
        knowledgeBaseKey,
        documentId,
        segmentUid,
      });
      if (current) {
        setConflictSegment(current);
      } else {
        setSaveError(
          t(
            'The segment changed and is no longer available. Refresh the document list.',
          ),
        );
      }
    } catch (reloadError) {
      const message = notificationText('Unable to reload the updated segment');
      notifyKnowledgeBaseMutationError(notify, message, reloadError, message);
    }
  };

  const save = async () => {
    if (
      !canMaintainDocument ||
      !activeDraft ||
      !segment ||
      pending ||
      !knowledgeBaseKey ||
      !documentId ||
      !segmentUid
    )
      return;
    setSaving(true);
    setSaveError(undefined);
    setPartialSave(undefined);
    try {
      let savedSegment: KnowledgeBaseSegment;
      try {
        savedSegment = await service.updateSegment({
          knowledgeBaseKey,
          documentId,
          segmentUid,
          title: activeDraft.title,
          content: activeDraft.content,
          contentHash: segment.contentHash || '',
        });
      } catch (error) {
        await recoverConflict(error);
        return;
      }

      const contentSaved: KnowledgeBaseSegment = {
        ...segment,
        ...savedSegment,
        title: activeDraft.title,
        content: activeDraft.content,
      };
      const serverDraft = toDraft(contentSaved);
      setServerSegment(contentSaved);
      // Persist the latest hash before the independent question mutation begins.
      setBaseline(serverDraft);

      try {
        const savedQuestions = await service.updateQuestions({
          knowledgeBaseKey,
          documentId,
          segmentUid,
          questions: activeDraft.questions,
          contentHash: contentSaved.contentHash || '',
        });
        const finalSegment: KnowledgeBaseSegment = {
          ...contentSaved,
          ...savedQuestions,
          questions: activeDraft.questions,
        };
        const finalDraft = toDraft(finalSegment);
        setServerSegment(finalSegment);
        setDraft(finalDraft);
        setBaseline(finalDraft);
        notify?.({
          type: 'success',
          message: notificationText('Segment saved'),
        });
      } catch (error) {
        const normalized = normalizeKnowledgeBaseError(error);
        if (normalized.conflict) {
          await recoverConflict(error);
          return;
        }
        // Do not repeat updateSegment. Only the question mutation is safe to retry now.
        setPartialSave({
          message: normalized.message,
          contentHash: contentSaved.contentHash || '',
        });
        setSaveError(undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const retryQuestions = async () => {
    if (
      !canMaintainDocument ||
      !activeDraft ||
      !partialSave ||
      !knowledgeBaseKey ||
      !documentId ||
      !segmentUid ||
      pending
    )
      return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const savedQuestions = await service.updateQuestions({
        knowledgeBaseKey,
        documentId,
        segmentUid,
        questions: activeDraft.questions,
        contentHash: partialSave.contentHash,
      });
      const finalSegment: KnowledgeBaseSegment = {
        ...(serverSegment ?? segmentRequest.data!),
        ...savedQuestions,
        questions: activeDraft.questions,
      };
      const finalDraft = toDraft(finalSegment);
      setServerSegment(finalSegment);
      setDraft(finalDraft);
      setBaseline(finalDraft);
      setPartialSave(undefined);
      notify?.({
        type: 'success',
        message: notificationText('Related questions saved'),
      });
    } catch (error) {
      const normalized = normalizeKnowledgeBaseError(error);
      if (normalized.conflict) {
        await recoverConflict(error);
      } else {
        const message = notificationText('Unable to save related questions');
        notifyKnowledgeBaseMutationError(notify, message, error, message);
      }
    } finally {
      setSaving(false);
    }
  };

  const conflict = stateIdentity === identity ? conflictSegment : undefined;
  const loading = stateIdentity !== identity || segmentRequest.loading;
  const unavailable =
    !knowledgeBase ||
    !document ||
    !segment ||
    !activeDraft ||
    document.knowledgeBaseKey !== knowledgeBase.key;
  if (loading) {
    return (
      <RouteDrawer
        title={t('Edit segment')}
        closeLabel={t('Close')}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <LoadingState className='min-h-48' />
        {confirmation}
      </RouteDrawer>
    );
  }

  if (unavailable) {
    return (
      <RouteDrawer
        title={t('Edit segment')}
        closeLabel={t('Close')}
        closeTo={closeTo}
        beforeClose={beforeClose}
      >
        <div className='p-5'>
          <SegmentUnavailableState />
        </div>
        {confirmation}
      </RouteDrawer>
    );
  }
  const resolvedSegment = segment;
  const resolvedDraft = activeDraft;

  return (
    <RouteDrawer
      title={t('Edit segment')}
      closeLabel={t('Close')}
      closeTo={closeTo}
      beforeClose={beforeClose}
    >
      <div className='space-y-4 overflow-auto p-5'>
        {pending ? <SegmentPendingAlert /> : null}
        {saveError ? (
          <Alert variant='destructive'>
            <AlertTitle>{t('Unable to save segment')}</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        {partialSave ? (
          <SegmentPartialSaveAlert
            message={partialSave.message}
            onRetryQuestions={() => void retryQuestions()}
            retrying={saving || !canMaintainDocument}
          />
        ) : null}
        {conflict ? (
          <SegmentConflictAlert
            localDraft={resolvedDraft}
            serverSegment={conflict}
            onAdoptServer={() => {
              const next = toDraft(conflict);
              setServerSegment(conflict);
              setDraft(next);
              setBaseline(next);
              setConflictSegment(undefined);
            }}
            onKeepDraft={() => {
              setServerSegment(conflict);
              setBaseline(toDraft(conflict));
              setConflictSegment(undefined);
            }}
          />
        ) : null}
        <SegmentEditor
          segment={resolvedSegment}
          draft={resolvedDraft}
          onDraftChange={setDraft}
          onSave={() => void save()}
          saving={saving}
          disabled={
            !canMaintainDocument || pending || !!partialSave || !!conflict
          }
        />
      </div>
      {confirmation}
    </RouteDrawer>
  );
}
