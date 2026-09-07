import { AlertTriangle, FileWarning, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type {
  KnowledgeBaseSegment,
  KnowledgeBaseSegmentQuestion,
} from '@/extensions/nocobase-ai-knowledge-base-providers';
import { bookshelfMarker } from './common.js';
import { CompactNumber } from './compact-number.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

function formatSegmentUpdatedAt(value?: string) {
  if (!value) return { display: '—', fullDateTime: '—' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return { display: value, fullDateTime: value };
  return {
    display: date.toLocaleDateString(),
    fullDateTime: date.toLocaleString(),
  };
}

export function SegmentTable({
  segments,
  canMaintain = false,
  disabled = false,
  onOpen,
  onToggleEnabled,
  onDelete,
}: {
  segments: KnowledgeBaseSegment[];
  canMaintain?: boolean;
  disabled?: boolean;
  onOpen?: (segment: KnowledgeBaseSegment) => void;
  onToggleEnabled?: (segment: KnowledgeBaseSegment, enabled: boolean) => void;
  onDelete?: (segment: KnowledgeBaseSegment) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const showActions = !!onOpen || (canMaintain && !!onDelete);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-12'>{t('No.')}</TableHead>
          <TableHead>{t('Preview')}</TableHead>
          <TableHead>{t('Characters')}</TableHead>
          <TableHead>{t('Related questions')}</TableHead>
          <TableHead>{t('Enabled')}</TableHead>
          <TableHead>{t('Updated at')}</TableHead>
          {showActions ? <TableHead>{t('Actions')}</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((segment, index) => {
          const updatedAt = formatSegmentUpdatedAt(segment.updatedAt);
          return (
            <TableRow key={segment.uid}>
              <TableCell className='tabular-nums'>
                {segment.position === undefined
                  ? index + 1
                  : segment.position + 1}
              </TableCell>
              <TableCell className='max-w-80'>
                <p
                  className='line-clamp-1'
                  title={segment.preview || segment.content}
                >
                  {segment.preview || segment.content || '—'}
                </p>
              </TableCell>
              <TableCell className='tabular-nums'>
                <CompactNumber value={segment.charLength} />
              </TableCell>
              <TableCell className='tabular-nums'>
                <CompactNumber
                  value={segment.questionCount ?? segment.questions?.length}
                />
              </TableCell>
              <TableCell>
                {canMaintain && onToggleEnabled ? (
                  <Switch
                    checked={segment.enabled !== false}
                    disabled={disabled}
                    aria-label={t('Enable segment {{number}}', {
                      number: index + 1,
                    })}
                    onCheckedChange={(enabled) =>
                      onToggleEnabled(segment, enabled)
                    }
                  />
                ) : segment.enabled === false ? (
                  t('No')
                ) : (
                  t('Yes')
                )}
              </TableCell>
              <TableCell className='max-w-40 overflow-hidden'>
                <time
                  dateTime={segment.updatedAt}
                  title={updatedAt.fullDateTime}
                  className='block truncate tabular-nums text-muted-foreground'
                >
                  {updatedAt.display}
                </time>
              </TableCell>
              {showActions ? (
                <TableCell className='pl-0'>
                  <div className='flex items-center gap-1'>
                    {onOpen ? (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => onOpen(segment)}
                      >
                        <Pencil aria-hidden='true' />
                        {canMaintain ? t('Edit') : t('View')}
                      </Button>
                    ) : null}
                    {canMaintain && onDelete ? (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-destructive hover:bg-destructive/10 hover:text-destructive'
                        disabled={disabled}
                        onClick={() => onDelete(segment)}
                      >
                        <Trash2 aria-hidden='true' />
                        {t('Delete')}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
export function SegmentList({
  segments,
  onOpen,
}: {
  segments: KnowledgeBaseSegment[];
  onOpen?: (segment: KnowledgeBaseSegment) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <ItemGroup>
      {segments.map((segment) => (
        <Item
          key={segment.uid}
          variant='outline'
          className={bookshelfMarker}
          render={
            onOpen ? (
              <button type='button' onClick={() => onOpen(segment)} />
            ) : undefined
          }
        >
          <ItemMedia variant='icon'>{segment.position ?? '#'}</ItemMedia>
          <ItemContent>
            <ItemTitle>
              {segment.title ||
                t('Segment {{number}}', { number: segment.position ?? '' })}
            </ItemTitle>
            <ItemDescription className='line-clamp-2'>
              {segment.preview || segment.content}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

export function SegmentStatusAlert({
  segment,
}: {
  segment: KnowledgeBaseSegment;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return segment.enabled === false ? (
    <Alert>
      <AlertTriangle />
      <AlertTitle>{t('Segment is disabled')}</AlertTitle>
      <AlertDescription>
        {t('Disabled segments are not used by retrieval until enabled again.')}
      </AlertDescription>
    </Alert>
  ) : null;
}

export function SegmentPendingAlert() {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>{t('Document processing is in progress')}</AlertTitle>
      <AlertDescription>
        {t(
          'Segment edits and enablement changes are unavailable until indexing and segmentation finish.',
        )}
      </AlertDescription>
    </Alert>
  );
}

export function SegmentPartialSaveAlert({
  message,
  onRetryQuestions,
  retrying = false,
}: {
  message: string;
  onRetryQuestions: () => void;
  retrying?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Alert variant='destructive'>
      <AlertTriangle />
      <AlertTitle>
        {t('Content saved; related questions were not saved')}
      </AlertTitle>
      <AlertDescription className='space-y-3'>
        <p>{message}</p>
        <Button
          size='sm'
          variant='outline'
          onClick={onRetryQuestions}
          disabled={retrying}
        >
          {retrying ? t('Retrying questions…') : t('Retry related questions')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function SegmentContentEditor({
  content,
  onContentChange,
  disabled = false,
}: {
  content: string;
  onContentChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <div className='space-y-3'>
      <Textarea
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        className='min-h-64'
        disabled={disabled}
        aria-label={t('Segment content')}
      />
    </div>
  );
}

export function SegmentQuestionsEditor({
  questions,
  onChange,
  disabled = false,
}: {
  questions: KnowledgeBaseSegmentQuestion[];
  onChange: (questions: KnowledgeBaseSegmentQuestion[]) => void;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const updateQuestion = (
    index: number,
    changes: Partial<KnowledgeBaseSegmentQuestion>,
  ) => {
    onChange(
      questions.map((question, current) =>
        current === index ? { ...question, ...changes } : question,
      ),
    );
  };

  return (
    <fieldset className='space-y-3' disabled={disabled}>
      <legend className='text-sm font-medium'>{t('Related questions')}</legend>
      {questions.length ? (
        <div className='space-y-2'>
          {questions.map((question, index) => (
            <div
              className='grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center'
              key={question.id ?? question.hash ?? index}
            >
              <Input
                value={question.content}
                onChange={(event) =>
                  updateQuestion(index, { content: event.target.value })
                }
                aria-label={t('Related question {{number}}', {
                  number: index + 1,
                })}
              />
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={question.enabled !== false}
                  onCheckedChange={(enabled) =>
                    updateQuestion(index, { enabled })
                  }
                />
                {t('Enabled')}
              </label>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={t('Remove related question {{number}}', {
                  number: index + 1,
                })}
                onClick={() =>
                  onChange(questions.filter((_, current) => current !== index))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('No related questions yet.')}
        </p>
      )}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => onChange([...questions, { content: '', enabled: true }])}
      >
        <Plus />
        {t('Add question')}
      </Button>
    </fieldset>
  );
}

export function SegmentEditor({
  segment,
  draft,
  onDraftChange,
  onSave,
  saving = false,
  disabled = false,
}: {
  segment: KnowledgeBaseSegment;
  draft: {
    title?: string;
    content: string;
    questions: KnowledgeBaseSegmentQuestion[];
  };
  onDraftChange: (draft: {
    title?: string;
    content: string;
    questions: KnowledgeBaseSegmentQuestion[];
  }) => void;
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const readonly = disabled || saving;
  return (
    <div className='space-y-5'>
      <SegmentStatusAlert segment={segment} />
      <SegmentContentEditor
        content={draft.content}
        onContentChange={(content) => onDraftChange({ ...draft, content })}
        disabled={readonly}
      />
      <SegmentQuestionsEditor
        questions={draft.questions}
        onChange={(questions) => onDraftChange({ ...draft, questions })}
        disabled={readonly}
      />
      <div className='flex justify-end'>
        <Button onClick={onSave} disabled={readonly}>
          {saving ? t('Saving…') : t('Save changes')}
        </Button>
      </div>
    </div>
  );
}

export function SegmentConflictAlert({
  localDraft,
  serverSegment,
  onAdoptServer,
  onKeepDraft,
}: {
  localDraft: { content: string };
  serverSegment: KnowledgeBaseSegment;
  onAdoptServer: () => void;
  onKeepDraft: () => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const serverContent =
    serverSegment.content || serverSegment.preview || t('(empty)');
  return (
    <Alert variant='destructive'>
      <AlertTriangle />
      <AlertTitle>{t('Someone else updated this segment')}</AlertTitle>
      <AlertDescription className='space-y-3'>
        <p>
          {t('Your draft is retained. Server content: {{content}}', {
            content: serverContent,
          })}
        </p>
        <div className='rounded border bg-background/60 p-2 text-xs'>
          {t('Your draft: {{content}}', { content: localDraft.content })}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' variant='outline' onClick={onAdoptServer}>
            {t('Adopt server version')}
          </Button>
          <Button size='sm' variant='destructive' onClick={onKeepDraft}>
            {t('Keep my draft')}
          </Button>
        </div>
        <p className='text-xs'>
          {t(
            'Keeping your draft refreshes the baseline and requires an explicit save.',
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function SegmentUnavailableState({
  description,
}: {
  description?: string;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const unavailableDescription =
    description ??
    t(
      'This segment is no longer available. Return to the document and refresh the list.',
    );
  return (
    <Empty className='min-h-48 border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <FileWarning aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>{t('Segment unavailable')}</EmptyTitle>
        <EmptyDescription>{unavailableDescription}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
