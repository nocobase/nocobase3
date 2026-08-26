import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import {
  ExampleUiContext,
  type ExampleUiContextValue,
  type ExampleUiDensity,
} from './example-ui-context';

export interface ExampleUiProviderProps {
  readonly children: ReactNode;
  readonly initialDensity?: ExampleUiDensity;
}

export function ExampleUiProvider({
  children,
  initialDensity = 'comfortable',
}: ExampleUiProviderProps): ReactElement {
  const [density, setDensity] = useState<ExampleUiDensity>(initialDensity);
  const value = useMemo<ExampleUiContextValue>(
    () => ({ density, setDensity }),
    [density],
  );

  return (
    <ExampleUiContext.Provider value={value}>
      {children}
    </ExampleUiContext.Provider>
  );
}
