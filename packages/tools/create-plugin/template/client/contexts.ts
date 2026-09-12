import { createContext, useContext, type Context } from 'react';

export interface __NOCOBASE_SYMBOL_NAME__ContextValue {
  readonly welcomeMessage: string;
}

export const __NOCOBASE_SYMBOL_NAME__Context: Context<
  __NOCOBASE_SYMBOL_NAME__ContextValue | undefined
> = createContext<__NOCOBASE_SYMBOL_NAME__ContextValue | undefined>(undefined);

export function use__NOCOBASE_SYMBOL_NAME__(): __NOCOBASE_SYMBOL_NAME__ContextValue {
  const value = useContext(__NOCOBASE_SYMBOL_NAME__Context);
  if (!value) {
    throw new Error(
      'use__NOCOBASE_SYMBOL_NAME__ must be used within __NOCOBASE_SYMBOL_NAME__Provider.',
    );
  }
  return value;
}
