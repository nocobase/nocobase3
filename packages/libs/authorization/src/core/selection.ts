/** Which records of a collection an action reaches. */
export type RecordSelection =
  | { readonly type: 'all' }
  | { readonly type: 'records'; readonly ids: readonly string[] }
  | {
      readonly type: 'recordAccess';
      readonly key: string;
      readonly params?: unknown;
    };

export interface RecordSelectionHelpers {
  all(): RecordSelection;
  records(ids: readonly string[]): RecordSelection;
  recordAccess(key: string, params?: unknown): RecordSelection;
}

export const selection: RecordSelectionHelpers = {
  all: () => ({ type: 'all' }),
  records: (ids) => ({ type: 'records', ids: [...ids] }),
  recordAccess: (key, params) =>
    params === undefined
      ? { type: 'recordAccess', key }
      : { type: 'recordAccess', key, params: structuredClone(params) },
};

/** Validates an untrusted value, returning it as a detached selection. */
export function parseRecordSelection(value: unknown): RecordSelection {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const type: unknown = Reflect.get(value, 'type');
    if (type === 'all') return selection.all();
    const ids: unknown = Reflect.get(value, 'ids');
    if (
      type === 'records' &&
      Array.isArray(ids) &&
      ids.every((id): id is string => typeof id === 'string' && id !== '')
    )
      return selection.records(ids);
    const key: unknown = Reflect.get(value, 'key');
    if (type === 'recordAccess' && typeof key === 'string' && key)
      return selection.recordAccess(key, Reflect.get(value, 'params'));
  }
  throw new TypeError('Invalid record selection');
}
