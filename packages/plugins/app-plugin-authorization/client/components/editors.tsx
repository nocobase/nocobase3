import { resourceSections } from './resource-sections.js';
import { Checkbox } from './ui/checkbox.js';
import { SelectField } from './select-field.js';
import { CustomFilterEditor } from './filter-editor.js';
import { emptyFilter } from './filter-ast.js';
import { actionLabel } from './action-labels.js';
import { useState, type ReactElement, type ReactNode } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import { SearchField } from './filters.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import type {
  AccessScope,
  AuthorizationOptions,
  AuthorizationRecordOption,
} from '../authorization-client.js';

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-background px-3 text-sm';

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
  const t = useAuthorizationTranslation();
  const sections = resourceSections(options);
  const selected =
    sections.find(
      (item) =>
        item.value === type &&
        item.resources.some((resource) => resource.value === id),
    ) ?? sections.find((item) => item.value === type);
  return (
    <>
      <Field label={t('editors.resourceGroup')}>
        <SelectField
          aria-label={t('editors.resourceGroup')}
          className={selectClass}
          value={selected?.key ?? type}
          onValueChange={(selectedValue) => {
            const next = sections.find((item) => item.key === selectedValue);
            onChange({
              type: next?.value ?? selectedValue,
              id: next?.resources[0]?.value ?? '',
            });
          }}
          options={sections.map((item) => ({
            value: item.key,
            label: item.label,
          }))}
        />
      </Field>
      <Field label={t('editors.resource')}>
        {selected && selected.resources.length > 0 ? (
          <SelectField
            aria-label={t('editors.resource')}
            className={selectClass}
            value={id}
            onValueChange={(selectedValue) =>
              onChange({ type, id: selectedValue })
            }
            options={selected.resources.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
          />
        ) : (
          <Input
            required
            placeholder={t('editors.resourceIdPlaceholder')}
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
  const t = useAuthorizationTranslation();
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
      <Field label={t('editors.actions')}>
        <Input
          required
          placeholder={t('editors.actionsPlaceholder')}
          value={value.join(', ')}
          onChange={(event) => onChange(csv(event.target.value))}
        />
      </Field>
    );
  return (
    <Field label={t('editors.actions')}>
      <div className='flex min-h-9 flex-wrap items-center gap-4 rounded-lg border px-3 py-2'>
        {orderedActions.map((action) => (
          <label className='flex items-center gap-2 text-sm' key={action.value}>
            <Checkbox
              checked={value.includes(action.value)}
              onCheckedChange={(checked) => {
                const selected = new Set(
                  checked
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

export function ScopeEditor({
  compact = false,
  options,
  fields = [],
  allowIds = true,
  records = [],
  value,
  onChange,
}: {
  compact?: boolean;
  options: AuthorizationOptions;
  fields?: readonly string[];
  allowIds?: boolean;
  records?: readonly AuthorizationRecordOption[];
  value: AccessScope;
  onChange: (value: AccessScope) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  if (compact)
    return (
      <div className='min-w-0 space-y-2 text-sm font-normal'>
        <SelectField
          aria-label={t('editors.recordScope')}
          className={selectClass}
          value={
            value.type === 'database'
              ? recordAccessKey(value.recordAccess) === 'allRecords'
                ? 'all'
                : `policy:${recordAccessKey(value.recordAccess)}`
              : value.type
          }
          options={[
            { value: 'all', label: t('labels.allRecords') },
            ...(allowIds
              ? [{ value: 'ids', label: t('editors.specificRecordIds') }]
              : []),
            ...options.recordAccessPolicies
              .filter((policy) => policy.value !== 'allRecords')
              .map((policy) => ({
                value: `policy:${policy.value}`,
                label: policy.label,
              })),
          ]}
          onValueChange={(selected) =>
            onChange(
              selected === 'ids'
                ? { type: 'ids', ids: [] }
                : selected === 'all'
                  ? { type: 'all' }
                  : {
                      type: 'database',
                      recordAccess:
                        selected === 'policy:customFilter'
                          ? {
                              key: 'customFilter',
                              params: { filter: emptyFilter() },
                            }
                          : selected.slice(7),
                    },
            )
          }
        />
        {value.type === 'ids' && (
          <RecordScopeEditor
            records={records}
            value={value.ids}
            onChange={(ids) => onChange({ type: 'ids', ids })}
          />
        )}
        {value.type === 'database' &&
          recordAccessKey(value.recordAccess) === 'customFilter' && (
            <CustomFilterEditor
              fields={fields}
              value={value.recordAccess}
              onChange={(recordAccess) =>
                onChange({ type: 'database', recordAccess })
              }
            />
          )}
      </div>
    );
  return (
    <div className='grid gap-3'>
      <Field label={t('editors.recordScope')}>
        <SelectField
          aria-label={t('editors.recordScope')}
          className={selectClass}
          value={value.type}
          onValueChange={(selectedValue) => {
            const type = selectedValue;
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
          options={[
            { value: 'all', label: t('labels.allRecords') },
            ...(allowIds
              ? [{ value: 'ids', label: t('editors.specificRecordIds') }]
              : []),
            { value: 'database', label: t('editors.recordAccessPolicy') },
          ]}
        />
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
          <Field label={t('editors.recordAccessPolicy')}>
            <SelectField
              aria-label={t('editors.recordAccessPolicy')}
              className={selectClass}
              value={recordAccessKey(value.recordAccess)}
              onValueChange={(selectedValue) =>
                onChange({
                  type: 'database',
                  recordAccess:
                    selectedValue === 'customFilter'
                      ? {
                          key: 'customFilter',
                          params: { filter: emptyFilter() },
                        }
                      : selectedValue,
                })
              }
              options={options.recordAccessPolicies.map((policy) => ({
                value: policy.value,
                label: policy.label,
              }))}
            />
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
  const selectedActions = value.map((item) => item.action);
  return (
    <div className='space-y-4'>
      <ActionsEditor
        options={options}
        resourceType={resourceType}
        resourceId={resourceId}
        value={selectedActions}
        onChange={(actions) =>
          onChange(
            actions.map(
              (action) =>
                value.find((item) => item.action === action) ?? {
                  action,
                  scope: initialScope(options),
                },
            ),
          )
        }
      />
      {value.map((current) => (
        <section
          key={current.action}
          className='space-y-3 rounded-lg border p-4'
        >
          <h4 className='font-medium'>
            {actionLabel(options, resourceType, current.action)}
          </h4>
          <ScopeEditor
            options={options}
            fields={fields}
            records={records}
            value={current.scope}
            onChange={(scope) =>
              onChange(
                value.map((item) =>
                  item.action === current.action ? { ...item, scope } : item,
                ),
              )
            }
          />
        </section>
      ))}
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
  const t = useAuthorizationTranslation();
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
      <Field label={t('editors.records')}>
        <SearchField
          className='sm:max-w-none'
          label={t('editors.searchRecords')}
          placeholder={t('editors.searchRecords')}
          value={search}
          onChange={setSearch}
        />
      </Field>
      <div className='max-h-56 divide-y overflow-y-auto rounded-md border'>
        {visible.map((record) => (
          <label
            className='flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/20'
            key={record.id}
          >
            <Checkbox
              className='mt-1'
              checked={value.includes(record.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, record.id]
                    : value.filter((id) => id !== record.id),
                )
              }
            />
            <span>
              <span className='block text-sm font-normal'>{record.label}</span>
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
        {t(`editors.recordsSelected.${value.length === 1 ? 'one' : 'other'}`, {
          count: value.length,
        })}
      </p>
    </div>
  );
}

function recordAccessKey(value: string | { key: string }): string {
  return typeof value === 'string' ? value : value.key;
}

function initialScope(options: AuthorizationOptions): AccessScope {
  const policy = options.recordAccessPolicies[0];
  return policy
    ? { type: 'database', recordAccess: policy.value }
    : { type: 'all' };
}

// eslint-disable-next-line react-refresh/only-export-components
export function csv(value: string): readonly string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export { SubjectsEditor } from './subjects-editor.js';
