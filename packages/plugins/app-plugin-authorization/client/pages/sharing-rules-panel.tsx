import { Checkbox } from '../components/ui/checkbox.js';
import { SelectField } from '../components/select-field.js';
import { incompleteScope } from '../components/filter-ast.js';
import {
  useSubjectNames,
  subjectKey,
} from '../components/use-subject-names.js';
import { RuleDrawer, RuleForm } from '../components/rule-drawer.js';
import { useRuleDraft } from '../components/use-rule-draft.js';
import { actionLabel } from './permission-sets/labels.js';
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
  TablePager,
} from '../components/management-ui.js';
import { useAuthorizationTranslation, type Translate } from '../i18n.js';
import { pageSlice } from '../components/pagination.js';
import { defaultScope, firstActions } from '../components/rule-utils.js';
import { getAuthorizationClient } from '../runtime.js';

const authz = getAuthorizationClient();

export function SharingRulesPanel({
  options,
}: {
  options: AuthorizationOptions;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [rules, setRules] = useState<readonly SharingRule[]>([]);
  const subjectNames = useSubjectNames(
    'sharing-rules',
    options.subjectTypes,
    rules.flatMap((rule) => rule.subjects),
  );
  const { draft, setDraft, originalKey, edit, close, dirty } = useRuleDraft(
    rules,
    () => fresh(options),
  );
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();
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
  async function save(): Promise<void> {
    if (!draft || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (
        !draft.key ||
        !draft.resource.id ||
        draft.actions.length === 0 ||
        draft.actions.some(
          (item) =>
            item.selection.type === 'policy' &&
            incompleteScope(item.selection.policy),
        ) ||
        draft.actions.some(
          (item) =>
            item.selection.type === 'records' &&
            item.selection.ids.length === 0,
        ) ||
        draft.subjects.length === 0 ||
        draft.subjects.some((item) => !item.id)
      )
        throw new TypeError(t('errors.completeRule'));
      if (originalKey) await authz.updateSharingRule(originalKey, draft);
      else await authz.createSharingRule(draft);
      close();
      await load();
    } catch (cause) {
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(): Promise<void> {
    if (!originalKey || busy) return;
    setBusy(true);
    try {
      await authz.deleteSharingRule(originalKey);
      close();
      await load();
    } catch (cause) {
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
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
                  {selectionLabel(t, rule, options)}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {rule.subjects
                    .map(
                      (subject) =>
                        subjectNames[subjectKey(subject)] ??
                        `${subject.type}: ${subject.id}`,
                    )
                    .join(' · ')}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {rule.actions
                    .map((item) =>
                      actionLabel(options, rule.resource.type, item.action),
                    )
                    .join(', ')}
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
        <RuleDrawer
          title={t(
            originalKey ? 'sharingRules.editTitle' : 'sharingRules.newTitle',
          )}
          description={t('sharingRules.editorDescription')}
          onClose={close}
          dirty={dirty}
          busy={busy}
        >
          <RuleForm
            footer={
              <>
                {originalKey ? (
                  <Button
                    variant='outline'
                    className='mr-auto text-destructive'
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t('sharingRules.deleteRule')}
                  </Button>
                ) : null}
                <Button disabled={busy} onClick={() => void save()}>
                  {t('sharingRules.save')}
                </Button>
              </>
            }
          >
            {error ? <ErrorBox value={error} /> : null}
            <>
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
                <Field label={t('sharingRules.description')}>
                  <Input
                    value={draft.reason ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, reason: event.target.value })
                    }
                  />
                </Field>
              </section>
            </>
            <>
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
                  types={options.subjectTypes}
                  settings='sharing-rules'
                  value={draft.subjects}
                  onChange={(subjects) => setDraft({ ...draft, subjects })}
                />
              </section>
            </>
            <>
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
            </>
          </RuleForm>
        </RuleDrawer>
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
    subjects: [],
    reason: '',
  };
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
  const [records, setRecords] = useState<
    readonly import('../authorization-client.js').AuthorizationRecordOption[]
  >([]);
  const [recordSearch, setRecordSearch] = useState('');
  useEffect(() => {
    let active = true;
    void authz.listSharingRecords(collection).then(
      (items) => {
        if (active) setRecords(items);
      },
      () => {
        if (active) setRecords([]);
      },
    );
    return () => {
      active = false;
    };
  }, [collection]);
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
        }}
      />
      {value.map((current) => (
        <section
          key={current.action}
          className='overflow-hidden rounded-lg border'
        >
          <h4 className='border-b bg-muted/20 px-4 py-3 font-medium'>
            {actionLabel(options, resourceType, current.action)}
          </h4>
          <div className='space-y-4 p-4'>
            <Field label={t('sharingRules.recordsToShare')}>
              <SelectField
                aria-label={t('sharingRules.recordsToShare')}
                className='h-8 w-full rounded-lg border bg-background px-3 text-sm'
                value={current.selection.type}
                onValueChange={(selectedValue) =>
                  changeSharingAction(
                    value,
                    current.action,
                    onChange,
                    selectedValue === 'records'
                      ? { type: 'records', ids: [] }
                      : { type: 'policy', policy: defaultPolicy(options) },
                  )
                }
                options={[
                  {
                    value: 'records',
                    label: t('sharingRules.selectedRecords'),
                  },
                  { value: 'policy', label: t('sharingRules.policyRecords') },
                ]}
              />
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
      ))}
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
            <Checkbox
              className='mt-1'
              checked={value.includes(record.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
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
function selectionLabel(
  t: Translate,
  rule: SharingRule,
  options: AuthorizationOptions,
): string {
  return rule.actions
    .map((item) =>
      t('labels.actionScope', {
        action: actionLabel(options, rule.resource.type, item.action),
        scope:
          item.selection.type === 'records'
            ? t('labels.selectedRecords', { count: item.selection.ids.length })
            : policyLabel(t, item.selection.policy, options),
      }),
    )
    .join(' · ');
}

function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function policyLabel(
  t: Translate,
  scope: AccessScope,
  options: AuthorizationOptions,
): string {
  if (scope.type === 'all') return t('labels.allRecords');
  if (scope.type === 'ids')
    return t('labels.selectedRecords', { count: scope.ids.length });
  const key =
    typeof scope.recordAccess === 'string'
      ? scope.recordAccess
      : scope.recordAccess.key;
  return (
    options.recordAccessPolicies.find((item) => item.value === key)?.label ??
    key
  );
}
