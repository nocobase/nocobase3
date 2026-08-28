import { describe, expect, it } from 'vitest';

import { shouldPollRuns } from '../../client/extensions/nocobase-workflow-management/data';
import { createLayoutCacheKey } from '../../client/extensions/nocobase-workflow-management/graph/layout-cache';

describe('workflow management registry', () => {
  it('scopes the layout cache to the definition instead of the overlay', () => {
    expect(
      createLayoutCacheKey({
        workflowId: '1',
        hash: 'v7',
        direction: 'RIGHT',
        dimensions: '220x80',
      }),
    ).toBe('1:v7:RIGHT:220x80:1');
  });

  it('polls only non-terminal runs', () => {
    expect(
      shouldPollRuns([
        {
          id: '1',
          workflowId: '1',
          workflowKey: 'x',
          eventKey: 'e',
          status: 0,
          createdAt: '',
        },
      ]),
    ).toBe(true);
    expect(
      shouldPollRuns([
        {
          id: '1',
          workflowId: '1',
          workflowKey: 'x',
          eventKey: 'e',
          status: 1,
          createdAt: '',
        },
      ]),
    ).toBe(false);
  });
});
