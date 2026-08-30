import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('declares its Client bootstrap', () => {
    expect(bootstrap).toBeTypeOf('function');
  });
});
