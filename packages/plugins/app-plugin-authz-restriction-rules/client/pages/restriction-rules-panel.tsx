import { titleText } from '@nocobase/app-plugin-authorization/client/management';
import { SelectField } from '@nocobase/app-plugin-authorization/client/management';
import { resourceSections } from '@nocobase/app-plugin-authorization/client/management';
import { BusinessRuleScopes } from '@nocobase/app-plugin-authorization/client/management';
import type { RestrictionRule } from '../api.js';
import { incompleteScope } from '@nocobase/app-plugin-authorization/client/management';
import {
  useSubjectNames,
  subjectKey,
} from '@nocobase/app-plugin-authorization/client/management';
import {
  RuleDrawer,
  RuleForm,
} from '@nocobase/app-plugin-authorization/client/management';
import { useRuleDraft } from '@nocobase/app-plugin-authorization/client/management';
import { actionLabel } from '@nocobase/app-plugin-authorization/client/management';
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
import type { AuthorizationOptions } from '@nocobase/app-plugin-authorization/client/management';
import { ConfirmDialog } from '@nocobase/app-plugin-authorization/client/management';
import {
  ActionScopesEditor,
  Field,
  ResourceEditor,
  SubjectsEditor,
} from '@nocobase/app-plugin-authorization/client/management';
import {
  ErrorBox,
  errorMessage as message,
} from '@nocobase/app-plugin-authorization/client/management';
import {
  EmptyTableRow,
  ManagementTable,
  ManagementToolbar,
} from '@nocobase/app-plugin-authorization/client/management';
import { TablePager } from '@nocobase/app-plugin-authorization/client/management';
import { useAuthorizationTranslation, type Translate } from '../i18n.js';
import { pageSlice } from '@nocobase/app-plugin-authorization/client/management';
import {
  defaultScope,
  firstActions,
} from '@nocobase/app-plugin-authorization/client/management';
import { authz } from '../api.js';

export function RestrictionRulesPanel({
  options,
}: {
  options: AuthorizationOptions;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [rules, setRules] = useState<readonly RestrictionRule[]>([]);
  const subjectNames = useSubjectNames(
    'restriction-rules',
    options.subjectTypes,
    rules.flatMap((rule) => rule.subjects),
  );
  const { draft, setDraft, originalKey, edit, close, dirty } = useRuleDraft(
    rules,
    () => fresh(options),
  );
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sectionKey, setSectionKey] = useState('');
  const sections = useMemo(() => resourceSections(options), [options]);
  const [page, setPage] = useState(1);
  const [errorCause, setErrorCause] = useState<unknown>();
  const error = errorCause === undefined ? undefined : message(t, errorCause);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [records, setRecords] = useState<
    readonly import('@nocobase/app-plugin-authorization/client/management').AuthorizationRecordOption[]
  >([]);
  useEffect(() => {
    if (!draft?.resource.id || draft.resource.type === 'resource') return;
    let active = true;
    void authz.listRestrictionRecords(draft.resource.id).then(
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
  }, [draft?.resource.id, draft?.resource.type]);
  const load = useCallback(async (): Promise<void> => {
    try {
      setRules(await authz.listRestrictionRules());
    } catch (cause) {
      setErrorCause(cause);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const visibleRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    const section = sections.find((item) => item.key === sectionKey);
    const selectedRules = section
      ? rules.filter(
          (rule) =>
            rule.resource.type === section.value &&
            section.resources.some((item) => item.value === rule.resource.id),
        )
      : rules;
    return query
      ? selectedRules.filter((rule) =>
          [titleText(rule.title, t), rule.key, rule.resource.id].some((value) =>
            value?.toLowerCase().includes(query),
          ),
        )
      : selectedRules;
  }, [rules, search, sections, sectionKey, t]);
  const pagedRules = pageSlice(visibleRules, page);
  // Narrowing the search can leave the current page past the end of the list.
  function changeSearch(value: string): void {
    setSearch(value);
    setPage(1);
  }
  async function save(): Promise<void> {
    if (!draft || busy) return;
    setBusy(true);
    setErrorCause(undefined);
    try {
      if (
        !draft.key ||
        !draft.resource.id ||
        draft.actions.length === 0 ||
        draft.actions.some((item) => incompleteScope(item.scope)) ||
        draft.subjects.length === 0 ||
        draft.subjects.some((item) => !item.id)
      )
        throw new TypeError(t('errors.completeRule'));
      if (originalKey) await authz.updateRestrictionRule(originalKey, draft);
      else await authz.createRestrictionRule(draft);
      close();
      await load();
    } catch (cause) {
      setErrorCause(cause);
    } finally {
      setBusy(false);
    }
  }
  async function remove(): Promise<void> {
    if (!originalKey || busy) return;
    setBusy(true);
    try {
      await authz.deleteRestrictionRule(originalKey);
      close();
      await load();
    } catch (cause) {
      setErrorCause(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <ManagementToolbar
        filters={
          options.resourceGroups?.length ? (
            <SelectField
              aria-label={t('editors.resourceGroup')}
              value={sectionKey}
              onValueChange={(value) => {
                setSectionKey(value);
                setPage(1);
              }}
              options={[
                { value: '', label: t('common.all') },
                ...sections.map((section) => ({
                  value: section.key,
                  label: section.label,
                })),
              ]}
            />
          ) : undefined
        }
        search={search}
        searchLabel={t('restrictionRules.search')}
        searchPlaceholder={t('restrictionRules.search')}
        onSearch={changeSearch}
        actionLabel={t('restrictionRules.create')}
        onAction={() => edit()}
      />
      <ManagementTable>
        <Table className='min-w-[64rem] table-fixed'>
          <colgroup>
            <col className='w-[25%]' />
            <col className='w-[12%]' />
            <col className='w-[21%]' />
            <col />
            <col className='w-20' />
          </colgroup>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.ruleHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('common.resource')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.appliesToHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.accessHeading')}
              </TableHead>
              <TableHead className='w-20 px-5 py-3' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRules.map((rule) => (
              <TableRow key={rule.key}>
                <TableCell className='px-5 py-4 align-top whitespace-normal break-words'>
                  <button
                    type='button'
                    className='text-left font-medium text-primary hover:underline'
                    onClick={() => edit(rule)}
                  >
                    {titleText(rule.title, t, humanize(rule.key))}
                  </button>
                  <p className='mt-1 break-all text-xs text-muted-foreground'>
                    {rule.key}
                  </p>
                  {rule.reason && (
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {rule.reason}
                    </p>
                  )}
                </TableCell>
                <TableCell className='px-5 py-4 align-top whitespace-normal break-words'>
                  {resourceLabel(options, rule)}
                </TableCell>
                <TableCell className='px-5 py-4 align-top whitespace-normal break-words'>
                  <div className='flex flex-wrap gap-x-3 gap-y-1'>
                    {rule.subjects.map((subject) => (
                      <span key={subjectKey(subject)} className='inline-block'>
                        {subjectNames[subjectKey(subject)] ??
                          `${subject.type}: ${subject.id}`}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className='px-5 py-4 align-top whitespace-normal break-words'>
                  <div className='space-y-2 text-sm'>
                    {[...new Set(rule.actions.map((item) => item.action))].map(
                      (action) => {
                        const entries = rule.actions.filter(
                          (item) => item.action === action,
                        );
                        const declared = options.resourceTypes
                          .find((type) => type.value === rule.resource.type)
                          ?.resources.find(
                            (resource) => resource.value === rule.resource.id,
                          )?.ruleScopes;
                        const grouped =
                          (declared?.filter(
                            (target) => target.action === action,
                          ).length ?? entries.length) > 1;
                        return (
                          <div key={action}>
                            {grouped && (
                              <div className='mb-1'>
                                {actionLabel(
                                  options,
                                  rule.resource.type,
                                  action,
                                  rule.resource.id,
                                )}
                              </div>
                            )}
                            <div
                              className={
                                grouped ? 'ml-1 space-y-1 border-l pl-3' : ''
                              }
                            >
                              {entries.map((item) => {
                                const targets = options.resourceTypes
                                  .find(
                                    (type) => type.value === rule.resource.type,
                                  )
                                  ?.resources.find(
                                    (resource) =>
                                      resource.value === rule.resource.id,
                                  )?.ruleScopes;
                                const scopeLabel = targets?.find(
                                  (target) =>
                                    target.action === item.action &&
                                    target.scopeKey === item.scopeKey,
                                )?.label;
                                const multiple =
                                  (targets?.filter(
                                    (target) => target.action === item.action,
                                  ).length ?? 0) > 1;
                                return (
                                  <div
                                    key={JSON.stringify([
                                      item.action,
                                      item.scopeKey,
                                    ])}
                                    className='flex flex-wrap items-baseline gap-x-2 gap-y-1'
                                  >
                                    <span>
                                      {multiple
                                        ? (scopeLabel ?? item.scopeKey)
                                        : actionLabel(
                                            options,
                                            rule.resource.type,
                                            item.action,
                                            rule.resource.id,
                                          )}
                                    </span>
                                    <span
                                      aria-hidden='true'
                                      className='text-muted-foreground'
                                    >
                                      →
                                    </span>
                                    <span>
                                      {accessScopeLabel(t, item.scope, options)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </TableCell>
                <TableCell className='px-5 py-4 text-right align-top'>
                  <Button size='sm' variant='ghost' onClick={() => edit(rule)}>
                    {t('common.edit')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {visibleRules.length === 0 ? (
              <EmptyTableRow colSpan={5}>
                {rules.length === 0
                  ? t('restrictionRules.emptyNone')
                  : t('restrictionRules.emptySearch')}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label={t('restrictionRules.pagerLabel')}
          page={page}
          total={visibleRules.length}
          onPage={setPage}
        />
      </ManagementTable>
      <ConfirmDialog
        confirmLabel={t('restrictionRules.deleteRule')}
        open={confirmDelete}
        title={t('restrictionRules.confirmDeleteTitle')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
      >
        {t('restrictionRules.confirmDeleteBody', {
          title: titleText(draft?.title, t, humanize(originalKey ?? '')),
        })}
      </ConfirmDialog>
      {draft ? (
        <RuleDrawer
          title={t(
            originalKey
              ? 'restrictionRules.editTitle'
              : 'restrictionRules.newTitle',
          )}
          description={t('restrictionRules.editorDescription')}
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
                    {t('restrictionRules.deleteRule')}
                  </Button>
                ) : null}
                <Button disabled={busy} onClick={() => void save()}>
                  {t('restrictionRules.save')}
                </Button>
              </>
            }
          >
            {error ? <ErrorBox value={error} /> : null}
            <>
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('restrictionRules.ruleHeading')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('restrictionRules.ruleDescription')}
                  </p>
                </div>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <Field label={t('restrictionRules.ruleName')}>
                    <Input
                      value={titleText(draft.title, t)}
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
                        actions:
                          resource.type === 'resource'
                            ? []
                            : firstActions(
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
                <Field label={t('restrictionRules.reason')}>
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
                    {t('restrictionRules.assignmentsHeading')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('restrictionRules.assignmentsDescription')}
                  </p>
                </div>
                <SubjectsEditor
                  types={options.subjectTypes}
                  settings='restriction-rules'
                  value={draft.subjects}
                  onChange={(subjects) => setDraft({ ...draft, subjects })}
                />
              </section>
            </>
            <>
              <section className='space-y-5'>
                <div>
                  <h3 className='text-base font-semibold'>
                    {t('restrictionRules.accessHeading')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {t('restrictionRules.accessDescription')}
                  </p>
                </div>
                {draft.resource.type === 'resource' ? (
                  <BusinessRuleScopes
                    options={options}
                    resourceId={draft.resource.id}
                    value={draft.actions}
                    onChange={(actions) => setDraft({ ...draft, actions })}
                    loadRecords={loadBusinessRecords}
                  />
                ) : (
                  <ActionScopesEditor
                    options={options}
                    resourceType={draft.resource.type}
                    resourceId={draft.resource.id}
                    fields={collectionFields(options, draft.resource.id)}
                    records={records}
                    value={draft.actions}
                    onChange={(actions) => setDraft({ ...draft, actions })}
                  />
                )}
              </section>
            </>
          </RuleForm>
        </RuleDrawer>
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
    options.resourceTypes.find((item) => item.value === 'resource') ??
    options.resourceTypes[0];
  return {
    key: '',
    title: '',
    resource: {
      type: type?.value ?? 'database.collection',
      id: type?.resources[0]?.value ?? '',
    },
    actions:
      type?.value === 'resource'
        ? []
        : firstActions(
            options,
            type?.value ?? '',
            type?.resources[0]?.value,
          ).map((action) => ({ action, scope: defaultScope(options) })),
    subjects: [],
    reason: '',
  };
}

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

function accessScopeLabel(
  t: Translate,
  scope: import('@nocobase/app-plugin-authorization/client/management').AccessScope,
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
function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const loadBusinessRecords = (collection: string) =>
  authz.listRestrictionRecords(collection);
