import { useCan } from '../use-can.js';

type Action = 'create' | 'update' | 'delete' | 'assign';

export function useSettingsActions(
  id: string,
): Readonly<Record<Action, boolean>> {
  const resource = { type: 'settings', id };
  return {
    create: useCan({ resource, action: 'create' }).can,
    update: useCan({ resource, action: 'update' }).can,
    delete: useCan({ resource, action: 'delete' }).can,
    assign: useCan({ resource, action: 'assign' }).can,
  };
}
