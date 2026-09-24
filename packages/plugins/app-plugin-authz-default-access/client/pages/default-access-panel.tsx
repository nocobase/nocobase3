import {
  findResource,
  selectionLabel,
  workspaceSubsections,
} from '@nocobase/app-plugin-authorization/client/management';
import { DataScopesEditor } from '@nocobase/app-plugin-authorization/client/management';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import type { DefaultAccessRule } from '../api.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { SelectField } from '@nocobase/app-plugin-authorization/client/management';
import { incompleteSelection } from '@nocobase/app-plugin-authorization/client/management';
import { Menu } from '@base-ui/react/menu';
import { SelectionMark } from '@nocobase/app-plugin-authorization/client/management';
import { useSearchParams } from 'react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import type {
  AuthorizationOptions,
  RecordSelection,
  AuthorizationRecordOption,
  ResourceGroupOption,
} from '@nocobase/app-plugin-authorization/client/management';
import { useDefaultAccessClient } from '../api.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { Button } from '../components/ui/button.js';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '../components/ui/table.js';
import {
  FilterBar,
  SearchField,
} from '@nocobase/app-plugin-authorization/client/management';
import {
  ErrorBox,
  errorMessage,
} from '@nocobase/app-plugin-authorization/client/management';
import { SelectionEditor } from '@nocobase/app-plugin-authorization/client/management';
import {
  RuleDrawer,
  RuleForm,
} from '@nocobase/app-plugin-authorization/client/management';
import { useRuleDraft } from '@nocobase/app-plugin-authorization/client/management';
import {
  ManagementTable,
  EmptyTableRow,
} from '@nocobase/app-plugin-authorization/client/management';
import { TablePager } from '@nocobase/app-plugin-authorization/client/management';
import { pageSlice } from '@nocobase/app-plugin-authorization/client/management';
import { ConfirmDialog } from '@nocobase/app-plugin-authorization/client/management';

/** One resource's row; `ruleKey` is the stored rule's key once one exists. */
type Row = Omit<DefaultAccessRule, 'key'> & {
  key: string;
  ruleKey?: string;
  label: string;
};

const COMPOSITE = 'composite';

export function DefaultAccessPanel({
  options,
}: {
  options: AuthorizationOptions;
}): ReactElement {
  const authz = useDefaultAccessClient();
  const loadCompositeRecords = useCallback(
    (collection: string) => authz.listDefaultAccessRecords(collection),
    [authz],
  );
  const t = useAuthorizationTranslation();
  const settings = { type: 'settings', id: 'authorization.default-access' };
  const { can: canCreate } = useCan({ resource: settings, action: 'create' });
  const { can: canUpdate } = useCan({ resource: settings, action: 'update' });
  const { can: canDelete } = useCan({ resource: settings, action: 'delete' });
  const [loaded, setLoaded] = useState(false);
  const [rules, setRules] = useState<readonly DefaultAccessRule[]>([]);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const configured = params.get('configured') === '1';
  const groupFilter = params.get('group') ?? '';
  const sections = workspaceSubsections(options).filter(
    (item) => item.resources.length > 0,
  );
  const subsection =
    sections.find((item) => item.value === params.get('section')) ??
    sections[0];
  const compositeSection = Boolean(
    subsection?.resources.every((item) => item.type === COMPOSITE),
  );
  const inSubsection = (resource: { type: string; id: string }): boolean =>
    Boolean(
      subsection?.resources.some(
        (item) => item.type === resource.type && item.value === resource.id,
      ),
    );
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [saved, setSaved] = useState(false);
  function filter(name: string, value: string): void {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  }
  const [busy, setBusy] = useState(false);
  const [errorCause, setErrorCause] = useState<unknown>();
  const error =
    errorCause === undefined ? undefined : errorMessage(t, errorCause);
  const [confirmClear, setConfirmClear] = useState(false);
  const [records, setRecords] = useState<readonly AuthorizationRecordOption[]>(
    [],
  );
  const load = useCallback(async () => {
    try {
      setRules(await authz.listDefaultAccess());
      setLoaded(true);
    } catch (cause) {
      setErrorCause(cause);
    }
  }, [authz]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const resource of workspaceSubsections(options).flatMap(
      (item) => item.resources,
    )) {
      const key = JSON.stringify([resource.type, resource.value]);
      if (result.some((row) => row.key === key)) continue;
      const rule = rules.find(
        (item) =>
          item.resource.type === resource.type &&
          item.resource.id === resource.value,
      );
      result.push({
        key,
        ...(rule ? { ruleKey: rule.key } : {}),
        label: resource.label,
        resource: { type: resource.type, id: resource.value },
        actions: rule?.actions ?? [],
      });
    }
    for (const rule of rules) {
      if (
        !result.some(
          (row) =>
            row.resource.type === rule.resource.type &&
            row.resource.id === rule.resource.id,
        )
      )
        result.push({
          ...rule,
          key: JSON.stringify([rule.resource.type, rule.resource.id]),
          ruleKey: rule.key,
          label: rule.resource.id,
        });
    }
    return result;
  }, [options, rules]);
  const { draft, setDraft, edit, close, dirty } = useRuleDraft(
    loaded ? rows : [],
    (): Row => ({
      key: '',
      label: '',
      resource: { type: '', id: '' },
      actions: [],
    }),
  );
  useEffect(() => {
    let active = true;
    if (!draft?.resource.id || draft.resource.type === COMPOSITE) return;
    void authz.listDefaultAccessRecords(draft.resource.id).then(
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
  }, [authz, draft?.resource.id, draft?.resource.type]);
  const actions = [
    ...new Map(
      (subsection?.actions ?? [])
        .filter((action) => action.value !== 'create')
        .map((action) => [action.value, action] as const),
    ).values(),
  ];
  const visible = rows.filter(
    (row) =>
      inSubsection(row.resource) &&
      (!configured || row.actions.length > 0) &&
      (!groupFilter || resourcePath(options, row) === groupFilter) &&
      `${row.label} ${row.resource.id} ${resourcePath(options, row)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  /** Writes a row's actions: create, update, or delete its rule. */
  async function persist(
    row: Row,
    actions: DefaultAccessRule['actions'],
  ): Promise<void> {
    if (!actions.length) {
      if (row.ruleKey) await authz.deleteDefaultAccess(row.ruleKey);
      return;
    }
    const key = row.ruleKey ?? `${row.resource.type}.${row.resource.id}`;
    const rule = { key, resource: row.resource, actions };
    if (row.ruleKey) await authz.updateDefaultAccess(key, rule);
    else await authz.createDefaultAccess(rule);
  }
  /** Whether the current user may write this change to a row. */
  function canWrite(row: Row, actions: readonly unknown[]): boolean {
    if (!row.ruleKey) return canCreate;
    return actions.length ? canUpdate : canDelete;
  }
  const canConfigure = canCreate || canUpdate || canDelete;
  async function save(clear = false) {
    if (!draft || busy) return;
    const actions = clear ? [] : draft.actions;
    if (!canWrite(draft, actions)) return;
    setBusy(true);
    setErrorCause(undefined);
    try {
      if (
        !clear &&
        draft.actions.some((item) => incompleteSelection(item.selection))
      )
        throw new Error(t('databasePolicy.conditionRequired'));
      await persist(draft, actions);
      close();
      await load();
    } catch (cause) {
      setErrorCause(cause);
    } finally {
      setBusy(false);
    }
  }
  const groupPaths = [
    ...new Set(
      rows
        .filter((row) => inSubsection(row.resource))
        .map((row) => resourcePath(options, row)),
    ),
  ];
  const ordered = groupPaths.flatMap((path) =>
    visible.filter((row) => resourcePath(options, row) === path),
  );
  const paged = pageSlice(ordered, page);
  async function quickChange(
    row: Row,
    action: string,
    mode: string,
  ): Promise<void> {
    if (busy || !canConfigure) return;
    if (mode === 'custom' || row.resource.type === COMPOSITE) {
      edit(row);
      return;
    }
    const next = row.actions.filter((item) => item.action !== action);
    if (mode === 'all') next.push({ action, selection: { type: 'all' } });
    if (!canWrite(row, next)) return;
    setBusy(true);
    setSaved(false);
    setErrorCause(undefined);
    try {
      await persist(row, next);
      await load();
      setSaved(true);
    } catch (cause) {
      setErrorCause(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <>
        <div className='flex min-h-[60vh] gap-3 lg:min-h-0 lg:flex-1'>
          <nav
            aria-label={t('editors.resourceGroup')}
            className='w-40 shrink-0 space-y-1 rounded-lg border bg-card p-2 lg:overflow-y-auto'
          >
            {sections.map((item) => (
              <button
                key={item.value}
                aria-current={
                  item.value === subsection?.value ? 'page' : undefined
                }
                className='flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary aria-[current=page]:font-medium'
                onClick={() => {
                  setParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set('section', item.value);
                      next.delete('group');
                      next.delete('page');
                      return next;
                    },
                    { replace: true },
                  );
                }}
              >
                <span>{item.label}</span>
                <span className='text-xs text-muted-foreground'>
                  {item.resources.length}
                </span>
              </button>
            ))}
          </nav>
          <div className='min-w-0 flex-1 space-y-3 lg:flex lg:min-h-0 lg:flex-col'>
            <FilterBar>
              <SearchField
                label={t('permissionSets.picker.searchResources')}
                placeholder={t('permissionSets.picker.searchResources')}
                value={search}
                onChange={(value) => filter('search', value)}
              />
              {subsection?.groups.length ? (
                <SelectField
                  aria-label={t('defaultAccess.groupFilter')}
                  className='h-9 max-w-64 rounded-md border bg-transparent px-3 text-sm'
                  value={groupFilter}
                  onValueChange={(selectedValue) =>
                    filter('group', selectedValue)
                  }
                  options={[
                    { value: '', label: t('defaultAccess.allGroups') },
                    ...groupPaths.map((path) => ({ value: path, label: path })),
                  ]}
                />
              ) : null}
              <label className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={configured}
                  onCheckedChange={(checked) =>
                    filter('configured', checked ? '1' : '')
                  }
                />
                {t('permissionWorkspace.configuredOnly')}
              </label>
            </FilterBar>
            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>{t('defaultAccess.inlineHint')}</span>
              {saved ? (
                <span role='status'>{t('defaultAccess.saved')}</span>
              ) : null}
            </div>
            {/* Below lg the viewport cap keeps the table's header sticky without lengthening the page; from lg the
              page passes its height down, so the card keeps its content height and scrolls only when space runs out. */}
            <ManagementTable className='lg:flex lg:min-h-0 lg:flex-col'>
              <div className='max-h-[65vh] overflow-auto lg:max-h-none lg:min-h-0'>
                <Table className='min-w-[36rem] table-fixed'>
                  <TableHeader className='sticky top-0 z-10 bg-card'>
                    <TableRow>
                      <TableHead className='w-[32%] px-5 py-3'>
                        {t('common.resource')}
                      </TableHead>
                      {compositeSection ? (
                        <TableHead className='px-2 py-3'>
                          {t('editors.actions')}
                        </TableHead>
                      ) : (
                        actions.map((action) => (
                          <TableHead
                            key={action.value}
                            className='w-28 px-2 py-3 text-center'
                          >
                            {action.label}
                          </TableHead>
                        ))
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupPaths.map((path) => {
                      const groupRows = paged.filter(
                        (row) => resourcePath(options, row) === path,
                      );
                      if (!groupRows.length) return null;
                      const grouped = path !== '';
                      return (
                        <Fragment key={path}>
                          {grouped ? (
                            <TableRow className='bg-muted/40'>
                              <TableCell
                                colSpan={
                                  compositeSection ? 2 : actions.length + 1
                                }
                                className='p-0'
                              >
                                <button
                                  className='flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium'
                                  aria-expanded={!collapsed.has(path)}
                                  onClick={() =>
                                    setCollapsed((old) => {
                                      const next = new Set(old);
                                      if (next.has(path)) next.delete(path);
                                      else next.add(path);
                                      return next;
                                    })
                                  }
                                >
                                  {collapsed.has(path) ? (
                                    <ChevronRight className='size-4' />
                                  ) : (
                                    <ChevronDown className='size-4' />
                                  )}
                                  {path}
                                </button>
                              </TableCell>
                            </TableRow>
                          ) : null}
                          {!grouped || !collapsed.has(path)
                            ? groupRows.map((row) => (
                                <TableRow key={row.key}>
                                  <TableCell className='px-5 py-3'>
                                    <button
                                      className='text-sm font-medium hover:text-primary'
                                      onClick={() => edit(row)}
                                    >
                                      {row.label}
                                    </button>
                                    <p className='truncate text-xs text-muted-foreground'>
                                      {row.resource.id}
                                    </p>
                                  </TableCell>
                                  {row.resource.type === COMPOSITE ? (
                                    <TableCell className='px-2 py-2'>
                                      <div className='flex flex-wrap gap-x-3 gap-y-1'>
                                        {findResource(
                                          options,
                                          row.resource,
                                        )?.actions?.map((action) => {
                                          const scopes = row.actions.filter(
                                            (item) =>
                                              item.action === action.value,
                                          );
                                          return (
                                            <button
                                              key={action.value}
                                              type='button'
                                              aria-label={`${row.label}: ${action.label}`}
                                              disabled={
                                                busy || !loaded || !canConfigure
                                              }
                                              onClick={() => edit(row)}
                                              className='inline-flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-left text-sm hover:bg-muted'
                                            >
                                              <SelectionMark
                                                value={
                                                  !scopes.length
                                                    ? 'none'
                                                    : scopes.every(
                                                          (item) =>
                                                            item.selection
                                                              .type === 'all',
                                                        )
                                                      ? 'all'
                                                      : 'scoped'
                                                }
                                              />
                                              <span>{action.label}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </TableCell>
                                  ) : (
                                    actions.map((action) => {
                                      const resource = findResource(
                                        options,
                                        row.resource,
                                      );
                                      const supported = (
                                        resource?.actions ?? actions
                                      ).some(
                                        (item) => item.value === action.value,
                                      );
                                      const current = row.actions.find(
                                        (item) => item.action === action.value,
                                      );
                                      return (
                                        <TableCell
                                          key={action.value}
                                          className='px-2 py-2 text-center'
                                        >
                                          {row.resource.type === COMPOSITE &&
                                          supported ? (
                                            <button
                                              type='button'
                                              aria-label={`${row.label}: ${action.label}`}
                                              disabled={
                                                busy || !loaded || !canConfigure
                                              }
                                              onClick={() => edit(row)}
                                              className='inline-flex items-center gap-1 rounded-md border bg-muted/30 p-1 hover:bg-muted'
                                            >
                                              <SelectionMark
                                                value={
                                                  current ? 'scoped' : 'none'
                                                }
                                              />
                                              {
                                                row.actions.filter(
                                                  (item) =>
                                                    item.action ===
                                                    action.value,
                                                ).length
                                              }
                                              /
                                              {resource?.dataScopes?.[
                                                action.value
                                              ]?.length ?? 0}
                                            </button>
                                          ) : supported || current ? (
                                            <DefaultScopeControl
                                              label={`${row.label}: ${action.label}`}
                                              selection={current?.selection}
                                              options={options}
                                              disabled={
                                                busy || !loaded || !canConfigure
                                              }
                                              onChange={(mode) =>
                                                void quickChange(
                                                  row,
                                                  action.value,
                                                  mode,
                                                )
                                              }
                                            />
                                          ) : (
                                            <span className='text-muted-foreground'>
                                              —
                                            </span>
                                          )}
                                        </TableCell>
                                      );
                                    })
                                  )}
                                </TableRow>
                              ))
                            : null}
                        </Fragment>
                      );
                    })}
                    {!paged.length ? (
                      <EmptyTableRow
                        colSpan={compositeSection ? 2 : actions.length + 1}
                      >
                        {!loaded
                          ? t('common.loading')
                          : t('defaultAccess.emptySearch')}
                      </EmptyTableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
              <TablePager
                total={visible.length}
                page={page}
                label={t('defaultAccess.pagerLabel')}
                onPage={(value) => filter('page', String(value))}
              />
            </ManagementTable>
            <div className='flex flex-wrap gap-4 text-xs text-muted-foreground'>
              {(['none', 'all', 'scoped'] as const).map((mark) => {
                const label = t(
                  mark === 'none'
                    ? 'defaultAccess.noDefault'
                    : mark === 'all'
                      ? 'labels.allRecords'
                      : 'defaultAccess.customScope',
                );
                return (
                  <span key={mark} className='flex items-center gap-1'>
                    <SelectionMark value={mark} label={label} legend />
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </>
      {draft ? (
        <RuleDrawer
          title={draft.label}
          description={`${[subsectionLabel(options, draft), resourcePath(options, draft)].filter(Boolean).join(' / ')} · ${t('defaultAccess.editorDescription')}`}
          dirty={dirty}
          busy={busy}
          onClose={close}
        >
          <fieldset
            disabled={!canConfigure}
            className='min-h-0 flex-1 overflow-auto'
          >
            <RuleForm
              footer={
                <>
                  <Button
                    className='mr-auto text-destructive'
                    variant='ghost'
                    disabled={
                      busy ||
                      !canDelete ||
                      !rows.find((row) => row.key === draft.key)?.actions.length
                    }
                    onClick={() => setConfirmClear(true)}
                  >
                    {t('ruleWorkspace.clearDefaults')}
                  </Button>
                  <Button
                    disabled={busy || !dirty || !canWrite(draft, draft.actions)}
                    onClick={() => void save()}
                  >
                    {t('defaultAccess.save')}
                  </Button>
                </>
              }
            >
              {error ? <ErrorBox value={error} /> : null}
              {draft.resource.type === COMPOSITE ? (
                <DataScopesEditor
                  options={options}
                  resourceId={draft.resource.id}
                  value={draft.actions}
                  onChange={(actions) => setDraft({ ...draft, actions })}
                  loadRecords={loadCompositeRecords}
                />
              ) : (
                actions
                  .filter((action) => {
                    return (
                      (
                        findResource(options, draft.resource)?.actions ??
                        actions
                      ).some((item) => item.value === action.value) ||
                      draft.actions.some((item) => item.action === action.value)
                    );
                  })
                  .map((action) => {
                    const current = draft.actions.find(
                      (item) => item.action === action.value,
                    );
                    const change = (selection?: RecordSelection) =>
                      setDraft({
                        ...draft,
                        actions: selection
                          ? current
                            ? draft.actions.map((item) =>
                                item.action === action.value
                                  ? { ...item, selection }
                                  : item,
                              )
                            : [
                                ...draft.actions,
                                { action: action.value, selection },
                              ]
                          : draft.actions.filter(
                              (item) => item.action !== action.value,
                            ),
                      });
                    return (
                      <section key={action.value} className='space-y-4'>
                        <label className='flex flex-wrap items-center justify-between gap-3 font-medium'>
                          {action.label}
                          <SelectField
                            aria-label={action.label}
                            className='h-9 min-w-48 rounded-md border bg-transparent px-3 text-sm font-normal'
                            value={
                              !current
                                ? 'unset'
                                : current.selection.type === 'all'
                                  ? 'all'
                                  : 'custom'
                            }
                            onValueChange={(selectedValue) =>
                              change(
                                selectedValue === 'unset'
                                  ? undefined
                                  : selectedValue === 'all'
                                    ? { type: 'all' }
                                    : {
                                        type: 'recordAccess',
                                        key:
                                          options.recordAccess.find(
                                            (item) =>
                                              item.value !== 'allRecords',
                                          )?.value ?? 'customFilter',
                                      },
                              )
                            }
                            options={[
                              {
                                value: 'unset',
                                label: t('defaultAccess.noDefault'),
                              },
                              { value: 'all', label: t('labels.allRecords') },
                              {
                                value: 'custom',
                                label: t('defaultAccess.customScope'),
                              },
                            ]}
                          />
                        </label>
                        {current && current.selection.type !== 'all' ? (
                          <SelectionEditor
                            options={options}
                            fields={
                              options.collections.find(
                                (item) => item.name === draft.resource.id,
                              )?.fields
                            }
                            records={records}
                            value={current.selection}
                            onChange={change}
                          />
                        ) : !current ? (
                          <p className='text-sm text-muted-foreground'>
                            {t('ruleWorkspace.unsetHint')}
                          </p>
                        ) : null}
                      </section>
                    );
                  })
              )}
            </RuleForm>
          </fieldset>
          <ConfirmDialog
            open={confirmClear}
            title={t('defaultAccess.confirmDeleteTitle')}
            confirmLabel={t('ruleWorkspace.clearDefaults')}
            onCancel={() => setConfirmClear(false)}
            onConfirm={() => {
              setConfirmClear(false);
              void save(true);
            }}
          >
            {t('defaultAccess.confirmDeleteBody', { resource: draft.label })}
          </ConfirmDialog>
        </RuleDrawer>
      ) : null}
    </>
  );
}

/** The subsection that lists the row's resource. */
function subsectionOf(options: AuthorizationOptions, row: Row) {
  return workspaceSubsections(options).find((item) =>
    item.resources.some(
      (resource) =>
        resource.type === row.resource.type &&
        resource.value === row.resource.id,
    ),
  );
}

function subsectionLabel(options: AuthorizationOptions, row: Row): string {
  return subsectionOf(options, row)?.label ?? '';
}

/** The row's resource-group trail; empty when ungrouped. */
function resourcePath(options: AuthorizationOptions, row: Row): string {
  const groupId = findResource(options, row.resource)?.group;
  function find(
    groups: readonly ResourceGroupOption[],
    ancestors: string[],
  ): string[] | undefined {
    for (const group of groups) {
      const path = [...ancestors, group.label];
      if (group.value === groupId) return path;
      const nested = find(group.children ?? [], path);
      if (nested) return nested;
    }
    return undefined;
  }
  return (find(subsectionOf(options, row)?.groups ?? [], []) ?? []).join(' / ');
}

function DefaultScopeControl({
  label,
  selection,
  options,
  disabled,
  onChange,
}: {
  label: string;
  selection?: RecordSelection;
  options: AuthorizationOptions;
  disabled: boolean;
  onChange: (mode: string) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const mode = !selection
    ? 'unset'
    : selection.type === 'all'
      ? 'all'
      : 'custom';
  const choices = [
    {
      value: 'unset',
      mark: 'none' as const,
      label: t('defaultAccess.noDefault'),
    },
    { value: 'all', mark: 'all' as const, label: t('labels.allRecords') },
    {
      value: 'custom',
      mark: 'scoped' as const,
      label: t('defaultAccess.customScope'),
    },
  ];
  const selected = choices.find((item) => item.value === mode)!;
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        aria-label={label}
        title={
          selection ? selectionLabel(t, selection, options) : selected.label
        }
        className='inline-flex cursor-pointer items-center gap-1 rounded-md border bg-muted/30 p-1 hover:bg-muted disabled:opacity-50'
      >
        <SelectionMark value={selected.mark} label={selected.label} />
        <ChevronDown className='size-3 text-muted-foreground' />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} className='z-50'>
          <Menu.Popup className='min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md'>
            {choices.map((item) => (
              <Menu.Item
                aria-label={item.label}
                key={item.value}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted ${item.value === mode ? 'bg-primary/10 text-primary' : ''}`}
                onClick={() => onChange(item.value)}
              >
                <SelectionMark value={item.mark} label={item.label} />
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
