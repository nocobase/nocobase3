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
  AuthorizationOptions,
  RestrictionRule,
} from '../authorization-client.js';
import { ConfirmDialog } from '../components/confirm-dialog.js';
import {
  ActionScopesEditor,
  Field,
  ResourceEditor,
  SubjectsEditor,
} from '../components/editors.js';
import {
  ErrorBox,
  errorMessage as message,
  NoticeBox,
} from '../components/feedback.js';
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
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [records, setRecords] = useState<
    readonly import('../authorization-client.js').AuthorizationRecordOption[]
  >([]);
  useEffect(() => {
    if (!draft?.resource.id) return;
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
  }, [draft?.resource.id]);
  const load = useCallback(async (): Promise<void> => {
    try {
      setRules(await authz.listRestrictionRules());
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
      setError(message(t, cause));
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
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <NoticeBox>{t('restrictionRules.notice')}</NoticeBox>
      <ManagementToolbar
        search={search}
        searchLabel={t('restrictionRules.search')}
        searchPlaceholder={t('restrictionRules.search')}
        onSearch={changeSearch}
        actionLabel={t('restrictionRules.create')}
        onAction={() => edit()}
      />
      <ManagementTable>
        <Table className='min-w-[56rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.ruleHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.appliesToHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('common.resource')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.restrictedActionsHeader')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('restrictionRules.allowedScopeHeader')}
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
                  <p className='text-xs text-muted-foreground'>
                    {rule.reason || rule.key}
                  </p>
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
                  {resourceLabel(options, rule)}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {rule.actions
                    .map((item) =>
                      actionLabel(options, rule.resource.type, item.action),
                    )
                    .join(', ')}
                </TableCell>
                <TableCell className='px-5 py-4'>
                  {scopeLabel(t, rule, options)}
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
          title: draft?.title || humanize(originalKey ?? ''),
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

function scopeLabel(
  t: Translate,
  rule: RestrictionRule,
  options: AuthorizationOptions,
): string {
  return rule.actions
    .map((item) =>
      t('labels.actionScope', {
        action: actionLabel(options, rule.resource.type, item.action),
        scope: accessScopeLabel(t, item.scope, options),
      }),
    )
    .join(' · ');
}
function accessScopeLabel(
  t: Translate,
  scope: import('../authorization-client.js').AccessScope,
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
