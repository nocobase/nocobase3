import type { ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import {
  customFilterConditions,
  defaultDatabaseActionDraft,
  recordAccessKey,
} from './drafts.js';
import { filterOperatorLabel, recordAccessLabel } from './labels.js';
import type { GrantActionDetailsProps } from './resource-presentation.js';
import type { DatabaseActionDraft, GrantDraft } from './types.js';

/** What one collection action was configured with: its records, then its fields. */
export function DatabaseActionDetails({
  action,
  options,
  grant,
}: GrantActionDetailsProps): ReactElement {
  const t = useAuthorizationTranslation();
  const value = grant.database[action] ?? defaultDatabaseActionDraft();
  return (
    <dl className='divide-y text-sm'>
      <DetailRow label={t('databasePolicy.recordAccess')}>
        {action === 'create' ? (
          <span className='text-muted-foreground'>
            {t('permissionSets.permissions.createSelectsNoRecords')}
          </span>
        ) : (
          <RecordAccessDetails options={options} value={value} />
        )}
      </DetailRow>
      {action === 'create' || action === 'update' ? (
        <DetailRow label={t('databasePolicy.writableFields')}>
          <FieldList value={value.input} />
        </DetailRow>
      ) : null}
      {action === 'create' || action === 'read' || action === 'update' ? (
        <DetailRow label={t('databasePolicy.visibleFields')}>
          <FieldList value={value.output} />
        </DetailRow>
      ) : null}
    </dl>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactElement | readonly ReactElement[];
}): ReactElement {
  return (
    <div className='grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'>
      <dt className='text-xs font-medium text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='min-w-0'>{children}</dd>
    </div>
  );
}

/** The policy the action holds, and the parameters it was configured with. */
function RecordAccessDetails({
  options,
  value,
}: {
  options: AuthorizationOptions;
  value: DatabaseActionDraft;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const conditions = customFilterConditions(value.recordAccess);
  const params =
    recordAccessKey(value.recordAccess) === 'customFilter'
      ? []
      : policyParams(value.recordAccess);
  return (
    <div className='space-y-2'>
      <p>{recordAccessLabel(options, value.recordAccess)}</p>
      {conditions.length === 0 ? null : (
        <ul className='space-y-1'>
          {conditions.map((condition) => (
            <li className='font-mono text-xs' key={condition.id}>
              {condition.field} {filterOperatorLabel(t, condition.operator)}{' '}
              {condition.value || "''"}
            </li>
          ))}
        </ul>
      )}
      {params.map((param) => (
        <p className='font-mono text-xs' key={param.name}>
          {param.name}: {param.text}
        </p>
      ))}
    </div>
  );
}

/** The parameters stored beside a policy key, read as they were stored. */
function policyParams(
  value: GrantDraft['database'][string]['recordAccess'],
): readonly { name: string; text: string }[] {
  if (typeof value === 'string') return [];
  const params = value.params;
  if (typeof params !== 'object' || params === null || Array.isArray(params))
    return [];
  return Object.entries(params).map(([name, item]) => ({
    name,
    text: typeof item === 'string' ? item : JSON.stringify(item),
  }));
}

/** The fields by name, because a count says nothing about which ones. */
function FieldList({
  value,
}: {
  value: '*' | readonly string[];
}): ReactElement {
  const t = useAuthorizationTranslation();
  if (value === '*') return <span>{t('common.allFields')}</span>;
  if (value.length === 0)
    return (
      <span className='text-muted-foreground'>{t('common.noFields')}</span>
    );
  return (
    <div className='flex flex-wrap gap-1.5'>
      {value.map((field) => (
        <span
          className='rounded-md border bg-muted/20 px-2 py-0.5 font-mono text-xs'
          key={field}
        >
          {field}
        </span>
      ))}
    </div>
  );
}
