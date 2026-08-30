import { describe, expect, it } from 'vitest';

import __NOCOBASE_SYMBOL_NAME__Job from '../server/jobs/__NOCOBASE_SHORT_NAME__.js';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('declares its queue job', () => {
    expect(__NOCOBASE_SYMBOL_NAME__Job.options).toMatchObject({
      queue: 'default',
    });
  });
});
