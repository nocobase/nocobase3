import { SelectField } from '../../components/select-field.js';
import type { ReactElement } from 'react';
import type { AuthorizationOptions } from '../../authorization-client.js';
import { Field } from '../../components/editors.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { recordAccessKey } from './drafts.js';
import { actionLabel } from './labels.js';
import type { RecordAccessDraft } from './types.js';
import { CustomFilterEditor } from '../../components/filter-editor.js';
import { emptyFilter } from '../../components/filter-ast.js';

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
  return (
    <div className='space-y-3'>
      <Field label={t('databasePolicy.recordAccess')}>
        <SelectField
          aria-label={t('databasePolicy.actionRecordAccess', {
            action: actionLabel(options, 'database.collection', action),
          })}
          className='h-8 w-full rounded-lg border bg-background px-2.5 text-sm'
          value={key}
          onValueChange={(selectedValue) =>
            onChange(
              selectedValue === 'customFilter'
                ? {
                    key: 'customFilter',
                    params: { filter: emptyFilter() },
                  }
                : selectedValue,
            )
          }
          options={options.recordAccessPolicies.map((policy) => ({
            value: policy.value,
            label: policy.label,
          }))}
        />
      </Field>
      {key === 'customFilter' ? (
        <CustomFilterEditor fields={fields} value={value} onChange={onChange} />
      ) : null}
    </div>
  );
}
