import type { PropsWithChildren, ReactElement } from 'react';

import { AuditLogContext, type AuditLogContextValue } from '../contexts.js';

const contextValue: AuditLogContextValue = Object.freeze({
  welcomeMessage: 'Welcome from @nocobase/app-plugin-audit-log',
});

export function AuditLogProvider({
  children,
}: PropsWithChildren): ReactElement {
  return (
    <AuditLogContext.Provider value={contextValue}>
      {children}
    </AuditLogContext.Provider>
  );
}
