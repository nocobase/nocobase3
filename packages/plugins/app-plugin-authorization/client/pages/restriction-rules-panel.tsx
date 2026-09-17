import { useTranslation } from '@nocobase/i18n/client';
import { Button, Input } from '../components/ui.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import type {
  AuthorizationOptions,
  AuthorizationUser,
  RestrictionRule,
} from '../authorization-client.js';
import {
  ActionScopesEditor,
  Field,
  ResourceEditor,
  SubjectsEditor,
} from '../components/editors.js';
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

export function RestrictionRulesPanel(inputProps: {
  options: AuthorizationOptions;
  users: readonly AuthorizationUser[];
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { options, users } = inputProps;

  const [rules, setRules] = useState<readonly RestrictionRule[]>([]);
  const [draft, setDraft] = useState<RestrictionRule>();
  const [originalKey, setOriginalKey] = useState<string>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  const [editorTab, setEditorTab] = useState<'rule' | 'access' | 'assignments'>(
    'rule',
  );
  const [records, setRecords] = useState<
    readonly import('../authorization-client.js').AuthorizationRecordOption[]
  >([]);
  useEffect(() => {
    if (!draft?.resource.id) return;
    void authz
      .listRestrictionRecords(draft.resource.id)
      .then(setRecords, () => setRecords([]));
  }, [draft?.resource.id]);
  const load = useCallback(async (): Promise<void> => {
    try {
      setRules(await authz.listRestrictionRules());
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
          [rule.title, rule.key, rule.resource.id].some((value) =>
            value?.toLowerCase().includes(query),
          ),
        )
      : rules;
  }, [rules, search]);
  function edit(rule?: RestrictionRule): void {
    setOriginalKey(rule?.key);
    setDraft(rule ?? fresh(options));
    setEditorTab('rule');
  }
  async function save(): Promise<void> {
    if (!draft) return;
    try {
      if (
        !draft.key ||
        !draft.resource.id ||
        draft.actions.length === 0 ||
        draft.subjects.some((item) => !item.id)
      )
        throw new TypeError('Complete the rule before saving.');
      if (originalKey) await authz.updateRestrictionRule(originalKey, draft);
      else await authz.createRestrictionRule(draft);
      setDraft(undefined);
      setOriginalKey(undefined);
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function remove(): Promise<void> {
    if (!originalKey) return;
    await authz.deleteRestrictionRule(originalKey);
    setDraft(undefined);
    setOriginalKey(undefined);
    await load();
  }
  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <div className='rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900'>
        {t(
          'Restriction rules only narrow existing access. They never grant permission on their own.',
          {
            defaultValue:
              'Restriction rules only narrow existing access. They never grant permission on their own.',
          },
        )}
      </div>
      <ManagementTable>
        <ManagementToolbar
          search={search}
          onSearch={setSearch}
          actionLabel={t('New restriction rule', {
            defaultValue: 'New restriction rule',
          })}
          onAction={() => edit()}
        />
        <table className='w-full min-w-[56rem] text-left text-sm'>
          <thead className='border-b bg-muted/30 text-xs text-muted-foreground uppercase'>
            <tr>
              <th className='px-5 py-3 font-medium'>
                {t('Rule', { defaultValue: 'Rule' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Applies to', { defaultValue: 'Applies to' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Resource', { defaultValue: 'Resource' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Restricted actions', {
                  defaultValue: 'Restricted actions',
                })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Allowed scope', { defaultValue: 'Allowed scope' })}
              </th>
              <th className='w-20 px-5 py-3' />
            </tr>
          </thead>
          <tbody className='divide-y'>
            {visibleRules.map((rule) => (
              <tr className='hover:bg-muted/30' key={rule.key}>
                <td className='px-5 py-4'>
                  <button
                    type='button'
                    className='font-medium text-primary hover:underline'
                    onClick={() => edit(rule)}
                  >
                    {rule.title || humanize(t, rule.key)}
                  </button>
                  <p className='text-xs text-muted-foreground'>
                    {rule.reason || rule.key}
                  </p>
                </td>
                <td className='px-5 py-4'>{subjectLabel(t, rule, users)}</td>
                <td className='px-5 py-4'>{resourceLabel(options, rule)}</td>
                <td className='px-5 py-4'>
                  {rule.actions
                    .map((item) => humanize(t, item.action))
                    .join(', ')}
                </td>
                <td className='px-5 py-4'>{scopeLabel(t, rule)}</td>
                <td className='px-5 py-4 text-right'>
                  <Button size='sm' variant='ghost' onClick={() => edit(rule)}>
                    {t('Edit', { defaultValue: 'Edit' })}
                  </Button>
                </td>
              </tr>
            ))}
            {visibleRules.length === 0 ? (
              <EmptyTableRow colSpan={6}>
                {t('No restriction rules match your search.', {
                  defaultValue: 'No restriction rules match your search.',
                })}
              </EmptyTableRow>
            ) : null}
          </tbody>
        </table>
      </ManagementTable>
      {draft ? (
        <SidePanel
          title={
            originalKey
              ? t('Edit restriction rule', {
                  defaultValue: 'Edit restriction rule',
                })
              : t('New restriction rule', {
                  defaultValue: 'New restriction rule',
                })
          }
          description={t('Limit the effective record scope for an audience.', {
            defaultValue: 'Limit the effective record scope for an audience.',
          })}
          onClose={() => setDraft(undefined)}
          wide
          scrollable={false}
        >
          <RuleEditorLayout
            steps={restrictionSteps}
            value={editorTab}
            onChange={(value) =>
              setEditorTab(value as 'rule' | 'access' | 'assignments')
            }
            footer={
              <>
                {originalKey ? (
                  <Button variant='outline' onClick={() => void remove()}>
                    {t('Delete rule', { defaultValue: 'Delete rule' })}
                  </Button>
                ) : null}
                <Button variant='outline' onClick={() => setDraft(undefined)}>
                  {t('Cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button onClick={() => void save()}>
                  {t('Save restriction rule', {
                    defaultValue: 'Save restriction rule',
                  })}
                </Button>
              </>
            }
          >
            {editorTab === 'rule' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Rule details', { defaultValue: 'Rule details' })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('Name the rule and choose the collection to restrict.', {
                      defaultValue:
                        'Name the rule and choose the collection to restrict.',
                    })}
                  </p>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <Field label={t('Rule name', { defaultValue: 'Rule name' })}>
                    <Input
                      value={draft.title ?? ''}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label={t('Key', { defaultValue: 'Key' })}
                    hint={t('Stable identifier used by APIs.', {
                      defaultValue: 'Stable identifier used by APIs.',
                    })}
                  >
                    <Input
                      required
                      disabled={Boolean(originalKey)}
                      value={draft.key}
                      onChange={(event) =>
                        setDraft({ ...draft, key: event.target.value })
                      }
                    />
                  </Field>
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
            ) : null}
            {editorTab === 'assignments' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Assignments', { defaultValue: 'Assignments' })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('Choose who is subject to this restriction.', {
                      defaultValue:
                        'Choose who is subject to this restriction.',
                    })}
                  </p>
                </div>
                <SubjectsEditor
                  users={users}
                  value={draft.subjects}
                  onChange={(subjects) => setDraft({ ...draft, subjects })}
                />
                <Field label={t('Reason', { defaultValue: 'Reason' })}>
                  <Input
                    value={draft.reason ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, reason: event.target.value })
                    }
                  />
                </Field>
              </section>
            ) : null}
            {editorTab === 'access' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Allowed scope', { defaultValue: 'Allowed scope' })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t(
                      'Set the maximum record scope independently for each action.',
                      {
                        defaultValue:
                          'Set the maximum record scope independently for each action.',
                      },
                    )}
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
            ) : null}
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

function fresh(options: AuthorizationOptions): RestrictionRule {
  const type =
    options.resourceTypes.find(
      (item) => item.value === 'database.collection',
    ) ?? options.resourceTypes[0];
  return {
    key: '',
    title: '',
    resource: {
      type: type?.value ?? 'database.collection',
      id: type?.resources[0]?.value ?? '',
    },
    actions: firstActions(
      options,
      type?.value ?? '',
      type?.resources[0]?.value,
    ).map((action) => ({ action, scope: defaultScope(options) })),
    subjects: [{ type: 'authenticated', id: '*' }],
    reason: '',
  };
}
const restrictionSteps = [
  {
    value: 'rule',
    label: 'Rule details',
    description: 'Name and resource.',
  },
  {
    value: 'access',
    label: 'Restrictions',
    description: 'Actions and allowed scope.',
  },
  {
    value: 'assignments',
    label: 'Assignments',
    description: 'Audience and users.',
  },
] as const;
function resourceLabel(
  options: AuthorizationOptions,
  rule: RestrictionRule,
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === rule.resource.type)
      ?.resources.find((item) => item.value === rule.resource.id)?.label ??
    rule.resource.id
  );
}
function subjectLabel(
  t: ReturnType<typeof useTranslation>['t'],
  rule: RestrictionRule,
  users: readonly AuthorizationUser[],
): string {
  const subject = rule.subjects[0];
  if (!subject || subject.type === 'authenticated')
    return t('All signed-in users', { defaultValue: 'All signed-in users' });
  return (
    users.find((user) => user.id === subject.id)?.name ??
    t('userFallback', { id: subject.id, defaultValue: `User ${subject.id}` })
  );
}
function scopeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  rule: RestrictionRule,
): string {
  return rule.actions
    .map(
      (item) =>
        `${humanize(t, item.action)}: ${accessScopeLabel(t, item.scope)}`,
    )
    .join(' · ');
}
function accessScopeLabel(
  t: ReturnType<typeof useTranslation>['t'],
  scope: import('../authorization-client.js').AccessScope,
): string {
  if (scope.type === 'all')
    return t('All records', { defaultValue: 'All records' });
  if (scope.type === 'ids')
    return t('counts.selectedRecords', {
      count: scope.ids.length,
      defaultValue: `${scope.ids.length} selected records`,
    });
  const key =
    typeof scope.recordAccess === 'string'
      ? scope.recordAccess
      : scope.recordAccess.key;
  return humanize(t, key);
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
