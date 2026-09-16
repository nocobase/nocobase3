import { Checkbox } from '../../components/ui/checkbox.js';
import { SelectField } from '../../components/select-field.js';
import { useState, type ReactElement } from 'react';
import type { AuthorizationOptions } from '../../authorization-client.js';
import { Input } from '../../components/ui/input.js';
import { Button } from '../../components/ui/button.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { defaultDatabaseActionDraft } from './drafts.js';
import type { GrantDraft } from './types.js';

export function FieldMatrix({
  options,
  grant,
  action,
  onChange,
}: {
  options: AuthorizationOptions;
  grant: GrantDraft;
  action: string;
  onChange: (database: GrantDraft['database']) => void;
}): ReactElement {
  const current =
    options.collections.find((item) => item.name === grant.resource.id)
      ?.fields ?? [];
  const value = grant.database[action] ?? defaultDatabaseActionDraft(options);
  return (
    <div className='space-y-6'>
      {action === 'create' || action === 'update' ? (
        <Fields
          label={action === 'create' ? 'createFields' : 'updateFields'}
          fields={current}
          value={value.input}
          onChange={(input) =>
            onChange({ ...grant.database, [action]: { ...value, input } })
          }
        />
      ) : null}
      <Fields
        label={action === 'read' ? 'readFields' : 'responseFields'}
        fields={current}
        value={value.output}
        onChange={(output) =>
          onChange({ ...grant.database, [action]: { ...value, output } })
        }
      />
    </div>
  );
}
function Fields({
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
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const all = [...new Set([...fields, ...(value === '*' ? [] : value)])];
  const filtered = all.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      className='space-y-3'
      aria-label={t(`permissionWorkspace.${label}`)}
    >
      <h3 className='text-sm font-medium'>
        {t(`permissionWorkspace.${label}`)}
      </h3>
      {label === 'responseFields' ? (
        <p className='text-xs text-muted-foreground'>
          {t('permissionWorkspace.responseHint')}
        </p>
      ) : null}
      <SelectField
        className='h-9 w-full rounded-md border bg-background px-2 text-sm'
        aria-label={`${t(`permissionWorkspace.${label}`)}: ${t('permissionWorkspace.fieldMode')}`}
        value={value === '*' ? 'all' : 'specific'}
        onValueChange={(selectedValue) =>
          onChange(selectedValue === 'all' ? '*' : [...fields])
        }
        options={[
          { value: 'all', label: t('permissionWorkspace.allFuture') },
          { value: 'specific', label: t('permissionWorkspace.specificFields') },
        ]}
      />
      {value !== '*' ? (
        <>
          <Input
            aria-label={`${t(`permissionWorkspace.${label}`)}: ${t('permissionWorkspace.searchFields')}`}
            placeholder={t('permissionWorkspace.searchFields')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(50);
            }}
          />
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => onChange([...new Set([...value, ...filtered])])}
            >
              {t('permissionWorkspace.selectMatches')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() =>
                onChange(value.filter((name) => !filtered.includes(name)))
              }
            >
              {t('permissionWorkspace.clearMatches')}
            </Button>
          </div>
          <div className='divide-y rounded-md border'>
            {filtered.slice(0, limit).map((name) => (
              <label
                key={name}
                className='flex cursor-pointer items-center gap-2 px-3 py-2 text-sm'
              >
                <Checkbox
                  aria-label={`${t(`permissionWorkspace.${label}`)}: ${name}`}
                  checked={value.includes(name)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...value, name]
                        : value.filter((item) => item !== name),
                    )
                  }
                />
                <span className='break-all'>{name}</span>
                {!fields.includes(name) ? (
                  <span className='text-xs text-destructive'>
                    {t('permissionWorkspace.unavailable')}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
          {filtered.length > limit ? (
            <Button
              type='button'
              variant='outline'
              onClick={() => setLimit(limit + 50)}
            >
              {t('permissionWorkspace.showMore')}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
