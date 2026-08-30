import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import providers from '../client/providers.js';

function Children({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('declares its Client Provider', () => {
    expect(providers).toMatchObject([
      {
        name: __NOCOBASE_SHORT_NAME_LITERAL__,
        component: expect.any(Function),
      },
    ]);
    expect(providers[0]?.component({ children: <Children /> })).toBeDefined();
  });
});
