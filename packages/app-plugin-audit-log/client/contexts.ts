import { createContext, useContext, type Context } from 'react';

export interface AuditLogContextValue {
  readonly welcomeMessage: string;
}

export const AuditLogContext: Context<AuditLogContextValue | undefined> =
  createContext<AuditLogContextValue | undefined>(undefined);

export function useAuditLog(): AuditLogContextValue {
  const value = useContext(AuditLogContext);
  if (!value) {
    throw new Error('useAuditLog must be used within AuditLogProvider.');
  }
  return value;
}
