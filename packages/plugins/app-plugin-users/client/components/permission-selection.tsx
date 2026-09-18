import { useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { LockKeyhole } from 'lucide-react';
import type { UserRoleScopeOption } from '../user-client.js';
import { Button } from './ui/button.js';
import { Checkbox } from './ui/checkbox.js';
import { Input } from './ui/input.js';

export function PermissionSelection({
  scope,
  selected,
  initial = selected,
  disabled = false,
  onChange,
}: {
  scope: UserRoleScopeOption;
  selected: readonly string[];
  initial?: readonly string[];
  disabled?: boolean;
  onChange: (value: readonly string[]) => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-users');
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [limit, setLimit] = useState(30);
  const options: UserRoleScopeOption['options'] = [
    ...scope.options,
    ...initial
      .filter((id) => !scope.options.some((option) => option.value === id))
      .map((id) => ({
        value: id,
        label: id,
        assignable: false,
        removable: false,
      })),
  ];
  const filtered = options.filter(
    (option) =>
      (!selectedOnly || selected.includes(option.value)) &&
      `${option.label} ${option.value} ${option.description ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const lockedSingle =
    scope.selection === 'single' &&
    options.some(
      (option) => selected.includes(option.value) && option.removable === false,
    );
  return (
    <>
      <div className='shrink-0 space-y-3 border-b px-6 py-4'>
        <h2 className='text-sm font-medium'>{scope.label}</h2>
        <Input
          autoFocus
          aria-label={t('assignment.search')}
          placeholder={t('assignment.search')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(30);
          }}
        />
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>{t('assignment.selected', { count: selected.length })}</span>
          <label className='flex items-center gap-2'>
            <Checkbox
              checked={selectedOnly}
              onCheckedChange={(checked) => {
                setSelectedOnly(checked);
                setLimit(30);
              }}
            />
            {t('assignment.selectedOnly')}
          </label>
        </div>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto px-6' aria-busy={disabled}>
        {filtered.slice(0, limit).map((option) => {
          const checked = selected.includes(option.value);
          const protectedOption =
            lockedSingle ||
            (checked
              ? option.removable === false
              : option.assignable === false);
          return (
            <label
              key={option.value}
              className='flex items-start gap-3 border-b py-4'
            >
              <Checkbox
                className='mt-0.5'
                checked={checked}
                disabled={disabled || protectedOption}
                onCheckedChange={(next) => {
                  onChange(
                    scope.selection === 'single'
                      ? next
                        ? [option.value]
                        : []
                      : next
                        ? [...selected, option.value]
                        : selected.filter((id) => id !== option.value),
                  );
                }}
              />
              <span className='min-w-0 flex-1'>
                <span className='block break-words text-sm font-medium'>
                  {option.label}
                </span>
                {option.description && (
                  <span className='mt-1 block text-xs text-muted-foreground'>
                    {option.description}
                  </span>
                )}
                {protectedOption && (
                  <span className='mt-1 block text-xs text-muted-foreground'>
                    {t('assignment.protected')}
                  </span>
                )}
              </span>
              {protectedOption && (
                <LockKeyhole
                  className='size-4 shrink-0 text-muted-foreground'
                  aria-hidden='true'
                />
              )}
            </label>
          );
        })}
        {!filtered.length && (
          <p className='py-12 text-center text-sm text-muted-foreground'>
            {t('assignment.empty')}
          </p>
        )}
        {filtered.length > limit && (
          <Button
            variant='ghost'
            className='my-3 w-full'
            onClick={() => setLimit((value) => value + 30)}
          >
            {t('assignment.showMore')}
          </Button>
        )}
      </div>
    </>
  );
}
