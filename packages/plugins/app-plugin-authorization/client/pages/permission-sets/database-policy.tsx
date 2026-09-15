import { useState, type ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import { Field } from '../../components/editors.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import {
  customFilterConditions,
  defaultDatabaseActionDraft,
  filterFromConditions,
  nextDraftId,
  recordAccessKey,
} from './drafts.js';
import {
  collectionFields,
  databaseActionDescription,
  databaseActionSummary,
  filterOperatorLabel,
  filterOperators,
  humanize,
} from './labels.js';
import type {
  DatabaseActionDraft,
  FilterConditionDraft,
  GrantDraft,
  RecordAccessDraft,
} from './types.js';

export function DatabasePolicyEditor({
  options,
  grant,
  onChange,
}: {
  options: AuthorizationOptions;
  grant: GrantDraft;
  onChange: (value: Readonly<Record<string, DatabaseActionDraft>>) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const fields = collectionFields(options, grant.resource.id);
  const [activeAction, setActiveAction] = useState(grant.actions[0] ?? '');
  const currentAction = grant.actions.includes(activeAction)
    ? activeAction
    : (grant.actions[0] ?? '');
  const value =
    grant.database[currentAction] ?? defaultDatabaseActionDraft(options);
  return (
    <section className='rounded-lg border'>
      <header className='flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2.5'>
        <div>
          <h4 className='text-sm font-medium'>{t('databasePolicy.title')}</h4>
          <p className='text-xs text-muted-foreground'>
            {t('databasePolicy.subtitle')}
          </p>
        </div>
        <div className='flex flex-wrap gap-1 rounded-md border bg-background p-1'>
          {grant.actions.map((action) => (
            <button
              className={`rounded px-2.5 py-1 text-xs font-medium ${currentAction === action ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              key={action}
              type='button'
              onClick={() => setActiveAction(action)}
            >
              {humanize(action)}
            </button>
          ))}
        </div>
      </header>
      {currentAction ? (
        <DatabaseActionPolicyEditor
          action={currentAction}
          fields={fields}
          options={options}
          value={value}
          onChange={(next) =>
            onChange({ ...grant.database, [currentAction]: next })
          }
        />
      ) : (
        <p className='px-4 py-5 text-sm text-muted-foreground'>
          {t('databasePolicy.selectAction')}
        </p>
      )}
    </section>
  );
}

function DatabaseActionPolicyEditor({
  action,
  fields,
  options,
  value,
  onChange,
}: {
  action: string;
  fields: readonly string[];
  options: AuthorizationOptions;
  value: DatabaseActionDraft;
  onChange: (value: DatabaseActionDraft) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const input = action === 'create' || action === 'update';
  const output =
    action === 'create' || action === 'read' || action === 'update';
  const recordAccess = action !== 'create';
  return (
    <div className='space-y-4 p-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h5 className='text-sm font-medium'>
            {t('databasePolicy.actionAccess', { action: humanize(action) })}
          </h5>
          <p className='text-xs text-muted-foreground'>
            {databaseActionDescription(t, action)}
          </p>
        </div>
        <span className='text-xs text-muted-foreground'>
          {databaseActionSummary(t, options, action, value)}
        </span>
      </div>
      {input || output ? (
        <div className='grid gap-3 sm:grid-cols-2'>
          {input ? (
            <FieldChecklist
              label={t('databasePolicy.writableFields')}
              fields={fields}
              value={value.input}
              onChange={(next) => onChange({ ...value, input: next })}
            />
          ) : null}
          {output ? (
            <FieldChecklist
              label={t('databasePolicy.visibleFields')}
              fields={fields}
              value={value.output}
              onChange={(next) => onChange({ ...value, output: next })}
            />
          ) : null}
        </div>
      ) : null}
      {recordAccess ? (
        <RecordAccessEditor
          action={action}
          fields={fields}
          options={options}
          value={value.recordAccess}
          onChange={(recordAccess) => onChange({ ...value, recordAccess })}
        />
      ) : null}
    </div>
  );
}

function RecordAccessEditor({
  action,
  fields,
  options,
  value,
  onChange,
}: {
  action: string;
  fields: readonly string[];
  options: AuthorizationOptions;
  value: RecordAccessDraft;
  onChange: (value: RecordAccessDraft) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const key = recordAccessKey(value);
  const conditions = customFilterConditions(value);
  function updateConditions(next: readonly FilterConditionDraft[]): void {
    onChange({
      key: 'customFilter',
      params: { filter: filterFromConditions(next) },
    });
  }
  return (
    <div className='space-y-3'>
      <Field label={t('databasePolicy.recordAccess')}>
        <select
          aria-label={t('databasePolicy.actionRecordAccess', {
            action: humanize(action),
          })}
          className='h-8 w-full rounded-lg border bg-background px-2.5 text-sm'
          value={key}
          onChange={(event) =>
            onChange(
              event.target.value === 'customFilter'
                ? {
                    key: 'customFilter',
                    params: { filter: { $and: [] } },
                  }
                : event.target.value,
            )
          }
        >
          {options.recordAccessPolicies.map((policy) => (
            <option key={policy.value} value={policy.value}>
              {policy.label}
            </option>
          ))}
        </select>
      </Field>
      {key === 'customFilter' ? (
        <div className='space-y-2 rounded-md border bg-muted/10 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <p className='text-xs font-medium'>
                {t('databasePolicy.filterConditions')}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t('databasePolicy.filterConditionsHint')}
              </p>
            </div>
            <Button
              size='sm'
              type='button'
              variant='outline'
              onClick={() =>
                updateConditions([
                  ...conditions,
                  {
                    id: nextDraftId(),
                    field: fields[0] ?? '',
                    operator: '$eq',
                    value: '',
                  },
                ])
              }
            >
              {t('databasePolicy.addCondition')}
            </Button>
          </div>
          {conditions.map((condition, index) => (
            <div
              className='grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]'
              key={condition.id}
            >
              <select
                aria-label={t('databasePolicy.filterField')}
                className='h-8 rounded-lg border bg-background px-2 text-sm'
                value={condition.field}
                onChange={(event) =>
                  updateConditions(
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
                aria-label={t('databasePolicy.filterOperator')}
                className='h-8 rounded-lg border bg-background px-2 text-sm'
                value={condition.operator}
                onChange={(event) =>
                  updateConditions(
                    conditions.map((item, current) =>
                      current === index
                        ? {
                            ...item,
                            operator: event.target
                              .value as FilterConditionDraft['operator'],
                          }
                        : item,
                    ),
                  )
                }
              >
                {filterOperators.map((operator) => (
                  <option key={operator} value={operator}>
                    {filterOperatorLabel(t, operator)}
                  </option>
                ))}
              </select>
              <Input
                aria-label={t('databasePolicy.filterValue')}
                value={condition.value}
                onChange={(event) =>
                  updateConditions(
                    conditions.map((item, current) =>
                      current === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                aria-label={t('databasePolicy.removeCondition')}
                size='sm'
                type='button'
                variant='ghost'
                onClick={() =>
                  updateConditions(
                    conditions.filter((_item, current) => current !== index),
                  )
                }
              >
                {t('common.remove')}
              </Button>
            </div>
          ))}
          {conditions.length === 0 ? (
            <p className='py-2 text-xs text-muted-foreground'>
              {t('databasePolicy.conditionRequired')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FieldChecklist({
  label,
  fields,
  value,
  onChange,
}: {
  label: string;
  fields: readonly string[];
  value: '*' | readonly string[];
  onChange: (value: '*' | readonly string[]) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <Field label={label}>
      <div className='rounded-md border bg-background p-2.5'>
        <label className='flex cursor-pointer items-center gap-2 border-b pb-2 text-xs font-medium'>
          <input
            type='checkbox'
            checked={value === '*'}
            onChange={(event) => onChange(event.target.checked ? '*' : [])}
          />
          {t('common.allFields')}
        </label>
        <div className='mt-2 grid max-h-32 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto'>
          {fields.map((field) => (
            <label
              className={`flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/30 ${value === '*' ? 'text-muted-foreground' : ''}`}
              key={field}
            >
              <input
                aria-label={t('databasePolicy.fieldCheckbox', {
                  label,
                  field,
                })}
                type='checkbox'
                checked={value === '*' || value.includes(field)}
                disabled={value === '*'}
                onChange={(event) =>
                  onChange(
                    value === '*'
                      ? []
                      : event.target.checked
                        ? [...value, field]
                        : value.filter((item) => item !== field),
                  )
                }
              />
              <span className='truncate'>{field}</span>
            </label>
          ))}
        </div>
      </div>
    </Field>
  );
}
