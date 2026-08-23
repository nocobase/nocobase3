import { describe, expect, it } from 'vitest';
import { createLayoutCacheKey } from '../graph/layout-cache';
import { shouldPollRuns } from '../data';

describe('workflow management registry', () => { it('scopes layout cache to definition, not overlay', () => { expect(createLayoutCacheKey({ workflowId: '1', hash: 'v7', direction: 'RIGHT', dimensions: '220x80' })).toBe('1:v7:RIGHT:220x80:1'); }); it('polls only non-terminal runs', () => { expect(shouldPollRuns([{ id: '1', workflowId: '1', workflowKey: 'x', eventKey: 'e', status: 0, createdAt: '' }])).toBe(true); expect(shouldPollRuns([{ id: '1', workflowId: '1', workflowKey: 'x', eventKey: 'e', status: 1, createdAt: '' }])).toBe(false); }); });
