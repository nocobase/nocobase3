import { createContext, useContext, type Context } from 'react';

export interface RoutesExampleContextValue {
  readonly description: string;
}

export const RoutesExampleContext: Context<
  RoutesExampleContextValue | undefined
> = createContext<RoutesExampleContextValue | undefined>(undefined);

export function useRoutesExample(): RoutesExampleContextValue {
  const value = useContext(RoutesExampleContext);
  if (!value) {
    throw new Error(
      'useRoutesExample must be used within RoutesExampleProvider.',
    );
  }
  return value;
}
