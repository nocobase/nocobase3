const knowledgeBaseDevRoot = '/ai/knowledge-base';

export type LiveListState = {
  page: number;
  query: string;
  view: 'cards' | 'list';
  pageSize: number;
};

export type KnowledgeBaseWorkspaceState = {
  documentPage: number;
  documentPageSize: number;
  retrievalQuery: string;
  topK: number;
  score: number;
  segmentDocumentId?: string;
};
export type LiveRouteState = { from?: string; segmentDrawer?: boolean };

type LocationParts = { pathname: string; search: string; hash: string };

const positive = (value: string | null) =>
  Math.max(1, Number.parseInt(value || '1', 10) || 1);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const numeric = (
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
};
const selectedPageSize = (value: string | null) =>
  value ? Math.round(numeric(value, 10, 1, 100)) : 10;

export function parseLiveListState(search: URLSearchParams): LiveListState {
  const view = search.get('view');
  return {
    page: positive(search.get('page')),
    query: search.get('q') || '',
    view: view === 'list' ? 'list' : 'cards',
    pageSize: selectedPageSize(search.get('pageSize')),
  };
}

export function liveListSearch(state: LiveListState) {
  const params = new URLSearchParams();
  if (state.page > 1) params.set('page', String(state.page));
  if (state.query) params.set('q', state.query);
  if (state.view !== 'cards') params.set('view', state.view);
  if (state.pageSize !== 10) params.set('pageSize', String(state.pageSize));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function parseKnowledgeBaseWorkspaceState(
  search: URLSearchParams,
): KnowledgeBaseWorkspaceState {
  return {
    documentPage: positive(search.get('documentsPage')),
    documentPageSize: selectedPageSize(search.get('documentPageSize')),
    retrievalQuery: search.get('query') || '',
    topK: Math.round(numeric(search.get('topK'), 4, 1, 1000)),
    score: numeric(search.get('score'), 0.6, 0, 1),
    segmentDocumentId: search.get('segmentsDocument') || undefined,
  };
}

export function knowledgeBaseWorkspaceSearch(
  state: KnowledgeBaseWorkspaceState,
) {
  const params = new URLSearchParams();
  if (state.documentPage > 1)
    params.set('documentsPage', String(state.documentPage));
  if (state.documentPageSize !== 10)
    params.set('documentPageSize', String(state.documentPageSize));
  if (state.retrievalQuery) params.set('query', state.retrievalQuery);
  if (state.topK !== 4) params.set('topK', String(state.topK));
  if (state.score !== 0.6) params.set('score', String(state.score));
  if (state.segmentDocumentId)
    params.set('segmentsDocument', state.segmentDocumentId);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const liveLocationPath = ({ pathname, search, hash }: LocationParts) =>
  `${pathname}${search}${hash}`;

export const isLiveSegmentDrawerState = (state: unknown) =>
  !!state &&
  typeof state === 'object' &&
  'segmentDrawer' in state &&
  state.segmentDrawer === true;

/** Do not let location state redirect a close action away from this Registry. */
export function liveReturnTo(
  state: unknown,
  fallback: string,
  expectedPrefix?: string,
) {
  const from =
    state &&
    typeof state === 'object' &&
    'from' in state &&
    typeof state.from === 'string'
      ? state.from
      : undefined;
  if (
    from &&
    (from === knowledgeBaseDevRoot ||
      from.startsWith(`${knowledgeBaseDevRoot}/`)) &&
    (!expectedPrefix || from.startsWith(expectedPrefix))
  ) {
    return from;
  }
  return fallback;
}
