import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
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
  SharingRule,
} from '../authorization-client.js';
import type { UserDirectory } from '../components/user-directory.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import { SearchField } from '../components/filters.js';
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
  TablePager,
} from '../components/management-ui.js';
import { useAuthorizationTranslation, type Translate } from '../i18n.js';
import { pageSlice } from '../components/pagination.js';
import { defaultScope, firstActions } from '../components/rule-utils.js';
import { getAuthorizationClient } from '../runtime.js';

const authz = getAuthorizationClient();

export function SharingRulesPanel({
  options,
  directory,
}: {
  options: AuthorizationOptions;
  directory: UserDirectory;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [rules, setRules] = useState<readonly SharingRule[]>([]);
  const [draft, setDraft] = useState<SharingRule>();
  const [originalKey, setOriginalKey] = useState<string>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();
  const [editorTab, setEditorTab] = useState<'rule' | 'access' | 'assignments'>(
    'rule',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(async (): Promise<void> => {
    try {
      setRules(await authz.listSharingRules());
    } catch (cause) {
      setError(message(t, cause));
    }
  }, [t]);
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
  const pagedRules = pageSlice(visibleRules, page);
  // Narrowing the search can leave the current page past the end of the list.
  function changeSearch(value: string): void {
    setSearch(value);
    setPage(1);
  }
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
        throw new TypeError(t('errors.completeRule'));
      if (originalKey) await authz.updateSharingRule(originalKey, draft);
      else await authz.createSharingRule(draft);
      setDraft(undefined);
      setOriginalKey(undefined);
      await load();
    } catch (cause) {
      setError(message(t, cause));
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
      <ManagementToolbar
        search={search}
        searchLabel={t('sharingRules.search')}
        searchPlaceholder={t('sharingRules.search')}
        onSearch={changeSearch}
        actionLabel={t('sharingRules.create')}
        onAction={() => edit()}
      />
      <ManagementTable>
        <Table className='min-w-[58rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                {t('sharingRules.ruleHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('common.resource')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('sharingRules.recordsSharedHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('sharingRules.sharedWithHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('sharingRules.accessHeader')}
              </TableHead>
              <TableHead className='w-20 px-5 py-3' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRules.map((rule) => (
              <TableRow key={rule.key}>
                <TableCell className='px-5 py-4'>
                  <button
                    type='button'
                    className='font-medium text-primary hover:underline'
                    onClick={() => edit(rule)}
                  >
                    {rule.title || humanize(rule.key)}
                  </button>
                  <p className='text-xs text-muted-foreground'>{rule.key}</p>
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {resourceLabel(options, rule)}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {selectionLabel(t, rule)}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {subjectLabel(t, rule, directory)}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {rule.actions.map((item) => humanize(item.action)).join(', ')}
                </TableCell>
                <TableCell className='px-5 py-4 text-right'>
                  <Button size='sm' variant='ghost' onClick={() => edit(rule)}>
                    {t('common.edit')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {visibleRules.length === 0 ? (
              <EmptyTableRow colSpan={6}>
                {rules.length === 0
                  ? t('sharingRules.emptyNone')
                  : t('sharingRules.emptySearch')}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label={t('sharingRules.pagerLabel')}
          page={page}
          total={visibleRules.length}
          onPage={setPage}
        />
      </ManagementTable>
      <ConfirmDialog
        confirmLabel={t('sharingRules.deleteRule')}
        open={confirmDelete}
        title={t('sharingRules.confirmDeleteTitle')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
      >
        {t('sharingRules.confirmDeleteBody', {
          title: draft?.title || humanize(originalKey ?? ''),
        })}
      </ConfirmDialog>
      {draft ? (
        <SidePanel
          title={t(
            originalKey ? 'sharingRules.editTitle' : 'sharingRules.newTitle',
          )}
          description={t('sharingRules.editorDescription')}
          onClose={() => setDraft(undefined)}
          wide
          scrollable={false}
        >
          <RuleEditorLayout
            steps={sharingSteps(t)}
            value={editorTab}
            onChange={(value) =>
              setEditorTab(value as 'rule' | 'access' | 'assignments')
            }
            footer={
              <>
                {originalKey ? (
                  <Button
                    variant='outline'
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t('sharingRules.deleteRule')}
                  </Button>
                ) : null}
                <Button variant='outline' onClick={() => setDraft(undefined)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void save()}>
                  {t('sharingRules.save')}
                </Button>
              </>
            }
          >
            {editorTab === 'rule' ? (
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('sharingRules.ruleHeading')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('sharingRules.ruleDescription')}
                  </p>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <Field label={t('sharingRules.ruleName')}>
                    <Input
                      value={draft.title ?? ''}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t('common.key')} hint={t('common.keyHint')}>
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
                    {t('sharingRules.accessHeading')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('sharingRules.accessDescription')}
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
                    {t('sharingRules.assignmentsHeading')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('sharingRules.assignmentsDescription')}
                  </p>
                </div>
                <SubjectsEditor
                  directory={directory}
                  value={draft.subjects}
                  onChange={(subjects) => setDraft({ ...draft, subjects })}
                />
                <Field label={t('sharingRules.description')}>
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

function sharingSteps(
  t: Translate,
): readonly { value: string; label: string; description: string }[] {
  return [
    {
      value: 'rule',
      label: t('sharingRules.steps.rule'),
      description: t('sharingRules.steps.ruleHint'),
    },
    {
      value: 'access',
      label: t('sharingRules.steps.access'),
      description: t('sharingRules.steps.accessHint'),
    },
    {
      value: 'assignments',
      label: t('sharingRules.steps.assignments'),
      description: t('sharingRules.steps.assignmentsHint'),
    },
  ];
}

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
  const t = useAuthorizationTranslation();
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
            <Field label={t('sharingRules.recordsToShare')}>
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
                  {t('sharingRules.selectedRecords')}
                </option>
                <option value='policy'>
                  {t('sharingRules.policyRecords')}
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
  const t = useAuthorizationTranslation();
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
      <Field label={t('editors.records')}>
        <SearchField
          className='sm:max-w-none'
          label={t('editors.searchRecords')}
          placeholder={t('editors.searchRecords')}
          value={search}
          onChange={onSearch}
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
            {t('sharingRules.noRecords')}
          </p>
        ) : null}
      </div>
      <p className='text-xs text-muted-foreground'>
        {t(`editors.recordsSelected.${value.length === 1 ? 'one' : 'other'}`, {
          count: value.length,
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
function selectionLabel(t: Translate, rule: SharingRule): string {
  return rule.actions
    .map((item) =>
      t('labels.actionScope', {
        action: humanize(item.action),
        scope:
          item.selection.type === 'records'
            ? t('labels.selectedRecords', { count: item.selection.ids.length })
            : t('sharingRules.matchingPolicy'),
      }),
    )
    .join(' · ');
}
function subjectLabel(
  t: Translate,
  rule: SharingRule,
  directory: UserDirectory,
): string {
  const subject = rule.subjects[0];
  if (!subject || subject.type === 'authenticated')
    return t('common.signedInUsers');
  return (
    directory.users.find((user) => user.id === subject.id)?.name ??
    t('common.userFallback', { id: subject.id })
  );
}
function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
