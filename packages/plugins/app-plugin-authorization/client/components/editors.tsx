import { Checkbox } from './ui/checkbox.js';
import { SelectField } from './select-field.js';
import { CustomFilterEditor } from './filter-editor.js';
import { emptyFilter } from './filter-ast.js';
import { actionLabel } from './action-labels.js';
import { useState, type ReactElement, type ReactNode } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import { SearchField } from './filters.js';
import { Label } from './ui/label.js';
import type {
  AuthorizationOptions,
  AuthorizationRecordOption,
  RecordSelection,
  ResourceOption,
} from '../authorization-client.js';

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm';

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
  const sections = resourceChoices(options);
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
        <SelectField
          aria-label={t('editors.resource')}
          className={selectClass}
          value={id}
          disabled={!selected?.resources.length}
          onValueChange={(selectedValue) =>
            onChange({ type, id: selectedValue })
          }
          options={(selected?.resources ?? []).map((item) => ({
            value: item.value,
            label: item.label,
          }))}
        />
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

/** Edits one record selection: every record, chosen records or record access. */
export function SelectionEditor({
  compact = false,
  options,
  fields = [],
  allowRecords = true,
  allowAll = true,
  records = [],
  value,
  onChange,
}: {
  compact?: boolean;
  options: AuthorizationOptions;
  fields?: readonly string[];
  allowRecords?: boolean;
  /** Sharing rules may not select every record. */
  allowAll?: boolean;
  records?: readonly AuthorizationRecordOption[];
  value: RecordSelection;
  onChange: (value: RecordSelection) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const recordAccess = (key: string): RecordSelection =>
    key === 'customFilter'
      ? {
          type: 'recordAccess',
          key,
          params: { filter: emptyFilter() },
        }
      : { type: 'recordAccess', key };
  const customFilter =
    value.type === 'recordAccess' && value.key === 'customFilter' ? (
      <CustomFilterEditor fields={fields} value={value} onChange={onChange} />
    ) : null;
  const recordPicker =
    value.type === 'records' ? (
      <RecordSelectionEditor
        records={records}
        value={value.ids}
        onChange={(ids) => onChange({ type: 'records', ids })}
      />
    ) : null;
  if (compact)
    return (
      <div className='min-w-0 space-y-2 text-sm font-normal'>
        <SelectField
          aria-label={t('editors.recordScope')}
          className={selectClass}
          value={
            value.type === 'recordAccess'
              ? value.key === 'allRecords' && allowAll
                ? 'all'
                : `policy:${value.key}`
              : value.type
          }
          options={[
            ...(allowAll
              ? [{ value: 'all', label: t('labels.allRecords') }]
              : []),
            ...(allowRecords
              ? [{ value: 'records', label: t('editors.specificRecordIds') }]
              : []),
            ...options.recordAccess
              .filter((entry) => !allowAll || entry.value !== 'allRecords')
              .map((entry) => ({
                value: `policy:${entry.value}`,
                label: entry.label,
              })),
          ]}
          onValueChange={(selected) =>
            onChange(
              selected === 'records'
                ? { type: 'records', ids: [] }
                : selected === 'all'
                  ? { type: 'all' }
                  : recordAccess(selected.slice(7)),
            )
          }
        />
        {recordPicker}
        {customFilter}
      </div>
    );
  return (
    <div className='grid gap-3'>
      <Field label={t('editors.recordScope')}>
        <SelectField
          aria-label={t('editors.recordScope')}
          className={selectClass}
          value={value.type}
          onValueChange={(type) =>
            onChange(
              type === 'records'
                ? { type: 'records', ids: [] }
                : type === 'recordAccess'
                  ? recordAccess(options.recordAccess[0]?.value ?? 'allRecords')
                  : { type: 'all' },
            )
          }
          options={[
            ...(allowAll
              ? [{ value: 'all', label: t('labels.allRecords') }]
              : []),
            ...(allowRecords
              ? [{ value: 'records', label: t('editors.specificRecordIds') }]
              : []),
            { value: 'recordAccess', label: t('editors.recordAccessPolicy') },
          ]}
        />
      </Field>
      {recordPicker}
      {value.type === 'recordAccess' ? (
        <>
          <Field label={t('editors.recordAccessPolicy')}>
            <SelectField
              aria-label={t('editors.recordAccessPolicy')}
              className={selectClass}
              value={value.key}
              onValueChange={(selected) => onChange(recordAccess(selected))}
              options={options.recordAccess.map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
            />
          </Field>
          {customFilter}
        </>
      ) : null}
    </div>
  );
}

/** Edits a collection rule's actions and the selection of each. */
export function RuleActionsEditor({
  options,
  resourceType,
  resourceId,
  fields = [],
  records = [],
  allowAll = true,
  value,
  onChange,
}: {
  options: AuthorizationOptions;
  resourceType: string;
  resourceId?: string;
  fields?: readonly string[];
  records?: readonly AuthorizationRecordOption[];
  allowAll?: boolean;
  value: readonly { action: string; selection: RecordSelection }[];
  onChange: (
    value: readonly { action: string; selection: RecordSelection }[],
  ) => void;
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
                  selection: initialSelection(options),
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
          <SelectionEditor
            options={options}
            fields={fields}
            records={records}
            allowAll={allowAll}
            value={current.selection}
            onChange={(selection) =>
              onChange(
                value.map((item) =>
                  item.action === current.action
                    ? { ...item, selection }
                    : item,
                ),
              )
            }
          />
        </section>
      ))}
    </div>
  );
}

function RecordSelectionEditor({
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

function initialSelection(options: AuthorizationOptions): RecordSelection {
  const first = options.recordAccess[0];
  return first ? { type: 'recordAccess', key: first.value } : { type: 'all' };
}

/** Resource picker entries: each type, split by its groups. */
function resourceChoices(options: AuthorizationOptions): readonly {
  key: string;
  value: string;
  label: string;
  resources: readonly ResourceOption[];
}[] {
  return options.resourceTypes.flatMap((type) => {
    const grouped = (type.groups ?? []).map((group) => ({
      key: `${type.value}\u0000${group.value}`,
      value: type.value,
      label: group.label,
      resources: type.resources.filter((item) => item.group === group.value),
    }));
    const ungrouped = type.resources.filter(
      (item) =>
        !item.group ||
        !(type.groups ?? []).some((group) => group.value === item.group),
    );
    return [
      ...grouped,
      ...(ungrouped.length || !grouped.length
        ? [
            {
              key: type.value,
              value: type.value,
              label: type.label,
              resources: ungrouped,
            },
          ]
        : []),
    ];
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function csv(value: string): readonly string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export { SubjectsEditor } from './subjects-editor.js';
