import type { AppClient } from '@nocobase/app-sdk';
import { createContext, type Context, useContext } from 'react';

export const AppClientContext: Context<AppClient | undefined> = createContext<
  AppClient | undefined
>(undefined);

export function useAppClient(): AppClient {
  const client = useContext(AppClientContext);
  if (!client) {
    throw new Error('App client is not available in the current React tree.');
  }
  return client;
}
