import {
  createContext,
  useContext,
  type Context,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { HubApplicationRecord } from '../domain/applications-data.js';

export interface HubApplicationsContextValue {
  readonly applications: HubApplicationRecord[];
  readonly setApplications: Dispatch<SetStateAction<HubApplicationRecord[]>>;
}

export const HubApplicationsContext: Context<
  HubApplicationsContextValue | undefined
> = createContext<HubApplicationsContextValue | undefined>(undefined);

export function useHubApplications(): HubApplicationsContextValue {
  const context = useContext(HubApplicationsContext);
  if (!context) {
    throw new Error(
      'useHubApplications must be used within HubApplicationsProvider.',
    );
  }
  return context;
}
