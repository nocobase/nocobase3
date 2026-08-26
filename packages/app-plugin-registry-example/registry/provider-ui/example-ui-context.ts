import { createContext, useContext, type Context } from 'react';

export type ExampleUiDensity = 'comfortable' | 'compact';

export interface ExampleUiContextValue {
  readonly density: ExampleUiDensity;
  readonly setDensity: (density: ExampleUiDensity) => void;
}

export const ExampleUiContext: Context<ExampleUiContextValue | null> =
  createContext<ExampleUiContextValue | null>(null);

export function useExampleUi(): ExampleUiContextValue {
  const context = useContext(ExampleUiContext);
  if (!context) {
    throw new Error('useExampleUi must be used within ExampleUiProvider.');
  }
  return context;
}
