import type { PropsWithChildren, ReactElement } from 'react';

import {
  RoutesExampleContext,
  type RoutesExampleContextValue,
} from '../contexts/routes-example-context.js';

const contextValue: RoutesExampleContextValue = Object.freeze({
  description:
    'This page uses a provider contributed by the same client plugin.',
});

export function RoutesExampleProvider({
  children,
}: PropsWithChildren): ReactElement {
  return (
    <RoutesExampleContext.Provider value={contextValue}>
      {children}
    </RoutesExampleContext.Provider>
  );
}
