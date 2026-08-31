import type { PropsWithChildren, ReactElement } from 'react';

import {
  __NOCOBASE_SYMBOL_NAME__Context,
  type __NOCOBASE_SYMBOL_NAME__ContextValue,
} from '../contexts.js';

const contextValue: __NOCOBASE_SYMBOL_NAME__ContextValue = Object.freeze({
  welcomeMessage: __NOCOBASE_WELCOME_MESSAGE_LITERAL__,
});

export function __NOCOBASE_SYMBOL_NAME__Provider({
  children,
}: PropsWithChildren): ReactElement {
  return (
    <__NOCOBASE_SYMBOL_NAME__Context.Provider value={contextValue}>
      {children}
    </__NOCOBASE_SYMBOL_NAME__Context.Provider>
  );
}
