import { useEffect, useState } from 'react';
import { getAuthorizationClient } from '../runtime.js';

const actions = ['create', 'update', 'delete', 'assign', 'configure'] as const;
type Action = (typeof actions)[number];
export function useSettingsActions(
  id: string,
): Readonly<Record<Action, boolean>> {
  const [allowed, setAllowed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let active = true;
    const client = getAuthorizationClient();
    const load = () => {
      void Promise.all(
        actions.map(
          async (action) =>
            [
              action,
              await client.can({ type: 'settings', id }, action),
            ] as const,
        ),
      )
        .then((results) => {
          if (active)
            setAllowed(
              new Set(
                results.filter(([, can]) => can).map(([action]) => action),
              ),
            );
        })
        .catch(() => {
          if (active) setAllowed(new Set());
        });
    };
    load();
    const unsubscribe = client.onPermissionsInvalidated(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id]);
  return Object.fromEntries(
    actions.map((action) => [action, allowed.has(action)]),
  ) as Record<Action, boolean>;
}
