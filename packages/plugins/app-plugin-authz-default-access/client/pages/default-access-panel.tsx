import { resourceSections } from '@nocobase/app-plugin-authorization/client/management';
import { BusinessRuleScopes } from '@nocobase/app-plugin-authorization/client/management';
import { useSettingsActions } from '@nocobase/app-plugin-authorization/client/management';
import type { DefaultAccessRule } from '../api.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { SelectField } from '@nocobase/app-plugin-authorization/client/management';
import { incompleteScope } from '@nocobase/app-plugin-authorization/client/management';
import { Menu } from '@base-ui/react/menu';
import { ScopeMark } from '@nocobase/app-plugin-authorization/client/management';
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
  AccessScope,
  AuthorizationRecordOption,
  ResourceGroupOption,
} from '@nocobase/app-plugin-authorization/client/management';
import { authz } from '../api.js';
import { useAuthorizationTranslation, type Translate } from '../i18n.js';
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
import { ScopeEditor } from '@nocobase/app-plugin-authorization/client/management';
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

type Row = DefaultAccessRule & { key: string; label: string };

export function DefaultAccessPanel({
  options,
}: {
  options: AuthorizationOptions;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const allowed = useSettingsActions('authorization.default-access');
  const [loaded, setLoaded] = useState(false);
  const [rules, setRules] = useState<readonly DefaultAccessRule[]>([]);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const configured = params.get('configured') === '1';
  const groupFilter = params.get('group') ?? '';
  const sections = resourceSections(options);
  const resourceType =
    sections.find((item) => item.key === params.get('type')) ?? sections[0];
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
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const rows = useMemo(() => {
    const result: Row[] = options.resourceTypes.flatMap((type) =>
      type.resources.map((resource) => ({
        key: JSON.stringify([type.value, resource.value]),
        label: resource.label,
        resource: { type: type.value, id: resource.value },
        actions:
          rules.find(
            (rule) =>
              rule.resource.type === type.value &&
              rule.resource.id === resource.value,
          )?.actions ?? [],
      })),
    );
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
    if (!draft?.resource.id || draft.resource.type === 'resource') return;
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
  }, [draft?.resource.id, draft?.resource.type]);
  const actions = [
    ...new Map(
      (resourceType ? [resourceType] : []).flatMap((type) =>
        type.actions
          .filter((action) => action.value !== 'create')
          .map((action) => [action.value, action] as const),
      ),
    ).values(),
  ];
  const visible = rows.filter(
    (row) =>
      row.resource.type === resourceType?.value &&
      Boolean(
        resourceType?.resources.some((item) => item.value === row.resource.id),
      ) &&
      (!configured || row.actions.length > 0) &&
      (!groupFilter || resourcePath(options, row) === groupFilter) &&
      `${row.label} ${row.resource.id} ${resourcePath(options, row)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function save(clear = false) {
    if (!draft || busy || !allowed.configure) return;
    setBusy(true);
    setErrorCause(undefined);
    try {
      if (!clear && draft.actions.some((item) => incompleteScope(item.scope)))
        throw new Error(t('databasePolicy.conditionRequired'));
      if (clear || !draft.actions.length)
        await authz.deleteDefaultAccess(draft.resource);
      else
        await authz.setDefaultAccess({
          resource: draft.resource,
          actions: draft.actions,
        });
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
        .filter((row) => row.resource.type === resourceType?.value)
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
    if (busy || !allowed.configure) return;
    if (mode === 'custom' || row.resource.type === 'resource') {
      edit(row);
      return;
    }
    setBusy(true);
    setSaved(false);
    setErrorCause(undefined);
    const next = row.actions.filter((item) => item.action !== action);
    if (mode === 'all') next.push({ action, scope: { type: 'all' } });
    try {
      if (next.length)
        await authz.setDefaultAccess({ resource: row.resource, actions: next });
      else await authz.deleteDefaultAccess(row.resource);
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
        <div className='flex min-h-[60vh] gap-3'>
          <nav
            aria-label={t('editors.resourceGroup')}
            className='w-40 shrink-0 space-y-1 rounded-lg border bg-card p-2'
          >
            {sections.map((type) => (
              <button
                key={type.key}
                aria-current={
                  type.key === resourceType?.key ? 'page' : undefined
                }
                className='flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary aria-[current=page]:font-medium'
                onClick={() => {
                  setParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set('type', type.key);
                      next.delete('group');
                      next.delete('page');
                      return next;
                    },
                    { replace: true },
                  );
                }}
              >
                <span>{type.label}</span>
                <span className='text-xs text-muted-foreground'>
                  {type.resources.length}
                </span>
              </button>
            ))}
          </nav>
          <div className='min-w-0 flex-1 space-y-3'>
            <FilterBar>
              <SearchField
                label={t('permissionSets.picker.searchResources')}
                placeholder={t('permissionSets.picker.searchResources')}
                value={search}
                onChange={(value) => filter('search', value)}
              />
              {resourceType?.groups?.length ? (
                <SelectField
                  aria-label={t('defaultAccess.groupFilter')}
                  className='h-9 max-w-64 rounded-md border bg-background px-3 text-sm'
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
            <ManagementTable>
              <div className='max-h-[65vh] overflow-auto'>
                <Table className='min-w-[36rem] table-fixed'>
                  <TableHeader className='sticky top-0 z-10 bg-background'>
                    <TableRow>
                      <TableHead className='w-[32%] px-5 py-3'>
                        {t('common.resource')}
                      </TableHead>
                      {resourceType?.value === 'resource' ? (
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
                      const grouped =
                        path !== resourceType?.label &&
                        path !== resourceType?.value;
                      return (
                        <Fragment key={path}>
                          {grouped ? (
                            <TableRow className='bg-muted/40'>
                              <TableCell
                                colSpan={
                                  resourceType?.value === 'resource'
                                    ? 2
                                    : actions.length + 1
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
                                  {row.resource.type === 'resource' ? (
                                    <TableCell className='px-2 py-2'>
                                      <div className='flex flex-wrap gap-x-3 gap-y-1'>
                                        {options.resourceTypes
                                          .find(
                                            (type) =>
                                              type.value === row.resource.type,
                                          )
                                          ?.resources.find(
                                            (item) =>
                                              item.value === row.resource.id,
                                          )
                                          ?.actions?.map((action) => {
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
                                                  busy ||
                                                  !loaded ||
                                                  !allowed.configure
                                                }
                                                onClick={() => edit(row)}
                                                className='inline-flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-left text-sm hover:bg-muted'
                                              >
                                                <ScopeMark
                                                  value={
                                                    !scopes.length
                                                      ? 'none'
                                                      : scopes.every(
                                                            (item) =>
                                                              item.scope
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
                                      const type = options.resourceTypes.find(
                                        (item) =>
                                          item.value === row.resource.type,
                                      );
                                      const supported = (
                                        type?.resources.find(
                                          (item) =>
                                            item.value === row.resource.id,
                                        )?.actions ??
                                        type?.actions ??
                                        []
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
                                          {row.resource.type === 'resource' &&
                                          supported ? (
                                            <button
                                              type='button'
                                              aria-label={`${row.label}: ${action.label}`}
                                              disabled={
                                                busy ||
                                                !loaded ||
                                                !allowed.configure
                                              }
                                              onClick={() => edit(row)}
                                              className='inline-flex items-center gap-1 rounded-md border bg-muted/30 p-1 hover:bg-muted'
                                            >
                                              <ScopeMark
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
                                              {type?.resources
                                                .find(
                                                  (item) =>
                                                    item.value ===
                                                    row.resource.id,
                                                )
                                                ?.ruleScopes?.filter(
                                                  (scope) =>
                                                    scope.action ===
                                                    action.value,
                                                ).length ?? 0}
                                            </button>
                                          ) : supported || current ? (
                                            <DefaultScopeControl
                                              label={`${row.label}: ${action.label}`}
                                              scope={current?.scope}
                                              options={options}
                                              disabled={
                                                busy ||
                                                !loaded ||
                                                !allowed.configure
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
                        colSpan={
                          resourceType?.value === 'resource'
                            ? 2
                            : actions.length + 1
                        }
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
                    <ScopeMark value={mark} label={label} legend />
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
          description={`${resourcePath(options, draft)} · ${t('defaultAccess.editorDescription')}`}
          dirty={dirty}
          busy={busy}
          onClose={close}
        >
          <fieldset
            disabled={!allowed.configure}
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
                      !allowed.configure ||
                      !rows.find((row) => row.key === draft.key)?.actions.length
                    }
                    onClick={() => setConfirmClear(true)}
                  >
                    {t('ruleWorkspace.clearDefaults')}
                  </Button>
                  <Button
                    disabled={busy || !dirty || !allowed.configure}
                    onClick={() => void save()}
                  >
                    {t('defaultAccess.save')}
                  </Button>
                </>
              }
            >
              {error ? <ErrorBox value={error} /> : null}
              {draft.resource.type === 'resource' ? (
                <BusinessRuleScopes
                  options={options}
                  resourceId={draft.resource.id}
                  value={draft.actions}
                  onChange={(actions) => setDraft({ ...draft, actions })}
                  loadRecords={loadBusinessRecords}
                />
              ) : (
                actions
                  .filter((action) => {
                    const type = options.resourceTypes.find(
                      (item) => item.value === draft.resource.type,
                    );
                    return (
                      (
                        type?.resources.find(
                          (item) => item.value === draft.resource.id,
                        )?.actions ??
                        type?.actions ??
                        []
                      ).some((item) => item.value === action.value) ||
                      draft.actions.some((item) => item.action === action.value)
                    );
                  })
                  .map((action) => {
                    const current = draft.actions.find(
                      (item) => item.action === action.value,
                    );
                    const change = (scope?: AccessScope) =>
                      setDraft({
                        ...draft,
                        actions: scope
                          ? current
                            ? draft.actions.map((item) =>
                                item.action === action.value
                                  ? { ...item, scope }
                                  : item,
                              )
                            : [
                                ...draft.actions,
                                { action: action.value, scope },
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
                            className='h-9 min-w-48 rounded-md border bg-background px-3 text-sm font-normal'
                            value={
                              !current
                                ? 'unset'
                                : current.scope.type === 'all'
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
                                        type: 'database',
                                        recordAccess:
                                          options.recordAccessPolicies.find(
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
                        {current && current.scope.type !== 'all' ? (
                          <ScopeEditor
                            options={options}
                            fields={
                              options.collections.find(
                                (item) => item.name === draft.resource.id,
                              )?.fields
                            }
                            records={records}
                            value={current.scope}
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
function scopeLabel(
  t: Translate,
  scope: AccessScope,
  options: AuthorizationOptions,
): string {
  if (scope.type === 'all') return t('labels.allRecords');
  if (scope.type === 'ids')
    return t('labels.selectedRecords', { count: scope.ids.length });
  if (scope.type === 'database') {
    const key =
      typeof scope.recordAccess === 'string'
        ? scope.recordAccess
        : scope.recordAccess.key;
    return (
      options.recordAccessPolicies.find((item) => item.value === key)?.label ??
      key
    );
  }
  return t('labels.unknownScope');
}

function resourcePath(options: AuthorizationOptions, row: Row): string {
  const type = options.resourceTypes.find(
    (item) => item.value === row.resource.type,
  );
  const groupId = type?.resources.find(
    (item) => item.value === row.resource.id,
  )?.group;
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
  return [
    ...(row.resource.type === 'resource'
      ? []
      : [type?.label ?? row.resource.type]),
    ...(find(type?.groups ?? [], []) ?? []),
  ].join(' / ');
}

function DefaultScopeControl({
  label,
  scope,
  options,
  disabled,
  onChange,
}: {
  label: string;
  scope?: AccessScope;
  options: AuthorizationOptions;
  disabled: boolean;
  onChange: (mode: string) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const mode = !scope ? 'unset' : scope.type === 'all' ? 'all' : 'custom';
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
        title={scope ? scopeLabel(t, scope, options) : selected.label}
        className='inline-flex cursor-pointer items-center gap-1 rounded-md border bg-muted/30 p-1 hover:bg-muted disabled:opacity-50'
      >
        <ScopeMark value={selected.mark} label={selected.label} />
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
                <ScopeMark value={item.mark} label={item.label} />
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const loadBusinessRecords = (collection: string) =>
  authz.listDefaultAccessRecords(collection);
