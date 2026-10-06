import { useState } from 'react';
import { useApiClient } from '@nocobase/app-client';

import type { Overview } from '../../shared/types.js';
import { exampleApi } from '../lib/api.js';
import { useLoader } from '../lib/use-loader.js';

export interface OverviewData {
  readonly data: Overview | undefined;
  readonly error: string;
  readonly reload: () => Promise<void>;
}

/** Every record and the persona's to-do center, refreshed while the page is open. */
export function useOverview(actor: string): OverviewData {
  const client = useApiClient();
  return useLoader(
    () => exampleApi(client).overview(actor),
    `approval-example:${actor}`,
  );
}

/** Whether the persona administers approvals, as the organization says now. */
export function isAdminOf(
  overview: Overview | undefined,
  actor: string,
): boolean {
  return (
    overview?.people
      .find((person) => person.id === actor)
      ?.roles.includes('approvalAdmin') === true
  );
}

interface Opened {
  readonly lifecycle: string;
  readonly id: string;
}

/** A detail pane that can follow links to children and come back. */
export function useOpened(): {
  readonly current: Opened | undefined;
  readonly previous: Opened | undefined;
  readonly open: (lifecycle: string, id: string) => void;
  readonly select: (lifecycle: string, id: string) => void;
  readonly back: () => void;
  readonly clear: () => void;
} {
  const [stack, setStack] = useState<Opened[]>([]);
  return {
    current: stack.at(-1),
    previous: stack.at(-2),
    open: (lifecycle, id) => setStack((items) => [...items, { lifecycle, id }]),
    select: (lifecycle, id) => setStack([{ lifecycle, id }]),
    back: () => setStack((items) => items.slice(0, -1)),
    clear: () => setStack([]),
  };
}
