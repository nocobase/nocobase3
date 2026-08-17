import type { BaseKey } from "@refinedev/core";

type RecordPermissionEntry = {
  allowedIds: Map<string, Set<string>>;
  knownIds: Map<string, Set<string>>;
};

let permissions = new Map<string, RecordPermissionEntry>();
const listeners = new Set<() => void>();

const getKey = (dataSourceKey: string, resource: string) =>
  `${dataSourceKey}:${resource}`;

export const clearRecordPermissions = () => {
  if (!permissions.size) return;
  permissions = new Map();
  listeners.forEach((listener) => listener());
};

export const subscribeRecordPermissions = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getRecordPermissions = () => permissions;

export const updateRecordPermissions = ({
  dataSourceKey = "main",
  resource,
  recordIds,
  allowedActions,
}: {
  dataSourceKey?: string;
  resource: string;
  recordIds: BaseKey[];
  allowedActions?: Record<string, BaseKey[]>;
}) => {
  if (!allowedActions) return false;

  const key = getKey(dataSourceKey, resource);
  const existingEntry = permissions.get(key);
  const entry = existingEntry
    ? {
        allowedIds: new Map(
          Array.from(existingEntry.allowedIds, ([action, ids]) => [
            action,
            new Set(ids),
          ])
        ),
        knownIds: new Map(
          Array.from(existingEntry.knownIds, ([action, ids]) => [
            action,
            new Set(ids),
          ])
        ),
      }
    : {
        allowedIds: new Map<string, Set<string>>(),
        knownIds: new Map<string, Set<string>>(),
      };
  const normalizedIds = new Set(recordIds.map(String));
  const normalizedAllowedActions = new Map(
    Object.entries(allowedActions).map(([action, ids]) => [
      action,
      new Set(ids.map(String)),
    ])
  );
  const actionNames = new Set([
    ...entry.knownIds.keys(),
    ...normalizedAllowedActions.keys(),
  ]);
  let changed = false;

  for (const action of actionNames) {
    const previousAllowedIds = entry.allowedIds.get(action);
    const previousKnownIds = entry.knownIds.get(action);
    const nextAllowedIds = normalizedAllowedActions.get(action);
    const nextKnown = Boolean(nextAllowedIds);
    for (const id of normalizedIds) {
      const previousKnown = Boolean(previousKnownIds?.has(id));
      if (
        previousKnown !== nextKnown ||
        (nextKnown &&
          Boolean(previousAllowedIds?.has(id)) !==
            Boolean(nextAllowedIds?.has(id)))
      ) {
        changed = true;
      }
    }
  }

  for (const action of actionNames) {
    const allowedIds = entry.allowedIds.get(action);
    const knownIds = entry.knownIds.get(action);
    for (const id of normalizedIds) {
      allowedIds?.delete(id);
      knownIds?.delete(id);
    }
  }

  for (const [action, ids] of normalizedAllowedActions) {
    const allowedIds = entry.allowedIds.get(action) ?? new Set<string>();
    const knownIds = entry.knownIds.get(action) ?? new Set<string>();
    ids.forEach((id) => allowedIds.add(id));
    normalizedIds.forEach((id) => knownIds.add(id));
    entry.allowedIds.set(action, allowedIds);
    entry.knownIds.set(action, knownIds);
  }

  if (changed) {
    permissions = new Map(permissions);
    permissions.set(key, entry);
    listeners.forEach((listener) => listener());
  }
  return changed;
};

export const getRecordActionPermission = ({
  dataSourceKey = "main",
  resource,
  action,
  id,
  actionAlias,
}: {
  dataSourceKey?: string;
  resource: string;
  action: string;
  id: BaseKey;
  actionAlias?: Record<string, string>;
}): boolean | undefined => {
  const entry = permissions.get(getKey(dataSourceKey, resource));
  if (!entry) return undefined;

  const canonicalAction = actionAlias?.[action] ?? action;
  const targetAction = entry.knownIds.has(canonicalAction)
    ? canonicalAction
    : action;
  const recordId = String(id);
  if (!entry.knownIds.get(targetAction)?.has(recordId)) return undefined;
  return Boolean(entry.allowedIds.get(targetAction)?.has(recordId));
};
