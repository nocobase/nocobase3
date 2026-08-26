import { useEffect, useState } from 'react';
import { useNotification } from '@refinedev/core';
import {
  CircleAlert,
  FileText,
  Minus,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { LoadingState } from '../components/app-shell-loading-state.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '../components/ui/empty.js';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';
import { useKnowledgeBaseSegment } from '../hooks/index.js';
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
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet.js';
import { Switch } from '../components/ui/switch.js';
import {
  PagePagination,
  KnowledgeBaseDirectoryError,
  SegmentTable,
} from '../components/index.js';
import {
  isKnowledgeBaseDocumentProcessing,
  pageAfterDelete,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
  type KnowledgeBaseSegment,
  type KnowledgeBaseSegmentOptions,
} from '../providers/index.js';
import { notifyKnowledgeBaseMutationError } from './notifications.js';
import { useT } from '../locales/index.js';

type SegmentOptions = Required<KnowledgeBaseSegmentOptions>;
type SegmentAction =
  | { kind: 'toggle'; segment: KnowledgeBaseSegment; enabled: boolean }
  | { kind: 'delete'; segment: KnowledgeBaseSegment }
  | { kind: 'regenerate'; segmentOptions: SegmentOptions };

const segmentPageSize = 20;
const defaultSegmentOptions: SegmentOptions = {
  enabled: true,
  chunkSize: 6000,
  chunkOverlap: 1200,
};

function normalizeSegmentOptions(
  value?: KnowledgeBaseSegmentOptions,
): SegmentOptions {
  const chunkSize = value?.chunkSize;
  const chunkOverlap = value?.chunkOverlap;
  return {
    enabled: value?.enabled !== false,
    chunkSize:
      typeof chunkSize === 'number' && Number.isFinite(chunkSize)
        ? Math.max(1, Math.round(chunkSize))
        : defaultSegmentOptions.chunkSize,
    chunkOverlap:
      typeof chunkOverlap === 'number' &&
      Number.isFinite(chunkOverlap) &&
      chunkOverlap >= 0
        ? Math.round(chunkOverlap)
        : defaultSegmentOptions.chunkOverlap,
  };
}

function SegmentNumberInput({
  label,
  value,
  minimum,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const t = useT();
  return (
    <div className='flex gap-1'>
      <Input
        type='number'
        min={minimum}
        step='any'
        disabled={disabled}
        value={value}
        className='[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onChange(
            Number.isFinite(nextValue) ? Math.max(minimum, nextValue) : minimum,
          );
        }}
      />
      <Button
        type='button'
        variant='outline'
        size='icon-sm'
        disabled={disabled || value <= minimum}
        aria-label={t('Decrease {{label}} by 100', { label })}
        onClick={() => onChange(Math.max(minimum, value - 100))}
      >
        <Minus aria-hidden='true' />
      </Button>
      <Button
        type='button'
        variant='outline'
        size='icon-sm'
        disabled={disabled}
        aria-label={t('Increase {{label}} by 100', { label })}
        onClick={() => onChange(value + 100)}
      >
        <Plus aria-hidden='true' />
      </Button>
    </div>
  );
}
function documentTitle(document: KnowledgeBaseDocument, fallback: string) {
  return document.title || document.filename || fallback;
}

function actionCopy(
  action: SegmentAction | undefined,
  t: ReturnType<typeof useT>,
) {
  if (action?.kind === 'toggle') {
    return action.enabled
      ? {
          title: t('Enable segment?'),
          description: t('Enabled segments can be used for retrieval.'),
          confirm: t('Enable segment'),
        }
      : {
          title: t('Disable segment?'),
          description: t('Disabled segments will not be used for retrieval.'),
          confirm: t('Disable segment'),
        };
  }
  if (action?.kind === 'delete') {
    return {
      title: t('Delete segment?'),
      description: t('This segment and its vectors will be deleted.'),
      confirm: t('Delete segment'),
    };
  }
  return {
    title: t('Regenerate segments?'),
    description: t(
      'Regenerating segments will overwrite edited segments and related questions.',
    ),
    confirm: t('Regenerate segments'),
  };
}

function SegmentSettings({
  value,
  disabled,
  loading,
  onRegenerate,
}: {
  value?: KnowledgeBaseSegmentOptions;
  disabled: boolean;
  loading: boolean;
  onRegenerate: (segmentOptions: SegmentOptions) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizeSegmentOptions(value));

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(normalizeSegmentOptions(value));
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        render={
          <Button variant='outline' size='sm' disabled={disabled}>
            <Settings2 aria-hidden='true' />
            {t('Segment settings')}
          </Button>
        }
      />
      <PopoverContent align='end' className='w-80 gap-3 p-4'>
        <form
          className='grid gap-3'
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onRegenerate(normalizeSegmentOptions(draft));
            setOpen(false);
          }}
        >
          <label className='flex items-center justify-between gap-3 text-sm font-medium'>
            {t('Split document')}
            <Switch
              checked={draft.enabled}
              disabled={loading}
              aria-label={t('Split document')}
              onCheckedChange={(enabled) =>
                setDraft((current) => ({ ...current, enabled }))
              }
            />
          </label>
          <label className='grid gap-1.5 text-sm font-medium'>
            {t('Chunk size')}
            <SegmentNumberInput
              label={t('Chunk size')}
              value={draft.chunkSize}
              minimum={1}
              disabled={loading}
              onChange={(chunkSize) =>
                setDraft((current) => ({ ...current, chunkSize }))
              }
            />
          </label>
          <label className='grid gap-1.5 text-sm font-medium'>
            {t('Chunk overlap')}
            <SegmentNumberInput
              label={t('Chunk overlap')}
              value={draft.chunkOverlap}
              minimum={0}
              disabled={loading}
              onChange={(chunkOverlap) =>
                setDraft((current) => ({ ...current, chunkOverlap }))
              }
            />
          </label>
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' size='sm' disabled={loading}>
              {t('Regenerate')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function DocumentSegmentsDrawer({
  open,
  onOpenChange,
  knowledgeBase,
  document,
  canMaintain = false,
  onDocumentRefresh,
  onOpenSegment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBase: KnowledgeBase;
  document?: KnowledgeBaseDocument;
  canMaintain?: boolean;
  onDocumentRefresh?: () => void;
  onOpenSegment?: (segment: KnowledgeBaseSegment) => void;
}) {
  const { open: notify } = useNotification();
  const t = useT();
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(segmentPageSize);
  const [action, setAction] = useState<SegmentAction>();
  const [actionPending, setActionPending] = useState(false);
  const pending = isKnowledgeBaseDocumentProcessing(document);
  const segmentState = useKnowledgeBaseSegment({
    knowledgeBaseKey: knowledgeBase.key,
    documentId: document?.id,
    segments: {
      enabled: open && !!document,
      page,
      pageSize,
      enabledOnly,
    },
  });
  const { service, segments } = segmentState;

  useEffect(() => {
    setPage(1);
    setAction(undefined);
  }, [document?.id, enabledOnly, open]);

  const runAction = async () => {
    if (!action || !document || actionPending || !canMaintain || pending)
      return;
    setActionPending(true);
    try {
      if (action.kind === 'toggle') {
        await service.setSegmentEnabled({
          knowledgeBaseKey: knowledgeBase.key,
          documentId: document.id,
          segmentUid: action.segment.uid,
          enabled: action.enabled,
        });
      } else if (action.kind === 'delete') {
        await service.deleteSegment({
          knowledgeBaseKey: knowledgeBase.key,
          documentId: document.id,
          segmentUid: action.segment.uid,
        });
      } else {
        await service.regenerateSegments({
          knowledgeBaseKey: knowledgeBase.key,
          documentId: document.id,
          segmentOptions: action.segmentOptions,
        });
      }
      const nextPage =
        action.kind === 'delete' && segments.data
          ? pageAfterDelete(page, segments.data.count, segments.data.pageSize)
          : page;
      notify?.({
        type: 'success',
        message:
          action.kind === 'toggle'
            ? action.enabled
              ? t('Segment enabled')
              : t('Segment disabled')
            : action.kind === 'delete'
              ? t('Segment deleted')
              : t('Segment regeneration submitted'),
      });
      setAction(undefined);
      if (nextPage === page) segments.retry();
      else setPage(nextPage);
      onDocumentRefresh?.();
    } catch (error) {
      const message = t('Unable to update segments');
      notifyKnowledgeBaseMutationError(notify, message, error, message);
      setAction(undefined);
    } finally {
      setActionPending(false);
    }
  };

  const copy = actionCopy(action, t);
  const canWrite = canMaintain && !pending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='!w-full !max-w-none gap-0 p-0 sm:!w-[min(96vw,80rem)] sm:!max-w-[min(96vw,80rem)]'
      >
        <SheetHeader className='border-b pr-12'>
          <SheetTitle>
            {t('Segment management')} —{' '}
            {document ? documentTitle(document, t('Document')) : t('Document')}
          </SheetTitle>
        </SheetHeader>
        <div className='flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-6 pt-4 sm:px-6'>
          <div className='space-y-4'>
            {document?.segmentStatus === 'ERROR' ? (
              <Alert variant='destructive'>
                <CircleAlert />
                <AlertTitle>{t('Segment generation failed')}</AlertTitle>
                {document.segmentErrorMessage ? (
                  <AlertDescription>
                    {document.segmentErrorMessage}
                  </AlertDescription>
                ) : null}
              </Alert>
            ) : pending ? (
              <Alert>
                <CircleAlert />
                <AlertTitle>{t('Segments are being generated')}</AlertTitle>
                <AlertDescription>
                  {t(
                    'Segment maintenance is unavailable until processing finishes.',
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
            {!canMaintain ? (
              <p className='rounded-xl border border-dashed p-3 text-sm text-muted-foreground'>
                {t(
                  'You can view shared segments. Only the document uploader can change, regenerate, or delete them.',
                )}
              </p>
            ) : null}
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={enabledOnly}
                  onCheckedChange={setEnabledOnly}
                />
                {t('Enabled only')}
              </label>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={segments.retry}
                  disabled={segments.loading || !document}
                >
                  <RefreshCw aria-hidden='true' />
                  {t('Refresh')}
                </Button>
                {canWrite ? (
                  <SegmentSettings
                    value={document?.segmentOptions}
                    disabled={actionPending || !document}
                    loading={actionPending}
                    onRegenerate={(segmentOptions) =>
                      setAction({ kind: 'regenerate', segmentOptions })
                    }
                  />
                ) : null}
              </div>
            </div>
            {segments.loading && !segments.data ? (
              <LoadingState className='min-h-48' />
            ) : segments.error ? (
              <KnowledgeBaseDirectoryError
                error={segments.error}
                onRetry={segments.retry}
              />
            ) : segments.data?.rows.length ? (
              <>
                <SegmentTable
                  segments={segments.data.rows}
                  canMaintain={canMaintain}
                  disabled={pending || actionPending}
                  onOpen={onOpenSegment}
                  onToggleEnabled={
                    canMaintain
                      ? (segment, enabled) =>
                          setAction({ kind: 'toggle', segment, enabled })
                      : undefined
                  }
                  onDelete={
                    canMaintain
                      ? (segment) => setAction({ kind: 'delete', segment })
                      : undefined
                  }
                />
                <PagePagination
                  page={segments.data.page}
                  pageSize={segments.data.pageSize}
                  total={segments.data.count}
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => {
                    setPage(1);
                    setPageSize(nextPageSize);
                  }}
                />
              </>
            ) : (
              <Empty className='min-h-48 border'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <FileText aria-hidden='true' />
                  </EmptyMedia>
                  <EmptyDescription>{t('No segments')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>
      </SheetContent>
      <AlertDialog
        open={!!action}
        onOpenChange={(nextOpen) =>
          !nextOpen && !actionPending && setAction(undefined)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runAction()}
              disabled={actionPending}
            >
              {actionPending ? t('Submitting…') : copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
