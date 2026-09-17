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
  AccessScope,
  AuthorizationOptions,
  AuthorizationUser,
  SharingRule,
} from '../authorization-client.js';
import {
  ActionsEditor,
  Field,
  ResourceEditor,
  ScopeEditor,
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

export function SharingRulesPanel(inputProps: {
  options: AuthorizationOptions;
  users: readonly AuthorizationUser[];
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { options, users } = inputProps;

  const [rules, setRules] = useState<readonly SharingRule[]>([]);
  const [draft, setDraft] = useState<SharingRule>();
  const [originalKey, setOriginalKey] = useState<string>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  const [editorTab, setEditorTab] = useState<'rule' | 'access' | 'assignments'>(
    'rule',
  );
  const load = useCallback(async (): Promise<void> => {
    try {
      setRules(await authz.listSharingRules());
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
  function edit(rule?: SharingRule): void {
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
        draft.actions.some(
          (item) =>
            item.selection.type === 'records' &&
            item.selection.ids.length === 0,
        ) ||
        draft.subjects.some((item) => !item.id)
      )
        throw new TypeError('Complete the rule before saving.');
      if (originalKey) await authz.updateSharingRule(originalKey, draft);
      else await authz.createSharingRule(draft);
      setDraft(undefined);
      setOriginalKey(undefined);
      await load();
    } catch (cause) {
      setError(message(cause));
    }
  }
  async function remove(): Promise<void> {
    if (!originalKey) return;
    await authz.deleteSharingRule(originalKey);
    setDraft(undefined);
    setOriginalKey(undefined);
    await load();
  }
  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <ManagementTable>
        <ManagementToolbar
          search={search}
          onSearch={setSearch}
          actionLabel={t('New sharing rule', {
            defaultValue: 'New sharing rule',
          })}
          onAction={() => edit()}
        />
        <table className='w-full min-w-[58rem] text-left text-sm'>
          <thead className='border-b bg-muted/30 text-xs text-muted-foreground uppercase'>
            <tr>
              <th className='px-5 py-3 font-medium'>
                {t('Rule', { defaultValue: 'Rule' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Resource', { defaultValue: 'Resource' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Records shared', { defaultValue: 'Records shared' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Shared with', { defaultValue: 'Shared with' })}
              </th>
              <th className='px-5 py-3 font-medium'>
                {t('Access', { defaultValue: 'Access' })}
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
                  <p className='text-xs text-muted-foreground'>{rule.key}</p>
                </td>
                <td className='px-5 py-4'>{resourceLabel(options, rule)}</td>
                <td className='px-5 py-4'>{selectionLabel(t, rule)}</td>
                <td className='px-5 py-4'>{subjectLabel(t, rule, users)}</td>
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
              <EmptyTableRow colSpan={6}>
                {t('No sharing rules match your search.', {
                  defaultValue: 'No sharing rules match your search.',
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
              ? t('Edit sharing rule', { defaultValue: 'Edit sharing rule' })
              : t('New sharing rule', { defaultValue: 'New sharing rule' })
          }
          description={t('Open access to selected records for an audience.', {
            defaultValue: 'Open access to selected records for an audience.',
          })}
          onClose={() => setDraft(undefined)}
          wide
          scrollable={false}
        >
          <RuleEditorLayout
            steps={sharingSteps}
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
                  {t('Save sharing rule', {
                    defaultValue: 'Save sharing rule',
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
                    {t('Name the rule and choose the collection to share.', {
                      defaultValue:
                        'Name the rule and choose the collection to share.',
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
                          selection: { type: 'records' as const, ids: [] },
                        })),
                      })
                    }
                  />
                </div>
              </section>
            ) : null}
            {editorTab === 'access' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Records to share', {
                      defaultValue: 'Records to share',
                    })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('Choose records independently for each action.', {
                      defaultValue:
                        'Choose records independently for each action.',
                    })}
                  </p>
                </div>
                <SharingActionsEditor
                  options={options}
                  resourceType={draft.resource.type}
                  collection={draft.resource.id}
                  value={draft.actions}
                  onChange={(actions) => setDraft({ ...draft, actions })}
                />
              </section>
            ) : null}
            {editorTab === 'assignments' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('Assignments', { defaultValue: 'Assignments' })}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('Choose who receives the additional access.', {
                      defaultValue:
                        'Choose who receives the additional access.',
                    })}
                  </p>
                </div>
                <SubjectsEditor
                  users={users}
                  value={draft.subjects}
                  onChange={(subjects) => setDraft({ ...draft, subjects })}
                />
                <Field
                  label={t('Description', { defaultValue: 'Description' })}
                >
                  <Input
                    value={draft.reason ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, reason: event.target.value })
                    }
                  />
                </Field>
              </section>
            ) : null}
          </RuleEditorLayout>
        </SidePanel>
      ) : null}
    </>
  );
}

function fresh(options: AuthorizationOptions): SharingRule {
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
    ).map((action) => ({
      action,
      selection: { type: 'records' as const, ids: [] },
    })),
    subjects: [{ type: 'authenticated', id: '*' }],
    reason: '',
  };
}

const sharingSteps = [
  {
    value: 'rule',
    label: 'Rule details',
    description: 'Name and resource.',
  },
  {
    value: 'access',
    label: 'Shared access',
    description: 'Actions and records.',
  },
  {
    value: 'assignments',
    label: 'Assignments',
    description: 'Audience and users.',
  },
] as const;

function SharingActionsEditor(inputProps: {
  options: AuthorizationOptions;
  resourceType: string;
  collection: string;
  value: SharingRule['actions'];
  onChange: (value: SharingRule['actions']) => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { options, resourceType, collection, value, onChange } = inputProps;

  const [active, setActive] = useState(value[0]?.action ?? '');
  const [records, setRecords] = useState<
    readonly import('../authorization-client.js').AuthorizationRecordOption[]
  >([]);
  const [recordSearch, setRecordSearch] = useState('');
  useEffect(() => {
    void authz
      .listSharingRecords(collection)
      .then(setRecords, () => setRecords([]));
  }, [collection]);
  const current = value.find((item) => item.action === active) ?? value[0];
  return (
    <div className='space-y-3'>
      <ActionsEditor
        options={options}
        resourceType={resourceType}
        resourceId={collection}
        value={value.map((item) => item.action)}
        onChange={(actions) => {
          onChange(
            actions.map(
              (action) =>
                value.find((item) => item.action === action) ?? {
                  action,
                  selection: { type: 'records', ids: [] },
                },
            ),
          );
          if (!actions.includes(active)) setActive(actions[0] ?? '');
        }}
      />
      {current ? (
        <section className='overflow-hidden rounded-lg border'>
          <div className='flex flex-wrap gap-1 border-b bg-muted/20 p-2'>
            {value.map((item) => (
              <button
                className={`rounded px-3 py-1.5 text-xs font-medium ${current.action === item.action ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                key={item.action}
                type='button'
                onClick={() => setActive(item.action)}
              >
                {humanize(t, item.action)}
              </button>
            ))}
          </div>
          <div className='space-y-4 p-4'>
            <Field
              label={t('Records to share', {
                defaultValue: 'Records to share',
              })}
            >
              <select
                className='h-8 w-full rounded-lg border bg-background px-3 text-sm'
                value={current.selection.type}
                onChange={(event) =>
                  changeSharingAction(
                    value,
                    current.action,
                    onChange,
                    event.target.value === 'records'
                      ? { type: 'records', ids: [] }
                      : { type: 'policy', policy: defaultPolicy(options) },
                  )
                }
              >
                <option value='records'>
                  {t('Selected records', { defaultValue: 'Selected records' })}
                </option>
                <option value='policy'>
                  {t('Records matching a policy', {
                    defaultValue: 'Records matching a policy',
                  })}
                </option>
              </select>
            </Field>
            {current.selection.type === 'records' ? (
              <RecordPicker
                records={records}
                search={recordSearch}
                onSearch={setRecordSearch}
                value={current.selection.ids}
                onChange={(ids) =>
                  changeSharingAction(value, current.action, onChange, {
                    type: 'records',
                    ids,
                  })
                }
              />
            ) : (
              <PolicyEditor
                options={options}
                fields={collectionFields(options, collection)}
                value={current.selection.policy}
                onChange={(policy) =>
                  changeSharingAction(value, current.action, onChange, {
                    type: 'policy',
                    policy,
                  })
                }
              />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RecordPicker(inputProps: {
  records: readonly import('../authorization-client.js').AuthorizationRecordOption[];
  search: string;
  onSearch: (value: string) => void;
  value: readonly string[];
  onChange: (value: readonly string[]) => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-authorization');
  const { records, search, onSearch, value, onChange } = inputProps;

  const query = search.trim().toLowerCase();
  const visible = records.filter(
    (record) =>
      !query ||
      [record.label, record.description, record.id].some((item) =>
        item?.toLowerCase().includes(query),
      ),
  );
  return (
    <div className='space-y-2'>
      <Field label={t('Records', { defaultValue: 'Records' })}>
        <Input
          type='search'
          placeholder={t('Search records', { defaultValue: 'Search records' })}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </Field>
      <div className='max-h-64 divide-y overflow-y-auto rounded-md border'>
        {visible.map((record) => (
          <label
            className='flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/20'
            key={record.id}
          >
            <input
              className='mt-1'
              type='checkbox'
              checked={value.includes(record.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, record.id]
                    : value.filter((id) => id !== record.id),
                )
              }
            />
            <span>
              <span className='block text-sm font-medium'>{record.label}</span>
              {record.description ? (
                <span className='block text-xs text-muted-foreground'>
                  {record.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
        {visible.length === 0 ? (
          <p className='p-6 text-center text-sm text-muted-foreground'>
            {t('No records found.', { defaultValue: 'No records found.' })}
          </p>
        ) : null}
      </div>
      <p className='text-xs text-muted-foreground'>
        {t('counts.selectedRecords', {
          count: value.length,
          defaultValue: `${value.length} records selected`,
        })}
      </p>
    </div>
  );
}

function changeSharingAction(
  actions: SharingRule['actions'],
  action: string,
  onChange: (value: SharingRule['actions']) => void,
  selection: SharingRule['actions'][number]['selection'],
): void {
  onChange(
    actions.map((item) =>
      item.action === action ? { ...item, selection } : item,
    ),
  );
}

function PolicyEditor({
  options,
  fields,
  value,
  onChange,
}: {
  options: AuthorizationOptions;
  fields: readonly string[];
  value: AccessScope;
  onChange: (value: AccessScope) => void;
}): ReactElement {
  return (
    <ScopeEditor
      options={options}
      fields={fields}
      allowIds={false}
      value={value}
      onChange={onChange}
    />
  );
}

function defaultPolicy(options: AuthorizationOptions): AccessScope {
  const scope = defaultScope(options);
  return scope.type === 'ids' ? { type: 'all' } : scope;
}
function collectionFields(
  options: AuthorizationOptions,
  name: string,
): readonly string[] {
  return options.collections.find((item) => item.name === name)?.fields ?? [];
}
function resourceLabel(
  options: AuthorizationOptions,
  rule: SharingRule,
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === rule.resource.type)
      ?.resources.find((item) => item.value === rule.resource.id)?.label ??
    rule.resource.id
  );
}
function selectionLabel(
  t: ReturnType<typeof useTranslation>['t'],
  rule: SharingRule,
): string {
  return rule.actions
    .map(
      (item) =>
        `${humanize(t, item.action)}: ${item.selection.type === 'records' ? t('counts.selectedRecords', { count: item.selection.ids.length, defaultValue: `${item.selection.ids.length} selected records` }) : t('Records matching policy', { defaultValue: 'Records matching policy' })}`,
    )
    .join(' · ');
}
function subjectLabel(
  t: ReturnType<typeof useTranslation>['t'],
  rule: SharingRule,
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
function humanize(
  t: ReturnType<typeof useTranslation>['t'],
  value: string,
): string {
  const label = value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return t(label, { defaultValue: label });
}
