import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import routes from '../client/routes.js';

describe('files plugin client contributions', () => {
  it('starts with valid empty contributions', () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(routes).toEqual([]);
    expect(providers).toEqual([]);
  });
});
