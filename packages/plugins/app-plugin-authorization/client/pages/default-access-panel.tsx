import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '../components/ui.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import type {
  AccessScope,
  AuthorizationOptions,
  DefaultAccessRule,
} from '../authorization-client.js';
import { ActionScopesEditor, ResourceEditor } from '../components/editors.js';
import { ErrorBox, errorMessage as message } from '../components/feedback.js';
import {
  EmptyTableRow,
  ManagementTable,
  ManagementToolbar,
  RuleEditorLayout,
  SidePanel,
} from '../components/management-ui.js';
import { defaultScope, firstActions } from '../components/rule-utils.js';
import { getAuthorizationClient } from '../runtime.js';

const authz = getAuthorizationClient();

export function DefaultAccessPanel(inputProps: {
  options: AuthorizationOptions;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { options } = inputProps;

  const [rules, setRules] = useState<readonly DefaultAccessRule[]>([]);
  const [draft, setDraft] = useState<DefaultAccessRule>();
  const [original, setOriginal] = useState<DefaultAccessRule>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  const [editorStep, setEditorStep] = useState<'resource' | 'access'>(
    'resource',
  );
  const [records, setRecords] = useState<
    readonly import('../authorization-client.js').AuthorizationRecordOption[]
  >([]);
  useEffect(() => {
    if (!draft?.resource.id) return;
    void authz
      .listDefaultAccessRecords(draft.resource.id)
      .then(setRecords, () => setRecords([]));
  }, [draft?.resource.id]);
  const load = useCallback(async (): Promise<void> => {
    try {
      setRules(await authz.listDefaultAccess());
    } catch (cause) {
      setError(message(cause));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const visibleRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? rules.filter((rule) =>
          resourceLabel(options, rule).toLowerCase().includes(query),
        )
      : rules;
  }, [options, rules, search]);
  async function save(): Promise<void> {
    if (!draft) return;
    try {
      if (draft.actions.length === 0)
        throw new TypeError('Select at least one action.');
      if (
        original &&
        (original.resource.type !== draft.resource.type ||
          original.resource.id !== draft.resource.id)
      )
        await authz.deleteDefaultAccess(original.resource);
      await authz.setDefaultAccess(draft);
      setDraft(undefined);
      setOriginal(undefined);
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function remove(): Promise<void> {
    if (!original) return;
    await authz.deleteDefaultAccess(original.resource);
    setDraft(undefined);
    setOriginal(undefined);
    await load();
  }
  function edit(rule?: DefaultAccessRule): void {
    const value = rule ?? fresh(options);
    setOriginal(rule);
    setDraft(value);
    setEditorStep('resource');
  }
  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <ManagementTable>
        <ManagementToolbar
          search={search}
          onSearch={setSearch}
          actionLabel={t('Set default access', {
            defaultValue: 'Set default access',
          })}
          onAction={() => edit()}
        />
        <table className='w-full min-w-[48rem] text-left text-sm'>
          <thead className='border-b bg-muted/30 text-xs text-muted-foreground uppercase'>
            <tr>
              <th className='px-5 py-3 font-medium'>
                {t('Resource', { defaultValue: 'Resource' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Default record access', {
                  defaultValue: 'Default record access',
                })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Allowed actions', { defaultValue: 'Allowed actions' })}
              </th>
              <th className='w-24 px-5 py-3' />
            </tr>
          </thead>
          <tbody className='divide-y'>
            {visibleRules.map((rule) => (
              <tr
                className='hover:bg-muted/30'
                key={`${rule.resource.type}:${rule.resource.id}`}
              >
                <td className='px-5 py-4'>
                  <p className='font-medium'>{resourceLabel(options, rule)}</p>
                  <p className='text-xs text-muted-foreground'>
                    {resourceTypeLabel(t, options, rule.resource.type)}
                  </p>
                </td>
                <td className='px-5 py-4'>
                  <ScopeBadge actions={rule.actions} options={options} />
                </td>
                <td className='px-5 py-4'>
                  {rule.actions
                    .map((item) => humanize(t, item.action))
                    .join(', ')}
                </td>
                <td className='px-5 py-4 text-right'>
                  <Button size='sm' variant='ghost' onClick={() => edit(rule)}>
                    {t('Edit', { defaultValue: 'Edit' })}
                  </Button>
                </td>
              </tr>
            ))}
            {visibleRules.length === 0 ? (
              <EmptyTableRow colSpan={4}>
                {t('No default access rules match your search.', {
                  defaultValue: 'No default access rules match your search.',
                })}
              </EmptyTableRow>
            ) : null}
          </tbody>
        </table>
      </ManagementTable>
      {draft ? (
        <SidePanel
          title={
            original
              ? t('Edit default access', {
                  defaultValue: 'Edit default access',
                })
              : t('Set default access', { defaultValue: 'Set default access' })
          }
          description={t(
            'Define the baseline record visibility before sharing and restrictions are applied.',
            {
              defaultValue:
                'Define the baseline record visibility before sharing and restrictions are applied.',
            },
          )}
          onClose={() => setDraft(undefined)}
          wide
          scrollable={false}
        >
          <RuleEditorLayout
            steps={defaultAccessSteps}
            value={editorStep}
            onChange={(value) =>
              setEditorStep(value === 'access' ? 'access' : 'resource')
            }
            footer={
              <>
                {original ? (
                  <Button variant='outline' onClick={() => void remove()}>
                    {t('Delete rule', { defaultValue: 'Delete rule' })}
                  </Button>
                ) : null}
                <Button variant='outline' onClick={() => setDraft(undefined)}>
                  {t('Cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button onClick={() => void save()}>
                  {t('Save default access', {
                    defaultValue: 'Save default access',
                  })}
                </Button>
              </>
            }
          >
            {editorStep === 'resource' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Resource', { defaultValue: 'Resource' })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t(
                      'Choose the collection whose baseline access is being set.',
                      {
                        defaultValue:
                          'Choose the collection whose baseline access is being set.',
                      },
                    )}
                  </p>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <ResourceEditor
                    options={options}
                    type={draft.resource.type}
                    id={draft.resource.id}
                    onChange={(resource) =>
                      setDraft({
                        ...draft,
                        resource,
                        actions: firstActions(
                          options,
                          resource.type,
                          resource.id,
                        ).map((action) => ({
                          action,
                          scope: defaultScope(options),
                        })),
                      })
                    }
                  />
                </div>
              </section>
            ) : (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Access by action', {
                      defaultValue: 'Access by action',
                    })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('Set the record scope independently for each action.', {
                      defaultValue:
                        'Set the record scope independently for each action.',
                    })}
                  </p>
                </div>
                <ActionScopesEditor
                  options={options}
                  resourceType={draft.resource.type}
                  resourceId={draft.resource.id}
                  fields={collectionFields(options, draft.resource.id)}
                  records={records}
                  value={draft.actions}
                  onChange={(actions) => setDraft({ ...draft, actions })}
                />
              </section>
            )}
          </RuleEditorLayout>
        </SidePanel>
      ) : null}
    </>
  );
}
function collectionFields(
  options: AuthorizationOptions,
  name: string,
): readonly string[] {
  return options.collections.find((item) => item.name === name)?.fields ?? [];
}

function ScopeBadge(inputProps: {
  actions: readonly { action: string; scope: AccessScope }[];
  options: AuthorizationOptions;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { actions, options } = inputProps;

  const label = actions
    .map(
      (item) =>
        `${humanize(t, item.action)}: ${scopeLabel(t, item.scope, options)}`,
    )
    .join(' · ');
  return (
    <span className='rounded-full bg-muted px-2.5 py-1 text-xs font-medium'>
      {label}
    </span>
  );
}
function scopeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  scope: AccessScope,
  options: AuthorizationOptions,
): string {
  if (scope.type === 'all')
    return t('All records', { defaultValue: 'All records' });
  if (scope.type === 'ids')
    return t('counts.selectedRecords', {
      count: scope.ids.length,
      defaultValue: `${scope.ids.length} selected records`,
    });
  if (scope.type === 'database') {
    const key =
      typeof scope.recordAccess === 'string'
        ? scope.recordAccess
        : scope.recordAccess.key;
    return (
      options.recordAccessPolicies.find((item) => item.value === key)?.label ??
      humanize(t, key)
    );
  }
  return t('Unknown scope', { defaultValue: 'Unknown scope' });
}
function fresh(options: AuthorizationOptions): DefaultAccessRule {
  const type =
    options.resourceTypes.find(
      (item) => item.value === 'database.collection',
    ) ?? options.resourceTypes[0];
  return {
    resource: {
      type: type?.value ?? 'database.collection',
      id: type?.resources[0]?.value ?? '',
    },
    actions: firstActions(
      options,
      type?.value ?? '',
      type?.resources[0]?.value,
    ).map((action) => ({ action, scope: defaultScope(options) })),
  };
}

const defaultAccessSteps = [
  {
    value: 'resource',
    label: 'Resource',
    description: 'Select a collection.',
  },
  {
    value: 'access',
    label: 'Access',
    description: 'Configure action scopes.',
  },
] as const;
function resourceLabel(
  options: AuthorizationOptions,
  rule: DefaultAccessRule,
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === rule.resource.type)
      ?.resources.find((item) => item.value === rule.resource.id)?.label ??
    rule.resource.id
  );
}
function resourceTypeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  options: AuthorizationOptions,
  type: string,
): string {
  return (
    options.resourceTypes.find((item) => item.value === type)?.label ??
    humanize(t, type)
  );
}
function humanize(
  t: ReturnType<typeof useTranslation>['t'],
  value: string,
): string {
  const label = value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return t(label, { defaultValue: label });
}
