import { Input, Label } from '@nocobase/app-client/ui';
import { useState, type ReactElement, type ReactNode } from 'react';
import type {
  AccessScope,
  AuthorizationOptions,
  AuthorizationRecordOption,
  AuthorizationSubject,
  AuthorizationUser,
} from '../authorization-client.js';

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm';

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}): ReactElement {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      {children}
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}

export function ResourceEditor({
  options,
  type,
  id,
  onChange,
}: {
  options: AuthorizationOptions;
  type: string;
  id: string;
  onChange: (value: { type: string; id: string }) => void;
}): ReactElement {
  const selected = options.resourceTypes.find((item) => item.value === type);
  return (
    <>
      <Field label='Resource type'>
        <select
          className={selectClass}
          value={type}
          onChange={(event) => {
            const next = options.resourceTypes.find(
              (item) => item.value === event.target.value,
            );
            onChange({
              type: event.target.value,
              id: next?.resources[0]?.value ?? '',
            });
          }}
        >
          {options.resourceTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label='Resource'>
        {selected && selected.resources.length > 0 ? (
          <select
            className={selectClass}
            value={id}
            onChange={(event) => onChange({ type, id: event.target.value })}
          >
            {selected.resources.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            required
            placeholder='Resource ID'
            value={id}
            onChange={(event) => onChange({ type, id: event.target.value })}
          />
        )}
      </Field>
    </>
  );
}

export function ActionsEditor({
  options,
  resourceType,
  resourceId,
  value,
  onChange,
}: {
  options: AuthorizationOptions;
  resourceType: string;
  resourceId?: string;
  value: readonly string[];
  onChange: (value: readonly string[]) => void;
}): ReactElement {
  const selectedType = options.resourceTypes.find(
    (item) => item.value === resourceType,
  );
  const actions =
    selectedType?.resources.find((item) => item.value === resourceId)
      ?.actions ??
    selectedType?.actions ??
    [];
  const orderedActions = [...actions].sort((left, right) => {
    const order = ['create', 'read', 'update', 'delete'];
    const leftIndex = order.indexOf(left.value);
    const rightIndex = order.indexOf(right.value);
    return (
      (leftIndex < 0 ? order.length : leftIndex) -
      (rightIndex < 0 ? order.length : rightIndex)
    );
  });
  if (actions.length === 0)
    return (
      <Field label='Actions'>
        <Input
          required
          placeholder='read, create, update'
          value={value.join(', ')}
          onChange={(event) => onChange(csv(event.target.value))}
        />
      </Field>
    );
  return (
    <Field label='Actions'>
      <div className='flex min-h-9 flex-wrap items-center gap-4 rounded-lg border px-3 py-2'>
        {orderedActions.map((action) => (
          <label className='flex items-center gap-2 text-sm' key={action.value}>
            <input
              type='checkbox'
              checked={value.includes(action.value)}
              onChange={(event) => {
                const selected = new Set(
                  event.target.checked
                    ? [...value, action.value]
                    : value.filter((item) => item !== action.value),
                );
                onChange(
                  orderedActions
                    .map((item) => item.value)
                    .filter((item) => selected.has(item)),
                );
              }}
            />
            {action.label}
          </label>
        ))}
      </div>
    </Field>
  );
}

export function SubjectEditor({
  users,
  value,
  onChange,
}: {
  users: readonly AuthorizationUser[];
  value: AuthorizationSubject;
  onChange: (value: AuthorizationSubject) => void;
}): ReactElement {
  return (
    <>
      <Field label='Who'>
        <select
          className={selectClass}
          value={value.type}
          onChange={(event) =>
            onChange(
              event.target.value === 'authenticated'
                ? { type: 'authenticated', id: '*' }
                : { type: 'user', id: users[0]?.id ?? '' },
            )
          }
        >
          <option value='authenticated'>All signed-in users</option>
          <option value='user'>Specific user</option>
        </select>
      </Field>
      {value.type === 'user' ? (
        <Field label='User'>
          <select
            className={selectClass}
            required
            value={value.id}
            onChange={(event) =>
              onChange({ type: 'user', id: event.target.value })
            }
          >
            <option value=''>Select a user</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.username ?? user.email}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className='self-end pb-2 text-xs text-muted-foreground'>
          Applies to every user with a valid signed-in session.
        </p>
      )}
    </>
  );
}

export function SubjectsEditor({
  users,
  value,
  onChange,
}: {
  users: readonly AuthorizationUser[];
  value: readonly AuthorizationSubject[];
  onChange: (value: readonly AuthorizationSubject[]) => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visible = users.filter(
    (user) =>
      !query ||
      [user.name, user.username, user.email].some((item) =>
        item?.toLowerCase().includes(query),
      ),
  );
  const audience = value.some((item) => item.type === 'authenticated');
  const selectedUsers = new Set(
    value.filter((item) => item.type === 'user').map((item) => item.id),
  );
  function setAudience(checked: boolean): void {
    onChange(
      checked
        ? [
            { type: 'authenticated', id: '*' },
            ...value.filter((item) => item.type !== 'authenticated'),
          ]
        : value.filter((item) => item.type !== 'authenticated'),
    );
  }
  function setUser(id: string, checked: boolean): void {
    onChange(
      checked
        ? [...value, { type: 'user', id }]
        : value.filter((item) => item.type !== 'user' || item.id !== id),
    );
  }
  return (
    <section className='space-y-3 rounded-lg border p-4'>
      <div>
        <h4 className='text-sm font-medium'>Assignments</h4>
        <p className='text-xs text-muted-foreground'>
          Choose an audience or multiple users.
        </p>
      </div>
      <label className='flex items-start gap-3 rounded-md border p-3'>
        <input
          className='mt-1'
          type='checkbox'
          checked={audience}
          onChange={(event) => setAudience(event.target.checked)}
        />
        <span>
          <span className='block text-sm font-medium'>All signed-in users</span>
          <span className='block text-xs text-muted-foreground'>
            Authenticated audience
          </span>
        </span>
      </label>
      <Input
        type='search'
        placeholder='Search name, username, or email'
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className='max-h-56 divide-y overflow-y-auto rounded-md border'>
        {visible.map((user) => (
          <label
            className='flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/20'
            key={user.id}
          >
            <input
              className='mt-1'
              type='checkbox'
              checked={selectedUsers.has(user.id)}
              onChange={(event) => setUser(user.id, event.target.checked)}
            />
            <span className='min-w-0'>
              <span className='block truncate text-sm font-medium'>
                {user.name}
              </span>
              <span className='block truncate text-xs text-muted-foreground'>
                {[user.username, user.email].filter(Boolean).join(' · ')}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className='text-xs text-muted-foreground'>
        {value.length} assignment{value.length === 1 ? '' : 's'} selected
      </p>
    </section>
  );
}

export function ScopeEditor({
  options,
  fields = [],
  allowIds = true,
  records = [],
  value,
  onChange,
}: {
  options: AuthorizationOptions;
  fields?: readonly string[];
  allowIds?: boolean;
  records?: readonly AuthorizationRecordOption[];
  value: AccessScope;
  onChange: (value: AccessScope) => void;
}): ReactElement {
  return (
    <div className='grid gap-3 md:grid-cols-2'>
      <Field label='Record scope'>
        <select
          className={selectClass}
          value={value.type}
          onChange={(event) => {
            const type = event.target.value;
            onChange(
              type === 'ids'
                ? { type: 'ids', ids: [] }
                : type === 'database'
                  ? {
                      type: 'database',
                      recordAccess:
                        options.recordAccessPolicies[0]?.value ?? 'allRecords',
                    }
                  : { type: 'all' },
            );
          }}
        >
          <option value='all'>All records</option>
          {allowIds ? <option value='ids'>Specific record IDs</option> : null}
          <option value='database'>Record Access Policy</option>
        </select>
      </Field>
      {value.type === 'ids' ? (
        <RecordScopeEditor
          records={records}
          value={value.ids}
          onChange={(ids) => onChange({ type: 'ids', ids })}
        />
      ) : null}
      {value.type === 'database' ? (
        <>
          <Field label='Record Access Policy'>
            <select
              className={selectClass}
              value={recordAccessKey(value.recordAccess)}
              onChange={(event) =>
                onChange({
                  type: 'database',
                  recordAccess:
                    event.target.value === 'customFilter'
                      ? {
                          key: 'customFilter',
                          params: { filter: { $and: [] } },
                        }
                      : event.target.value,
                })
              }
            >
              {options.recordAccessPolicies.map((policy) => (
                <option key={policy.value} value={policy.value}>
                  {policy.label}
                </option>
              ))}
            </select>
          </Field>
          {recordAccessKey(value.recordAccess) === 'customFilter' ? (
            <CustomFilterEditor
              fields={fields}
              value={value.recordAccess}
              onChange={(recordAccess) =>
                onChange({ type: 'database', recordAccess })
              }
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ActionScopesEditor({
  options,
  resourceType,
  resourceId,
  fields = [],
  records = [],
  value,
  onChange,
}: {
  options: AuthorizationOptions;
  resourceType: string;
  resourceId?: string;
  fields?: readonly string[];
  records?: readonly AuthorizationRecordOption[];
  value: readonly { action: string; scope: AccessScope }[];
  onChange: (value: readonly { action: string; scope: AccessScope }[]) => void;
}): ReactElement {
  const [active, setActive] = useState(value[0]?.action ?? '');
  const selectedActions = value.map((item) => item.action);
  const current = value.find((item) => item.action === active) ?? value[0];
  return (
    <div className='space-y-3'>
      <ActionsEditor
        options={options}
        resourceType={resourceType}
        resourceId={resourceId}
        value={selectedActions}
        onChange={(actions) => {
          onChange(
            actions.map(
              (action) =>
                value.find((item) => item.action === action) ?? {
                  action,
                  scope: initialScope(options),
                },
            ),
          );
          if (!actions.includes(active)) setActive(actions[0] ?? '');
        }}
      />
      {value.length > 0 ? (
        <section className='overflow-hidden rounded-lg border'>
          <div className='flex flex-wrap gap-1 border-b bg-muted/20 p-2'>
            {value.map((item) => (
              <button
                className={`rounded px-3 py-1.5 text-xs font-medium ${current?.action === item.action ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                key={item.action}
                type='button'
                onClick={() => setActive(item.action)}
              >
                {humanize(item.action)}
              </button>
            ))}
          </div>
          {current ? (
            <div className='p-4'>
              <ScopeEditor
                options={options}
                fields={fields}
                records={records}
                value={current.scope}
                onChange={(scope) =>
                  onChange(
                    value.map((item) =>
                      item.action === current.action
                        ? { ...item, scope }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function RecordScopeEditor({
  records,
  value,
  onChange,
}: {
  records: readonly AuthorizationRecordOption[];
  value: readonly string[];
  onChange: (value: readonly string[]) => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visible = records.filter(
    (record) =>
      !query ||
      [record.label, record.description, record.id].some((item) =>
        item?.toLowerCase().includes(query),
      ),
  );
  return (
    <div className='space-y-2 md:col-span-2'>
      <Field label='Records'>
        <Input
          type='search'
          placeholder='Search records'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <div className='max-h-56 divide-y overflow-y-auto rounded-md border'>
        {visible.map((record) => (
          <label
            className='flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/20'
            key={record.id}
          >
            <input
              className='mt-1'
              type='checkbox'
              checked={value.includes(record.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, record.id]
                    : value.filter((id) => id !== record.id),
                )
              }
            />
            <span>
              <span className='block text-sm font-medium'>{record.label}</span>
              {record.description ? (
                <span className='block text-xs text-muted-foreground'>
                  {record.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      <p className='text-xs text-muted-foreground'>
        {value.length} record{value.length === 1 ? '' : 's'} selected
      </p>
    </div>
  );
}

type FilterOperator =
  '$eq' | '$ne' | '$in' | '$notIn' | '$gt' | '$gte' | '$lt' | '$lte';
interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: string;
}

function CustomFilterEditor({
  fields,
  value,
  onChange,
}: {
  fields: readonly string[];
  value: string | { key: string; params?: unknown };
  onChange: (value: { key: string; params: unknown }) => void;
}): ReactElement {
  const conditions = readConditions(value);
  function update(next: readonly FilterCondition[]): void {
    onChange({
      key: 'customFilter',
      params: {
        filter: {
          $and: next.map((condition) => ({
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
        },
      },
    });
  }
  return (
    <div className='space-y-2 md:col-span-2'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium'>Filter conditions</span>
        <button
          className='text-xs font-medium text-primary'
          type='button'
          onClick={() =>
            update([
              ...conditions,
              { field: fields[0] ?? '', operator: '$eq', value: '' },
            ])
          }
        >
          Add condition
        </button>
      </div>
      {conditions.map((condition, index) => (
        <div
          className='grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]'
          key={`${condition.field}-${condition.operator}-${condition.value}`}
        >
          <select
            className={selectClass}
            value={condition.field}
            onChange={(event) =>
              update(
                conditions.map((item, current) =>
                  current === index
                    ? { ...item, field: event.target.value }
                    : item,
                ),
              )
            }
          >
            {fields.map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={condition.operator}
            onChange={(event) =>
              update(
                conditions.map((item, current) =>
                  current === index
                    ? {
                        ...item,
                        operator: event.target.value as FilterOperator,
                      }
                    : item,
                ),
              )
            }
          >
            <option value='$eq'>Equals</option>
            <option value='$ne'>Not equal</option>
            <option value='$in'>In</option>
            <option value='$notIn'>Not in</option>
            <option value='$gt'>Greater than</option>
            <option value='$gte'>At least</option>
            <option value='$lt'>Less than</option>
            <option value='$lte'>At most</option>
          </select>
          <Input
            value={condition.value}
            onChange={(event) =>
              update(
                conditions.map((item, current) =>
                  current === index
                    ? { ...item, value: event.target.value }
                    : item,
                ),
              )
            }
          />
          <button
            className='text-xs text-destructive'
            type='button'
            onClick={() =>
              update(conditions.filter((_item, current) => current !== index))
            }
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function recordAccessKey(value: string | { key: string }): string {
  return typeof value === 'string' ? value : value.key;
}

function readConditions(
  value: string | { key: string; params?: unknown },
): readonly FilterCondition[] {
  if (typeof value === 'string') return [];
  const params = isRecord(value.params) ? value.params : undefined;
  const filter = isRecord(params?.filter) ? params.filter : undefined;
  const items = Array.isArray(filter?.$and) ? filter.$and : [];
  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const field = Object.entries(item)[0];
    if (!field || !isRecord(field[1])) return [];
    const operation = Object.entries(field[1])[0];
    if (!operation) return [];
    return [
      {
        field: field[0],
        operator: operation[0] as FilterOperator,
        value: Array.isArray(operation[1])
          ? operation[1].join(', ')
          : primitiveText(operation[1]),
      },
    ];
  });
}

function primitiveText(value: unknown): string {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function initialScope(options: AuthorizationOptions): AccessScope {
  const policy = options.recordAccessPolicies[0];
  return policy
    ? { type: 'database', recordAccess: policy.value }
    : { type: 'all' };
}

function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// eslint-disable-next-line react-refresh/only-export-components
export function csv(value: string): readonly string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
