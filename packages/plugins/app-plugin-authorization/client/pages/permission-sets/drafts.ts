import type {
  AuthorizationOptions,
  PermissionGrant,
  PermissionSet,
} from '../../authorization-client.js';
import type {
  DatabaseActionDraft,
  Draft,
  FilterConditionDraft,
  GrantDraft,
  RecordAccessDraft,
} from './types.js';

let nextId = 0;

/** Draft rows are keyed by an id the server never sees. */
export function nextDraftId(): number {
  return ++nextId;
}

export function toInput(draft: Draft): {
  key: string;
  title?: string;
  grants: readonly PermissionGrant[];
} {
  return {
    key: draft.key.trim(),
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    grants: draft.grants.map((grant) => ({
      resource: grant.resource,
      actions: grant.actions.map((action) =>
        grant.resource.type === 'database.collection'
          ? {
              action,
              policy: databasePolicyForAction(
                action,
                grant.database[action] ?? defaultDatabaseActionDraft(),
              ),
            }
          : { action },
      ),
    })),
  };
}

export function newGrantForResource(type: string, id: string): GrantDraft {
  return {
    id: nextDraftId(),
    resource: {
      type,
      id,
    },
    actions: [],
    database: {},
  };
}

export function empty(): Draft {
  return { key: '', title: '', grants: [] };
}

export function hasEmptyCustomFilter(draft: Draft): boolean {
  return draft.grants.some((grant) =>
    Object.values(grant.database).some((value) => {
      if (recordAccessKey(value.recordAccess) !== 'customFilter') return false;
      const conditions = customFilterConditions(value.recordAccess);
      return conditions.length === 0 || conditions.some((item) => !item.field);
    }),
  );
}

export function fromSet(set: PermissionSet): Draft {
  return {
    originalKey: set.key,
    key: set.key,
    title: set.title ?? '',
    grants: set.grants.map((grant) => {
      return {
        id: nextDraftId(),
        resource: grant.resource,
        actions: grant.actions.map((action) => action.action),
        database: Object.fromEntries(
          grant.actions.map((action) => [
            action.action,
            databaseActionFromPolicy(action.policy),
          ]),
        ),
      };
    }),
  };
}

export function defaultDatabaseActionDraft(
  options?: AuthorizationOptions,
): DatabaseActionDraft {
  return {
    input: '*',
    output: '*',
    recordAccess: options?.recordAccessPolicies[0]?.value ?? 'allRecords',
  };
}

export function databasePolicyForAction(
  action: string,
  value: DatabaseActionDraft,
): Readonly<Record<string, unknown>> & { type: string } {
  const fields = {
    ...(action === 'create' || action === 'update'
      ? { input: value.input }
      : {}),
    ...(action === 'create' || action === 'read' || action === 'update'
      ? { output: value.output }
      : {}),
  };
  return {
    type: 'database',
    ...(Object.keys(fields).length === 0 ? {} : { fields }),
    ...(action === 'create' ? {} : { recordAccess: [value.recordAccess] }),
  };
}

export function databaseActionFromPolicy(
  policy: (Readonly<Record<string, unknown>> & { type: string }) | undefined,
): DatabaseActionDraft {
  const fields = readRecord(policy?.fields);
  const recordAccess = readArray(policy?.recordAccess)?.[0];
  return {
    input: readFields(fields?.input),
    output: readFields(fields?.output),
    recordAccess:
      typeof recordAccess === 'string' || isRecordAccessValue(recordAccess)
        ? recordAccess
        : 'allRecords',
  };
}

export function recordAccessKey(value: RecordAccessDraft): string {
  return typeof value === 'string' ? value : value.key;
}

export function customFilterConditions(
  value: RecordAccessDraft,
): readonly FilterConditionDraft[] {
  if (typeof value === 'string' || value.key !== 'customFilter') return [];
  const params = readRecord(value.params);
  const filter = readRecord(params?.filter);
  const items = readArray(filter?.$and) ?? [];
  return items.flatMap((item, index) => {
    const condition = readRecord(item);
    const entry = condition ? Object.entries(condition)[0] : undefined;
    const expression = readRecord(entry?.[1]);
    const operation = expression ? Object.entries(expression)[0] : undefined;
    if (!entry || !operation) return [];
    return [
      {
        id: index + 1,
        field: entry[0],
        operator: operation[0] as FilterConditionDraft['operator'],
        value: Array.isArray(operation[1])
          ? operation[1].join(', ')
          : filterValueText(operation[1]),
      },
    ];
  });
}

export function filterFromConditions(
  conditions: readonly FilterConditionDraft[],
): Readonly<Record<string, unknown>> {
  return {
    $and: conditions.map((condition) => ({
      [condition.field]: {
        [condition.operator]:
          condition.operator === '$in' || condition.operator === '$notIn'
            ? condition.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : condition.value,
      },
    })),
  };
}

export function resourceKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}

function filterValueText(value: unknown): string {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function isRecordAccessValue(value: unknown): value is RecordAccessDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'key') === 'string'
  );
}

function readRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readFields(value: unknown): '*' | readonly string[] {
  return value === '*' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    ? value
    : '*';
}

function readArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
