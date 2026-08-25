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

export function SharingRulesPanel({
  options,
  users,
}: {
  options: AuthorizationOptions;
  users: readonly AuthorizationUser[];
}): ReactElement {
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
          actionLabel='New sharing rule'
          onAction={() => edit()}
        />
        <table className='w-full min-w-[58rem] text-left text-sm'>
          <thead className='border-b bg-muted/30 text-xs text-muted-foreground uppercase'>
            <tr>
              <th className='px-5 py-3 font-medium'>Rule</th>
              <th className='px-5 py-3 font-medium'>Resource</th>
              <th className='px-5 py-3 font-medium'>Records shared</th>
              <th className='px-5 py-3 font-medium'>Shared with</th>
              <th className='px-5 py-3 font-medium'>Access</th>
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
                    {rule.title || humanize(rule.key)}
                  </button>
                  <p className='text-xs text-muted-foreground'>{rule.key}</p>
                </td>
                <td className='px-5 py-4'>{resourceLabel(options, rule)}</td>
                <td className='px-5 py-4'>{selectionLabel(rule)}</td>
                <td className='px-5 py-4'>{subjectLabel(rule, users)}</td>
                <td className='px-5 py-4'>
                  {rule.actions.map((item) => humanize(item.action)).join(', ')}
                </td>
                <td className='px-5 py-4 text-right'>
                  <Button size='sm' variant='ghost' onClick={() => edit(rule)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
            {visibleRules.length === 0 ? (
              <EmptyTableRow colSpan={6}>
                No sharing rules match your search.
              </EmptyTableRow>
            ) : null}
          </tbody>
        </table>
      </ManagementTable>
      {draft ? (
        <SidePanel
          title={originalKey ? 'Edit sharing rule' : 'New sharing rule'}
          description='Open access to selected records for an audience.'
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
                    Delete rule
                  </Button>
                ) : null}
                <Button variant='outline' onClick={() => setDraft(undefined)}>
                  Cancel
                </Button>
                <Button onClick={() => void save()}>Save sharing rule</Button>
              </>
            }
          >
            {editorTab === 'rule' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>Rule details</h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Name the rule and choose the collection to share.
                  </p>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <Field label='Rule name'>
                    <Input
                      value={draft.title ?? ''}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label='Key' hint='Stable identifier used by APIs.'>
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
                  <h3 className='text-base font-semibold'>Records to share</h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Choose records independently for each action.
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
                  <h3 className='text-base font-semibold'>Assignments</h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Choose who receives the additional access.
                  </p>
                </div>
                <SubjectsEditor
                  users={users}
                  value={draft.subjects}
                  onChange={(subjects) => setDraft({ ...draft, subjects })}
                />
                <Field label='Description'>
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

function SharingActionsEditor({
  options,
  resourceType,
  collection,
  value,
  onChange,
}: {
  options: AuthorizationOptions;
  resourceType: string;
  collection: string;
  value: SharingRule['actions'];
  onChange: (value: SharingRule['actions']) => void;
}): ReactElement {
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
                {humanize(item.action)}
              </button>
            ))}
          </div>
          <div className='space-y-4 p-4'>
            <Field label='Records to share'>
              <select
                className='h-9 w-full rounded-lg border bg-background px-3 text-sm'
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
                <option value='records'>Selected records</option>
                <option value='policy'>Records matching a policy</option>
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

function RecordPicker({
  records,
  search,
  onSearch,
  value,
  onChange,
}: {
  records: readonly import('../authorization-client.js').AuthorizationRecordOption[];
  search: string;
  onSearch: (value: string) => void;
  value: readonly string[];
  onChange: (value: readonly string[]) => void;
}): ReactElement {
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
      <Field label='Records'>
        <Input
          type='search'
          placeholder='Search records'
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
            No records found.
          </p>
        ) : null}
      </div>
      <p className='text-xs text-muted-foreground'>
        {value.length} record{value.length === 1 ? '' : 's'} selected
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
function selectionLabel(rule: SharingRule): string {
  return rule.actions
    .map(
      (item) =>
        `${humanize(item.action)}: ${item.selection.type === 'records' ? `${item.selection.ids.length} selected records` : 'Records matching policy'}`,
    )
    .join(' · ');
}
function subjectLabel(
  rule: SharingRule,
  users: readonly AuthorizationUser[],
): string {
  const subject = rule.subjects[0];
  if (!subject || subject.type === 'authenticated')
    return 'All signed-in users';
  return (
    users.find((user) => user.id === subject.id)?.name ?? `User ${subject.id}`
  );
}
function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
