import type {
  AuthorizationOptions,
  RecordSelection,
} from '../authorization-client.js';
import { resourceActions } from './localized-options.js';

export function firstActions(
  options: AuthorizationOptions,
  type: string,
  resourceId?: string,
): readonly string[] {
  const action = resourceActions(options, { type, id: resourceId })
    .slice()
    .sort(compareActions)[0];
  return action ? [action.value] : [];
}

export function compareActions(
  left: { value: string },
  right: { value: string },
): number {
  const order = ['create', 'read', 'update', 'delete'];
  const leftIndex = order.indexOf(left.value);
  const rightIndex = order.indexOf(right.value);
  return (
    (leftIndex < 0 ? order.length : leftIndex) -
    (rightIndex < 0 ? order.length : rightIndex)
  );
}
/** The selection a new rule action starts with. */
export function defaultSelection(
  options: AuthorizationOptions,
): RecordSelection {
  const first = options.recordAccess[0];
  return first ? { type: 'recordAccess', key: first.value } : { type: 'all' };
}
