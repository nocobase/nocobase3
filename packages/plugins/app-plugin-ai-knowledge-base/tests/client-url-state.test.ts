import { expect, test } from 'vitest';

import {
  isLiveSegmentDrawerState,
  knowledgeBaseWorkspaceSearch,
  liveListSearch,
  liveReturnTo,
  parseKnowledgeBaseWorkspaceState,
  parseLiveListState,
} from '../client/page/url-state.ts';

test('list and workspace state round-trip through the URL', () => {
  const list = parseLiveListState(
    new URLSearchParams('view=list&page=3&q=handbook&pageSize=20'),
  );
  expect(list).toEqual({
    view: 'list',
    page: 3,
    query: 'handbook',
    pageSize: 20,
  });
  expect(liveListSearch(list)).toBe('?page=3&q=handbook&view=list&pageSize=20');

  const workspace = parseKnowledgeBaseWorkspaceState(
    new URLSearchParams(
      'documentsPage=2&documentPageSize=30&query=retention&topK=7&score=0.8&segmentsDocument=204',
    ),
  );
  expect(knowledgeBaseWorkspaceSearch(workspace)).toBe(
    '?documentsPage=2&documentPageSize=30&query=retention&topK=7&score=0.8&segmentsDocument=204',
  );
});

test('drawer close targets stay under the production knowledge base route', () => {
  const internal = '/ai/knowledge-base/handbook/documents/12?page=2#segments';
  expect(
    liveReturnTo(
      { from: internal },
      '/ai/knowledge-base/handbook',
      '/ai/knowledge-base/handbook',
    ),
  ).toBe(internal);
  expect(
    liveReturnTo(
      { from: 'https://untrusted.example' },
      '/ai/knowledge-base/handbook',
      '/ai/knowledge-base/handbook',
    ),
  ).toBe('/ai/knowledge-base/handbook');
  expect(isLiveSegmentDrawerState({ segmentDrawer: true })).toBe(true);
  expect(isLiveSegmentDrawerState({ segmentDrawer: 'true' })).toBe(false);
});
