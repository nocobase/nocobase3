import type { PropsWithChildren, ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import reactWrappers from '../client/react-wrappers/index.js';

function Children({ children }: PropsWithChildren): ReactElement {
  return <>{children}</>;
}

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('declares its Client React wrapper', () => {
    expect(reactWrappers).toMatchObject([
      {
        name: __NOCOBASE_SHORT_NAME_LITERAL__,
        component: expect.any(Function),
      },
    ]);
    expect(
      reactWrappers[0]?.component({ children: <Children /> }),
    ).toBeDefined();
  });
});
