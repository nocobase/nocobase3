import { useEffect, useState, type ReactNode } from 'react';
import {
  Edit3,
  File,
  FileSearch,
  Search,
  Send,
  Settings2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { LoadingState } from './app-shell-loading-state.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@/components/ui/empty';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import type { KnowledgeBaseSearchResult } from '@/extensions/nocobase-ai-knowledge-base-providers';
import { bookshelfMarker } from './common.js';
import { useKnowledgeBaseComponentTranslate } from './i18n.js';

export function RetrievalQueryForm({
  query,
  onQueryChange,
  onSubmit,
  disabled = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <form
      className='flex gap-2'
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('Ask this knowledge base')}
        aria-label={t('Retrieval query')}
        disabled={disabled}
      />
      <Button type='submit' disabled={disabled || !query.trim()}>
        <Search />
        {t('Search')}
      </Button>
    </form>
  );
}
export type HitTestSettings = {
  topK: number;
  score: number;
};

function HitTestEmptyState({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Empty className='min-h-64 flex-1 border-0 p-6'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icon aria-hidden='true' />
        </EmptyMedia>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function HitTestResultCard({
  index,
  result,
  onOpen,
}: {
  index: number;
  result: KnowledgeBaseSearchResult;
  onOpen?: (result: KnowledgeBaseSearchResult) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const title = result.title || result.filename || t('Untitled passage');
  const open = () => onOpen?.(result);
  return (
    <Card
      className='h-48 min-w-0 cursor-pointer bg-muted/45 transition-colors hover:bg-card'
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (onOpen && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          open();
        }
      }}
    >
      <CardContent className='flex h-full min-w-0 flex-col justify-between p-4'>
        <div className='min-w-0 space-y-3'>
          <div className='flex min-w-0 items-center justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <Avatar>
                <AvatarFallback className='bg-blue-500/10 text-blue-600 dark:text-blue-400'>
                  {index + 1}
                </AvatarFallback>
              </Avatar>
              <p className='truncate text-sm font-semibold' title={title}>
                {title}
              </p>
            </div>
            <span className='shrink-0 text-sm font-semibold tabular-nums'>
              {typeof result.score === 'number' ? result.score.toFixed(3) : '—'}
            </span>
          </div>
          <p className='line-clamp-3 text-sm text-muted-foreground'>
            {result.content || t('No passage content')}
          </p>
        </div>
        <div className='flex min-w-0 items-center gap-2 text-sm text-muted-foreground'>
          <File aria-hidden='true' className='size-4 shrink-0' />
          <span className='truncate' title={result.filename || title}>
            {result.filename || title}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function HitTestSettingsPopover({
  value,
  onChange,
}: {
  value: HitTestSettings;
  onChange: (value: HitTestSettings) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [scoreText, setScoreText] = useState(() => value.score.toFixed(3));

  useEffect(() => {
    if (open) {
      setDraft(value);
      setScoreText(value.score.toFixed(3));
    }
  }, [open, value]);

  const save = () => {
    const score = Number(scoreText);
    if (!Number.isFinite(score)) return;
    onChange({
      topK: Math.max(1, Math.min(1000, Math.round(draft.topK))),
      score: Math.max(0, Math.min(1, score)),
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant='outline' size='sm'>
            <Settings2 aria-hidden='true' />
            {t('Settings')}
          </Button>
        }
      />
      <PopoverContent align='end' className='w-64'>
        <form
          className='grid gap-3'
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className='grid gap-1.5 text-sm font-medium'>
            {t('Top K')}
            <Input
              type='number'
              min={1}
              max={1000}
              value={draft.topK}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  topK: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className='grid gap-1.5 text-sm font-medium'>
            {t('Score')}
            <Input
              type='number'
              min={0}
              max={1}
              step={0.1}
              required
              value={scoreText}
              onChange={(event) => setScoreText(event.target.value)}
            />
          </label>
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' size='sm'>
              {t('Save')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function KnowledgeBaseHitTests({
  queryDraft,
  submittedQuery,
  settings,
  results,
  loading = false,
  error,
  onQueryChange,
  onSubmit,
  onEditQuery,
  onSettingsChange,
  onRetry,
  onOpenResult,
}: {
  queryDraft: string;
  submittedQuery?: string;
  settings: HitTestSettings;
  results: KnowledgeBaseSearchResult[];
  loading?: boolean;
  error?: string;
  onQueryChange: (value: string) => void;
  onSubmit: (query: string) => void;
  onEditQuery?: () => void;
  onSettingsChange: (value: HitTestSettings) => void;
  onRetry?: () => void;
  onOpenResult?: (result: KnowledgeBaseSearchResult) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const [inputFocusKey, setInputFocusKey] = useState(0);
  const sent = !!submittedQuery;

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-sm text-muted-foreground'>
          {t('Test the matching between user input and the knowledge base')}
        </p>
        <HitTestSettingsPopover value={settings} onChange={onSettingsChange} />
      </div>
      <form
        className='flex w-full gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          const query = queryDraft.trim();
          if (query) onSubmit(query);
        }}
      >
        <Input
          key={inputFocusKey}
          autoFocus
          className='h-10'
          value={queryDraft}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('Input matching text')}
          aria-label={t('Input matching text')}
          disabled={loading}
        />
        <Button
          type='submit'
          className='h-10'
          disabled={loading || !queryDraft.trim()}
        >
          {t('Send')}
          <Send aria-hidden='true' />
        </Button>
      </form>
      <Card className='min-h-72'>
        <CardContent className='flex min-h-72 flex-col p-4'>
          {!sent ? (
            <HitTestEmptyState icon={FileSearch}>
              {t('The matching documents are displayed here')}
            </HitTestEmptyState>
          ) : (
            <div className='flex min-h-64 flex-1 flex-col gap-4'>
              <div className='flex min-w-0 items-center gap-3'>
                <Avatar size='lg'>
                  <AvatarFallback className='bg-primary/10 text-primary'>
                    <UserRound aria-hidden='true' className='size-5' />
                  </AvatarFallback>
                </Avatar>
                <div className='flex min-w-0 items-center gap-1'>
                  <p
                    className='truncate text-sm font-semibold'
                    title={submittedQuery}
                  >
                    {submittedQuery}
                  </p>
                  {onEditQuery ? (
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('Edit query')}
                      title={t('Edit')}
                      onClick={() => {
                        onEditQuery();
                        setInputFocusKey((current) => current + 1);
                      }}
                    >
                      <Edit3 aria-hidden='true' />
                    </Button>
                  ) : null}
                </div>
              </div>
              {loading ? (
                <LoadingState className='min-h-64 flex-1' />
              ) : error ? (
                <HitTestEmptyState icon={Search}>
                  <div className='space-y-3'>
                    <p>{error}</p>
                    {onRetry ? (
                      <Button size='sm' onClick={onRetry}>
                        {t('Retry')}
                      </Button>
                    ) : null}
                  </div>
                </HitTestEmptyState>
              ) : results.length ? (
                <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                  {results.map((result, index) => (
                    <HitTestResultCard
                      key={
                        result.id ??
                        `${result.filename ?? result.title ?? 'result'}-${index}`
                      }
                      index={index}
                      result={result}
                      onOpen={onOpenResult}
                    />
                  ))}
                </div>
              ) : (
                <HitTestEmptyState icon={Search}>
                  {t('No matching documents found')}
                </HitTestEmptyState>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function RetrievalScoreBadge({ score }: { score?: number }) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Badge variant='secondary'>
      {t('Score {{score}}', {
        score: typeof score === 'number' ? score.toFixed(3) : '—',
      })}
    </Badge>
  );
}

export function MatchedQuestionsList({
  questions = [],
}: {
  questions?: string[];
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return questions.length ? (
    <ul className='mt-3 space-y-1 text-xs text-muted-foreground'>
      <li className='font-medium text-foreground'>{t('Matched questions')}</li>
      {questions.map((question, index) => (
        <li key={`${question}-${index}`}>• {question}</li>
      ))}
    </ul>
  ) : null;
}

export function RetrievalResultCard({
  result,
  onOpen,
  safeMetadata,
}: {
  result: KnowledgeBaseSearchResult;
  onOpen?: (result: KnowledgeBaseSearchResult) => void;
  safeMetadata?: ReactNode;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const open = () => onOpen?.(result);
  return (
    <Card
      className={bookshelfMarker}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (onOpen && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          open();
        }
      }}
    >
      <CardHeader>
        <CardTitle className='flex justify-between gap-3'>
          <span className='truncate'>
            {result.title || result.filename || t('Untitled passage')}
          </span>
          <RetrievalScoreBadge score={result.score} />
        </CardTitle>
        <CardDescription className='line-clamp-3'>
          {result.content || t('No passage content')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {safeMetadata}
        <MatchedQuestionsList questions={result.matchedQuestions} />
      </CardContent>
    </Card>
  );
}

export function RetrievalResultGrid(props: {
  results: KnowledgeBaseSearchResult[];
  onOpen?: (result: KnowledgeBaseSearchResult) => void;
  renderMetadata?: (result: KnowledgeBaseSearchResult) => ReactNode;
}) {
  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
      {props.results.map((result, index) => (
        <RetrievalResultCard
          key={result.id ?? index}
          result={result}
          onOpen={props.onOpen}
          safeMetadata={props.renderMetadata?.(result)}
        />
      ))}
    </div>
  );
}

export function RetrievalResultRow({
  result,
  index,
  onOpen,
}: {
  result: KnowledgeBaseSearchResult;
  index: number;
  onOpen?: (result: KnowledgeBaseSearchResult) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <Item
      variant='outline'
      className={bookshelfMarker}
      render={
        onOpen ? (
          <button
            type='button'
            onClick={() => onOpen(result)}
            aria-label={t('Open result {{number}}', { number: index + 1 })}
          />
        ) : undefined
      }
    >
      <ItemMedia variant='icon'>{index + 1}</ItemMedia>
      <ItemContent>
        <ItemTitle className='flex justify-between gap-3'>
          <span>
            {result.title || result.filename || t('Untitled passage')}
          </span>
          <RetrievalScoreBadge score={result.score} />
        </ItemTitle>
        <ItemDescription className='line-clamp-2'>
          {result.content}
        </ItemDescription>
        <MatchedQuestionsList questions={result.matchedQuestions} />
      </ItemContent>
    </Item>
  );
}

export function RetrievalRankedList(props: {
  results: KnowledgeBaseSearchResult[];
  onOpen?: (result: KnowledgeBaseSearchResult) => void;
}) {
  return (
    <ItemGroup>
      {props.results.map((result, index) => (
        <RetrievalResultRow
          key={result.id ?? index}
          result={result}
          index={index}
          onOpen={props.onOpen}
        />
      ))}
    </ItemGroup>
  );
}

export type RetrievalSourceGroup = {
  source: string;
  results: KnowledgeBaseSearchResult[];
};

/** Stable grouping preserves the server's rank within each source and encounter order. */
export function groupRetrievalResults(
  results: KnowledgeBaseSearchResult[],
  unknownSource = 'Unknown source',
): RetrievalSourceGroup[] {
  const groups = new Map<string, KnowledgeBaseSearchResult[]>();
  for (const result of results) {
    const source = result.filename || result.title || unknownSource;
    groups.set(source, [...(groups.get(source) ?? []), result]);
  }
  return [...groups].map(([source, grouped]) => ({ source, results: grouped }));
}

export function RetrievalSourceGroupedResults({
  results,
  onOpen,
}: {
  results: KnowledgeBaseSearchResult[];
  onOpen?: (result: KnowledgeBaseSearchResult) => void;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  return (
    <div className='space-y-5'>
      {groupRetrievalResults(results, t('Unknown source')).map((group) => (
        <section key={group.source}>
          <h3 className='mb-2 font-heading font-medium'>{group.source}</h3>
          <RetrievalRankedList results={group.results} onOpen={onOpen} />
        </section>
      ))}
    </div>
  );
}

export function RetrievalResultDetail({
  result,
  safeMetadata,
  showTitle = true,
}: {
  result?: KnowledgeBaseSearchResult;
  safeMetadata?: ReactNode;
  showTitle?: boolean;
}) {
  const t = useKnowledgeBaseComponentTranslate();
  const passage = result?.title || result?.filename || t('Passage');
  const source = result?.filename || t('Unknown source');
  return result ? (
    <div className='space-y-4'>
      {showTitle ? (
        <>
          <div className='flex justify-between gap-3'>
            <h3 className='font-heading font-medium'>{passage}</h3>
            <RetrievalScoreBadge score={result.score} />
          </div>
          <p className='text-sm text-muted-foreground'>{source}</p>
        </>
      ) : (
        <div className='flex items-start justify-between gap-3'>
          <p className='text-sm text-muted-foreground'>{source}</p>
          <RetrievalScoreBadge score={result.score} />
        </div>
      )}
      <p className='whitespace-pre-wrap text-sm'>{result.content}</p>
      <MatchedQuestionsList questions={result.matchedQuestions} />
      {safeMetadata}
    </div>
  ) : (
    <p className='text-sm text-muted-foreground'>
      {t('Select a retrieval result to inspect its passage.')}
    </p>
  );
}

export function RetrievalSplitView({
  results,
  selectedIndex,
  onSelectionChange,
  safeMetadata,
}: {
  results: KnowledgeBaseSearchResult[];
  selectedIndex?: number;
  onSelectionChange: (index: number) => void;
  safeMetadata?: (result: KnowledgeBaseSearchResult) => ReactNode;
}) {
  const selected =
    selectedIndex === undefined ? undefined : results[selectedIndex];
  return (
    <div className='grid gap-4 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.5fr)]'>
      <div className='max-h-[65vh] overflow-auto'>
        <RetrievalRankedList
          results={results}
          onOpen={(result) => onSelectionChange(results.indexOf(result))}
        />
      </div>
      <div className='rounded-xl border p-4'>
        <RetrievalResultDetail
          result={selected}
          safeMetadata={selected ? safeMetadata?.(selected) : undefined}
        />
      </div>
    </div>
  );
}
