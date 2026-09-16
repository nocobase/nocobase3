import type { ReactElement } from 'react';
import type { AuthorizationOptions } from '../../authorization-client.js';
import { Field } from '../../components/editors.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import {
  customFilterConditions,
  filterFromConditions,
  nextDraftId,
  recordAccessKey,
} from './drafts.js';
import { filterOperatorLabel, filterOperators, humanize } from './labels.js';
import type { FilterConditionDraft, RecordAccessDraft } from './types.js';

export function RecordAccessEditor({
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
