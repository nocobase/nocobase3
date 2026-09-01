import {
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import {
  HubApplicationsContext,
  type HubApplicationsContextValue,
} from '../contexts/hub-applications.js';
import {
  createApplicationFixtures,
  type HubApplicationRecord,
} from '../domain/applications-data.js';

export function HubApplicationsProvider({
  children,
}: PropsWithChildren): ReactElement {
  const [applications, setApplications] = useState<HubApplicationRecord[]>(
    createApplicationFixtures,
  );
  const value = useMemo<HubApplicationsContextValue>(
    () => ({ applications, setApplications }),
    [applications],
  );

  return (
    <HubApplicationsContext.Provider value={value}>
      {children}
    </HubApplicationsContext.Provider>
  );
}
