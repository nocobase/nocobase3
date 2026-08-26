import { useEffect, useMemo, useState } from 'react';
import { useNotification } from '@refinedev/core';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { useKnowledgeBase, useKnowledgeBaseDocument } from '../hooks/index.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb.js';
import { Button } from '../components/ui/button.js';
import {
  CircleAlert,
  CircleFadingArrowUpIcon,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { LoadingState } from '../components/app-shell-loading-state.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '../components/ui/empty.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs.js';
import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import {
  PagePagination,
  DocumentTable,
  KnowledgeBaseDirectoryError,
  KnowledgeBaseHitTests,
} from '../components/index.js';
import {
  isLocalKnowledgeBase,
  canMaintainKnowledgeBaseDocument,
  normalizeKnowledgeBaseError,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
  type RecordId,
  type KnowledgeBaseSearchResult,
} from '../providers/index.js';
import { knowledgeBaseLiveRoutes } from '../knowledge-base-routes.js';
import {
  liveLocationPath,
  liveReturnTo,
  knowledgeBaseWorkspaceSearch,
  parseKnowledgeBaseWorkspaceState,
} from './url-state.js';
import { DocumentSegmentsDrawer } from './document-segments-drawer.js';
import { notifyKnowledgeBaseMutationError } from './notifications.js';
import { useT } from '../locales/index.js';

type DocumentAction = { kind: 'vectorize' | 'delete'; documentIds: RecordId[] };

export type KnowledgeBaseWorkspaceOutletContext = {
  knowledgeBase: KnowledgeBase;
  retrievalResults: KnowledgeBaseSearchResult[];
  onDocumentsRefresh: () => void;
};

export default function KnowledgeBaseWorkspacePage() {
  const t = useT();
  const { open: notify } = useNotification();
  const { knowledgeBaseKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const workspace = parseKnowledgeBaseWorkspaceState(params);
  const [queryDraft, setQueryDraft] = useState('');
  const [documentAction, setDocumentAction] = useState<DocumentAction>();
  const [segmentDocument, setSegmentDocument] =
    useState<KnowledgeBaseDocument>();
  const [segmentDrawerOpen, setSegmentDrawerOpen] = useState(false);
  const [documentActionPending, setDocumentActionPending] = useState(false);
  const knowledgeBase = useKnowledgeBase({
    knowledgeBaseKey,
    retrieval: {
      query: workspace.retrievalQuery,
      topK: workspace.topK,
      score: workspace.score,
    },
  });
  const base = knowledgeBase.knowledgeBase;
  const local = !!base.data && isLocalKnowledgeBase(base.data);
  const documentState = useKnowledgeBaseDocument({
    knowledgeBaseKey: base.data?.key,
    documents: {
      enabled: local,
      mode: 'paginated',
      page: workspace.documentPage,
      pageSize: workspace.documentPageSize,
    },
  });
  const { service } = documentState;
  const documents = documentState.documents.paginated;
  const retrieval = knowledgeBase.retrieval;
  const hasSubmittedRetrievalQuery = !!workspace.retrievalQuery;
  const listReturnTo = liveReturnTo(
    location.state,
    knowledgeBaseLiveRoutes.list,
    knowledgeBaseLiveRoutes.list,
  );

  useEffect(() => {
    setQueryDraft('');
  }, [knowledgeBaseKey]);

  const setWorkspace = (next: Partial<typeof workspace>, replace = true) => {
    navigate(
      {
        pathname: location.pathname,
        search: knowledgeBaseWorkspaceSearch({ ...workspace, ...next }),
        hash: location.hash,
      },
      { replace },
    );
  };

  const resetHitTests = () => {
    setQueryDraft('');
    setWorkspace({ retrievalQuery: '', topK: 4, score: 0.6 });
  };
  useEffect(() => {
    if (!base.data || !workspace.segmentDocumentId) {
      return;
    }
    const requestedDocument = documents.data?.rows.find(
      (document) => String(document.id) === workspace.segmentDocumentId,
    );
    if (!requestedDocument) return;
    setSegmentDocument(requestedDocument);
    setSegmentDrawerOpen(true);
  }, [base.data, documents.data, workspace.segmentDocumentId]);

  const runDocumentAction = async () => {
    const activeAction = documentAction;
    if (
      !activeAction ||
      !base.data ||
      documentActionPending ||
      !activeAction.documentIds.length
    )
      return;
    setDocumentActionPending(true);
    try {
      if (activeAction.kind === 'vectorize') {
        await service.vectorizeDocuments({
          knowledgeBaseKey: base.data.key,
          documentIds: activeAction.documentIds,
        });
      } else {
        await service.deleteDocuments({
          documentIds: activeAction.documentIds,
        });
      }
      notify?.({
        type: 'success',
        message:
          activeAction.kind === 'vectorize'
            ? t('Re-indexing submitted')
            : t('Documents deleted'),
        description:
          activeAction.kind === 'vectorize'
            ? t(
                'Re-indexing was submitted. The status will update when processing finishes.',
              )
            : undefined,
      });
      setDocumentAction(undefined);
      documents.retry();
    } catch (error) {
      const message = t('Document action failed');
      notifyKnowledgeBaseMutationError(notify, message, error, message);
      setDocumentAction(undefined);
    } finally {
      setDocumentActionPending(false);
    }
  };

  const downloadDocument = async (record: KnowledgeBaseDocument) => {
    try {
      const downloadable = record.url
        ? record
        : await service.getDocument({
            knowledgeBaseKey: record.knowledgeBaseKey,
            documentId: record.id,
          });
      if (!downloadable.url) {
        throw new Error(t('The document file is unavailable.'));
      }

      const suffix = downloadable.extname
        ? downloadable.extname.startsWith('.')
          ? downloadable.extname
          : `.${downloadable.extname}`
        : '';
      const title = downloadable.title || record.title;
      const filename = title
        ? `${title}${suffix}`
        : downloadable.filename || `document-${downloadable.id}${suffix}`;
      const response = await fetch(
        nocobaseClient.resolveUrl(downloadable.url),
        {
          headers: nocobaseClient.getHeaders({
            method: 'GET',
            withAclMeta: false,
            headers: { Accept: '*/*' },
          }),
        },
      );
      if (!response.ok) {
        throw new Error(t('The document file is unavailable.'));
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.rel = 'noopener noreferrer';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      notifyKnowledgeBaseMutationError(
        notify,
        t('Download failed'),
        error,
        t('The document file is unavailable.'),
      );
    }
  };
  const outletContext = useMemo<
    KnowledgeBaseWorkspaceOutletContext | undefined
  >(
    () =>
      base.data
        ? {
            knowledgeBase: base.data,
            retrievalResults: retrieval.data ?? [],
            onDocumentsRefresh: documents.retry,
          }
        : undefined,
    [base.data, documents.retry, retrieval.data],
  );

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

  return (
    <main className='space-y-5 px-4 pb-12 pt-4 sm:px-6 lg:px-8'>
      <header className='space-y-2'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={listReturnTo} />}>
                {t('Knowledge bases')}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{base.data.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {base.data.name}
        </h1>
      </header>

      <Tabs
        defaultValue={local ? 'documents' : 'retrieve'}
        onValueChange={(value) => {
          if (value === 'retrieve') resetHitTests();
        }}
        className='gap-0'
      >
        <div className='border-b'>
          <TabsList variant='line' className='h-9'>
            {local ? (
              <TabsTrigger value='documents'>{t('Documents')}</TabsTrigger>
            ) : null}
            <TabsTrigger value='retrieve'>{t('Hit tests')}</TabsTrigger>
          </TabsList>
        </div>
        {local ? (
          <TabsContent value='documents' className='mt-5 space-y-3'>
            <section className='space-y-3'>
              <div className='flex items-center justify-between gap-3'>
                <p className='flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground'>
                  <CircleAlert
                    aria-hidden='true'
                    className='size-3.5 shrink-0'
                  />
                  <span>
                    {t(
                      'Upload a ZIP archive to import multiple documents in one go.',
                    )}
                  </span>
                </p>
                <div className='flex shrink-0 items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={documents.loading}
                    onClick={() => documents.retry()}
                  >
                    <RefreshCw data-icon='inline-start' aria-hidden='true' />
                    {t('Refresh')}
                  </Button>
                  <Button
                    size='sm'
                    render={
                      <Link
                        to={`${knowledgeBaseLiveRoutes.upload(base.data.key)}${location.search}${location.hash}`}
                        state={{ from: liveLocationPath(location) }}
                      />
                    }
                  >
                    <CircleFadingArrowUpIcon
                      data-icon='inline-start'
                      aria-hidden='true'
                    />
                    {t('Upload')}
                  </Button>
                </div>
              </div>
              {documents.loading && !documents.data ? (
                <LoadingState className='min-h-48' />
              ) : documents.error ? (
                <KnowledgeBaseDirectoryError
                  error={documents.error}
                  onRetry={documents.retry}
                />
              ) : documents.data?.rows.length ? (
                <DocumentTable
                  documents={documents.data.rows}
                  canMaintain={canMaintainKnowledgeBaseDocument}
                  onOpen={(document) => {
                    setSegmentDocument(document);
                    setSegmentDrawerOpen(true);
                    setWorkspace({ segmentDocumentId: String(document.id) });
                  }}
                  onDownload={downloadDocument}
                  onVectorize={(document) => {
                    setDocumentAction({
                      kind: 'vectorize',
                      documentIds: [document.id],
                    });
                  }}
                  onDelete={(document) => {
                    setDocumentAction({
                      kind: 'delete',
                      documentIds: [document.id],
                    });
                  }}
                />
              ) : (
                <Empty className='min-h-48 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <FileText aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyDescription>
                      {t('No documents are available in this knowledge base.')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {documents.data ? (
                <PagePagination
                  page={documents.data.page}
                  pageSize={documents.data.pageSize}
                  total={documents.data.count}
                  onPageChange={(documentPage) =>
                    setWorkspace({ documentPage })
                  }
                  onPageSizeChange={(documentPageSize) =>
                    setWorkspace({ documentPage: 1, documentPageSize })
                  }
                />
              ) : null}
            </section>
          </TabsContent>
        ) : null}
        <TabsContent value='retrieve' className='mt-5'>
          <KnowledgeBaseHitTests
            queryDraft={queryDraft}
            submittedQuery={workspace.retrievalQuery}
            settings={{ topK: workspace.topK, score: workspace.score }}
            results={hasSubmittedRetrievalQuery ? (retrieval.data ?? []) : []}
            loading={hasSubmittedRetrievalQuery && retrieval.loading}
            error={
              hasSubmittedRetrievalQuery && retrieval.error
                ? normalizeKnowledgeBaseError(
                    retrieval.error,
                    t('Hit test failed.'),
                  ).message
                : undefined
            }
            onQueryChange={setQueryDraft}
            onSubmit={(nextQuery) => {
              setQueryDraft('');
              if (nextQuery === workspace.retrievalQuery) {
                retrieval.retry();
              } else {
                setWorkspace({ retrievalQuery: nextQuery }, false);
              }
            }}
            onEditQuery={() => setQueryDraft(workspace.retrievalQuery)}
            onSettingsChange={({ topK, score }) =>
              setWorkspace({ topK, score })
            }
            onRetry={retrieval.retry}
            onOpenResult={(result) => {
              const resultIndex = retrieval.data?.indexOf(result);
              if (resultIndex === undefined || resultIndex < 0) return;
              navigate(
                `${knowledgeBaseLiveRoutes.retrieval(base.data!.key, resultIndex)}${location.search}${location.hash}`,
                { state: { from: liveLocationPath(location) } },
              );
            }}
          />
        </TabsContent>
      </Tabs>
      <DocumentSegmentsDrawer
        open={segmentDrawerOpen && !!segmentDocument}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setSegmentDrawerOpen(false);
          setSegmentDocument(undefined);
          setWorkspace({ segmentDocumentId: undefined });
        }}
        knowledgeBase={base.data}
        document={segmentDocument}
        canMaintain={
          !!segmentDocument && canMaintainKnowledgeBaseDocument(segmentDocument)
        }
        onDocumentRefresh={documents.retry}
        onOpenSegment={(segment) => {
          const activeDocument = segmentDocument;
          if (!activeDocument) return;
          navigate(
            `${knowledgeBaseLiveRoutes.segment(activeDocument.knowledgeBaseKey, activeDocument.id, segment.uid)}${location.search}${location.hash}`,
            {
              state: { from: liveLocationPath(location), segmentDrawer: true },
            },
          );
        }}
      />
      <AlertDialog
        open={!!documentAction}
        onOpenChange={(open) => {
          if (!open && !documentActionPending) setDocumentAction(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {documentAction?.kind === 'delete'
                ? t('Delete {{count}} {{item}}?', {
                    count: documentAction.documentIds.length,
                    item: t(
                      documentAction.documentIds.length === 1
                        ? 'document'
                        : 'documents',
                    ),
                  })
                : t('Re-index {{count}} {{item}}?', {
                    count: documentAction?.documentIds.length ?? 0,
                    item: t(
                      (documentAction?.documentIds.length ?? 0) === 1
                        ? 'document'
                        : 'documents',
                    ),
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {documentAction?.kind === 'delete'
                ? t(
                    'This permanently deletes {{count}} selected {{item}} and their segments.',
                    {
                      count: documentAction.documentIds.length,
                      item: t(
                        documentAction.documentIds.length === 1
                          ? 'document'
                          : 'documents',
                      ),
                    },
                  )
                : t(
                    'This submits asynchronous vectorization tasks for {{count}} {{item}}.',
                    {
                      count: documentAction?.documentIds.length ?? 0,
                      item: t(
                        (documentAction?.documentIds.length ?? 0) === 1
                          ? 'document'
                          : 'documents',
                      ),
                    },
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={documentActionPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runDocumentAction()}
              disabled={documentActionPending}
            >
              {documentActionPending
                ? t('Submitting…')
                : documentAction?.kind === 'delete'
                  ? t('Delete {{count}} {{item}}', {
                      count: documentAction.documentIds.length,
                      item: t(
                        documentAction.documentIds.length === 1
                          ? 'document'
                          : 'documents',
                      ),
                    })
                  : t('Re-index {{count}} {{item}}', {
                      count: documentAction?.documentIds.length ?? 0,
                      item: t(
                        (documentAction?.documentIds.length ?? 0) === 1
                          ? 'document'
                          : 'documents',
                      ),
                    })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {outletContext ? <Outlet context={outletContext} /> : null}
    </main>
  );
}
