import { Checkbox } from './ui/checkbox.js';
import { useSubjectNames, subjectKey as key } from './use-subject-names.js';
import { useEffect, useState, type ReactElement } from 'react';
import type {
  AuthorizationSubject,
  SubjectOption,
  SubjectSettings,
  SubjectTypeOption,
} from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { Button } from './ui/button.js';
import { SearchField } from './filters.js';
import { errorMessage } from './feedback.js';

const authz = getAuthorizationClient();

export function SubjectsEditor({
  types,
  settings,
  value,
  excluded = [],
  onChange,
}: {
  types: readonly SubjectTypeOption[];
  settings: SubjectSettings;
  value: readonly AuthorizationSubject[];
  excluded?: readonly AuthorizationSubject[];
  onChange: (value: readonly AuthorizationSubject[]) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const collections = types.filter(
    (type) => type.selection?.type === 'collection',
  );
  const [active, setActive] = useState('');
  const type =
    collections.find((item) => item.value === active)?.value ??
    collections[0]?.value;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    identity: string;
    items: readonly SubjectOption[];
    total: number;
  }>();
  const [error, setError] = useState<{ identity: string; cause: unknown }>();
  const identity = JSON.stringify([settings, type, search, page]);
  const [names, setNames] = useState<Record<string, SubjectOption>>({});
  const resolvedNames = useSubjectNames(settings, types, value);
  useEffect(() => {
    if (!type) return;
    let active = true;
    const timer = setTimeout(() => {
      void authz
        .listSubjects(settings, type, { search, page, pageSize: 30 })
        .then(
          (data) => {
            if (!active) return;
            setResult({ ...data, identity });
            setError(undefined);
            setNames((old) => ({
              ...old,
              ...Object.fromEntries(
                data.items.map((item) => [key({ type, id: item.id }), item]),
              ),
            }));
          },
          (cause: unknown) => {
            if (active) setError({ identity, cause });
          },
        );
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [settings, type, search, page, identity]);
  const selected = new Set(value.map(key));
  const assigned = new Set(excluded.map(key));
  function toggle(subject: AuthorizationSubject, checked: boolean): void {
    onChange(
      checked
        ? [...value, subject]
        : value.filter((item) => key(item) !== key(subject)),
    );
  }
  const current = result?.identity === identity ? result : undefined;
  const currentError =
    error?.identity === identity ? errorMessage(t, error.cause) : undefined;
  const groups = [...new Set(value.map((item) => item.type))];
  return (
    <div className='space-y-3'>
      <p className='text-xs text-muted-foreground'>{t('subjects.matchAny')}</p>
      {types
        .filter((item) => item.selection?.type === 'fixed')
        .map((item) => {
          if (item.selection?.type !== 'fixed') return null;
          const subject = { type: item.value, id: item.selection.id };
          return (
            <label key={item.value} className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={
                  selected.has(key(subject)) || assigned.has(key(subject))
                }
                disabled={assigned.has(key(subject))}
                onCheckedChange={(checked) => toggle(subject, checked)}
              />
              {item.label}
            </label>
          );
        })}
      {collections.length ? (
        <div className='overflow-hidden rounded-lg border'>
          <div className='flex flex-wrap gap-1 border-b p-2'>
            {collections.map((item) => (
              <Button
                key={item.value}
                variant={item.value === type ? 'outline' : 'ghost'}
                size='sm'
                aria-pressed={item.value === type}
                onClick={() => {
                  setActive(item.value);
                  setSearch('');
                  setPage(1);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className='p-3'>
            <SearchField
              label={t('subjects.search')}
              placeholder={t('subjects.search')}
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          </div>
          <div className='max-h-56 overflow-y-auto divide-y border-t'>
            {currentError ? (
              <p role='alert' className='p-3 text-sm text-destructive'>
                {currentError}
              </p>
            ) : !current ? (
              <p className='p-3 text-sm'>{t('common.loading')}</p>
            ) : (
              current.items.map((item) => {
                const subject = { type: type, id: item.id };
                return (
                  <label
                    key={item.id}
                    className='flex min-w-0 items-center gap-3 px-3 py-2 hover:bg-muted/20'
                  >
                    <Checkbox
                      aria-label={item.title}
                      checked={
                        selected.has(key(subject)) || assigned.has(key(subject))
                      }
                      disabled={assigned.has(key(subject))}
                      onCheckedChange={(checked) => toggle(subject, checked)}
                    />
                    <span className='min-w-0'>
                      <span className='block truncate text-sm'>
                        {item.title}
                      </span>
                      <span className='block truncate text-xs text-muted-foreground'>
                        {item.description}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
            {current?.items.length === 0 ? (
              <p className='p-3 text-sm text-muted-foreground'>
                {t('subjects.empty')}
              </p>
            ) : null}
          </div>
          <div className='flex items-center justify-end gap-3 border-t p-2'>
            <Button
              variant='ghost'
              size='sm'
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              {t('subjects.previous')}
            </Button>
            <span className='text-xs'>{page}</span>
            <Button
              variant='ghost'
              size='sm'
              disabled={!current || page * 30 >= current.total}
              onClick={() => setPage(page + 1)}
            >
              {t('subjects.next')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className='overflow-hidden rounded-lg border'>
        <p className='border-b px-3 py-2 text-sm font-medium'>
          {t('subjects.selected', { count: value.length })}
        </p>
        <div className='max-h-48 overflow-y-auto p-3 space-y-3'>
          {groups.map((group) => (
            <div key={group}>
              <h4 className='mb-1 text-xs text-muted-foreground'>
                {types.find((item) => item.value === group)?.label ?? group}
              </h4>
              {value
                .filter((item) => item.type === group)
                .map((item) => (
                  <div
                    key={key(item)}
                    className='flex min-w-0 items-center justify-between gap-3'
                  >
                    <span className='truncate text-sm'>
                      {resolvedNames[key(item)] ??
                        names[key(item)]?.title ??
                        (types.find((type) => type.value === group)?.selection
                          ?.type === 'fixed'
                          ? types.find((type) => type.value === group)?.label
                          : t('subjects.unresolved', { id: item.id }))}
                    </span>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => toggle(item, false)}
                    >
                      {t('common.remove')}
                    </Button>
                  </div>
                ))}
            </div>
          ))}
          {!value.length ? (
            <p className='text-xs text-muted-foreground'>
              {t('subjects.none')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
