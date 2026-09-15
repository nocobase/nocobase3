import { useMemo, useState, type ReactElement } from 'react';

import type {
  AuthorizationDecision,
  AuthorizationOptions,
  AuthorizationReason,
} from '../authorization-client.js';
import { Field } from '../components/editors.js';
import { errorMessage } from '../components/feedback.js';
import { SearchField } from '../components/filters.js';
import { PermissionsPage } from '../components/page-shell.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { useAuthorizationTranslation, type Translate } from '../i18n.js';
import { getAuthorizationClient } from '../runtime.js';
import type { UserDirectory } from '../components/user-directory.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
  useUserDirectory,
} from './page-support.js';

const authz = getAuthorizationClient();

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-background px-3 text-sm';

/**
 * What one person may do on one resource, and why.
 *
 * Built on the core's explanation alone, so it knows nothing about which
 * plugins an application installed: a reason names the plugin it came from and
 * is rendered as it arrives, and conditions are shown rather than interpreted.
 */
export default function InspectorPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('authz/permission-sets/options');
  const directory = useUserDirectory();
  return (
    <PermissionsPage
      title={t('inspector.page.title')}
      description={t('inspector.page.description')}
    >
      {page.options ? (
        <Inspector directory={directory} options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}

function Inspector({
  directory,
  options,
}: {
  directory: UserDirectory;
  options: AuthorizationOptions;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [search, setSearch] = useState('');
  const [user, setUser] = useState('');
  const [type, setType] = useState(options.resourceTypes[0]?.value ?? '');
  const [id, setId] = useState(
    options.resourceTypes[0]?.resources[0]?.value ?? '',
  );
  const [action, setAction] = useState('');
  const [decision, setDecision] = useState<AuthorizationDecision>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);

  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const actions = useMemo(
    () =>
      resourceType?.resources.find((item) => item.value === id)?.actions ??
      resourceType?.actions ??
      [],
    [resourceType, id],
  );
  const query = search.trim().toLowerCase();
  const people = directory.users.filter(
    (person) =>
      !query ||
      [person.name, person.username ?? '', person.email].some((value) =>
        value.toLowerCase().includes(query),
      ),
  );
  const complete = user !== '' && type !== '' && id !== '' && action !== '';

  function inspect(): void {
    setRunning(true);
    setError(undefined);
    void authz
      .inspect({
        subject: { type: 'user', id: user },
        resource: { type, id },
        action,
      })
      .then(
        (result) => {
          setDecision(result);
        },
        (cause: unknown) => {
          setDecision(undefined);
          setError(errorMessage(t, cause));
        },
      )
      .finally(() => setRunning(false));
  }

  // Changing the question clears the answer, so no decision is ever read as
  // the answer to something it was not asked.
  function change(apply: () => void): void {
    apply();
    setDecision(undefined);
    setError(undefined);
  }

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Field label={t('inspector.person')} hint={directory.unavailable}>
          <div className='space-y-2'>
            <SearchField
              className='sm:max-w-none'
              label={t('inspector.searchPeople')}
              placeholder={t('inspector.searchPeoplePlaceholder')}
              value={search}
              onChange={(value) => change(() => setSearch(value))}
            />
            <select
              aria-label={t('inspector.person')}
              className={selectClass}
              value={user}
              onChange={(event) => change(() => setUser(event.target.value))}
            >
              <option value=''>{t('inspector.selectPerson')}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.username ?? person.email}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label={t('editors.resourceType')}>
          <select
            aria-label={t('editors.resourceType')}
            className={selectClass}
            value={type}
            onChange={(event) =>
              change(() => {
                const next = options.resourceTypes.find(
                  (item) => item.value === event.target.value,
                );
                setType(event.target.value);
                setId(next?.resources[0]?.value ?? '');
                setAction('');
              })
            }
          >
            {options.resourceTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('editors.resource')}>
          <select
            aria-label={t('editors.resource')}
            className={selectClass}
            value={id}
            onChange={(event) =>
              change(() => {
                setId(event.target.value);
                setAction('');
              })
            }
          >
            <option value=''>{t('editors.resource')}</option>
            {(resourceType?.resources ?? []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('inspector.action')}>
          <select
            aria-label={t('inspector.action')}
            className={selectClass}
            value={action}
            onChange={(event) => change(() => setAction(event.target.value))}
          >
            <option value=''>{t('inspector.selectAction')}</option>
            {actions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Button disabled={!complete || running} onClick={inspect}>
        {running ? t('inspector.inspecting') : t('inspector.inspect')}
      </Button>
      {error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
      {decision ? (
        <Decision value={decision} />
      ) : error ? null : (
        <p className='text-sm text-muted-foreground'>{t('inspector.empty')}</p>
      )}
    </div>
  );
}

const effectStyles: Readonly<Record<string, string>> = {
  permit: 'bg-primary/10 text-primary',
  conditional: 'bg-muted text-foreground',
  deny: 'bg-destructive/10 text-destructive',
};

function Decision({ value }: { value: AuthorizationDecision }): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <div className='space-y-5'>
      <section className='space-y-2'>
        <h3 className='text-xs font-medium text-muted-foreground uppercase'>
          {t('inspector.decision')}
        </h3>
        <Badge className={effectStyles[value.effect] ?? 'bg-muted'}>
          {effectLabel(t, value.effect)}
        </Badge>
      </section>
      <section className='space-y-2'>
        <h3 className='text-xs font-medium text-muted-foreground uppercase'>
          {t('inspector.reasons')}
        </h3>
        {value.reasons.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('inspector.noReasons')}
          </p>
        ) : (
          <ul className='space-y-2'>
            {value.reasons.map((reason, index) => (
              <li
                className='rounded-lg border px-4 py-3'
                // The core returns an ordered list carrying no identity of its
                // own, and the list is replaced whole rather than reordered.
                // eslint-disable-next-line @eslint-react/no-array-index-key
                key={`${reason.code}-${index}`}
              >
                <Reason value={reason} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {value.conditions ? (
        <section className='space-y-2'>
          <h3 className='text-xs font-medium text-muted-foreground uppercase'>
            {t('inspector.conditions')}
          </h3>
          <p className='text-sm text-muted-foreground'>
            {t('inspector.conditionsHint')}
          </p>
          <pre className='overflow-x-auto rounded-lg border bg-muted/20 px-4 py-3 font-mono text-xs'>
            {JSON.stringify(value.conditions, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

/** One reason as it arrived: its message, where it came from, and its code. */
function Reason({ value }: { value: AuthorizationReason }): ReactElement {
  const t = useAuthorizationTranslation();
  return (
    <>
      <p className='text-sm'>{value.message}</p>
      <p className='mt-1 text-xs text-muted-foreground'>
        {value.plugin === undefined
          ? t('inspector.reasonFromCore')
          : t('inspector.reasonFrom', { plugin: value.plugin })}
        {' · '}
        <span className='font-mono'>{value.code}</span>
      </p>
    </>
  );
}

function effectLabel(t: Translate, effect: string): string {
  return t(`inspector.effects.${effect}`, { defaultValue: effect });
}
