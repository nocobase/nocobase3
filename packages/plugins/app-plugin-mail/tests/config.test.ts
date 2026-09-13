import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAIL_SYNC_BATCH_SIZE,
  MAX_MAIL_SYNC_BATCH_SIZE,
  resolveMailSyncBatchSize,
} from '../server/config.js';

describe('mail sync configuration', () => {
  it('uses the bounded default and accepts the configured upper bound', () => {
    expect(resolveMailSyncBatchSize()).toBe(DEFAULT_MAIL_SYNC_BATCH_SIZE);
    expect(resolveMailSyncBatchSize(MAX_MAIL_SYNC_BATCH_SIZE)).toBe(
      MAX_MAIL_SYNC_BATCH_SIZE,
    );
  });

  it('rejects unsafe sync page sizes', () => {
    for (const value of [0, -1, 1.5, MAX_MAIL_SYNC_BATCH_SIZE + 1]) {
      expect(() => resolveMailSyncBatchSize(value)).toThrow(
        'Mail syncBatchSize must be an integer',
      );
    }
  });
});
