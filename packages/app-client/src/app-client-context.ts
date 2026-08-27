import { createAppClient, type AppClient } from '@nocobase/app-sdk';
import { createContext, useContext, type Context } from 'react';

export const defaultAppClient: AppClient = createAppClient();
export const AppClientContext: Context<AppClient> =
  createContext<AppClient>(defaultAppClient);

export function useAppClient(): AppClient {
  return useContext(AppClientContext);
}
