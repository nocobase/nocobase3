import { Checkbox } from '../../components/ui/checkbox.js';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ArrowLeft, ChevronDown, ChevronRight, X } from 'lucide-react';
import type {
  AuthorizationOptions,
  ResourceOption,
} from '../../authorization-client.js';
import { ConfirmDialog } from '../../components/confirm-dialog.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import {
  defaultDatabaseActionDraft,
  newGrantForResource,
  resourceKey,
} from './drafts.js';
import { actionMark, collectionFields } from './labels.js';
import './database-presentation.js';
import { ScopeMark, ScopeLegend } from '../../components/scope-marks.js';
import { RecordAccessEditor } from './database-policy.js';
import { FieldMatrix } from './field-matrix.js';
import { ResourceTypeList } from './resource-tree.js';
import { BulkPermissionToggle } from './bulk-permissions.js';
import { descendantGroups, resourceRows } from './resource-groups.js';
import type { Draft, GrantDraft } from './types.js';

export function PermissionSetEditor({
  options,
  draft,
  busy,
  error,
  onChange,
  onSave,
  onClose,
  embedded = false,
  readOnly = false,
  showDetails = false,
}: {
  embedded?: boolean;
  showDetails?: boolean;
  readOnly?: boolean;
  options: AuthorizationOptions;
  draft: Draft;
  busy: boolean;
  error?: string;
  onChange: (value: Draft) => void;
  onSave: (event: FormEvent) => Promise<void>;
  onClose: () => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const configurationRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => JSON.stringify(draft));
  const [type, setType] = useState(options.resourceTypes[0]?.value ?? '');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [customizing, setCustomizing] = useState(false);
  const [search, setSearch] = useState('');
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [active, setActive] = useState<{ grant: GrantDraft; action: string }>();
  const [selectedTab, setSelectedTab] = useState(
    draft.originalKey ? 'permissions' : 'details',
  );
  const tab = embedded
    ? showDetails || !draft.originalKey
      ? 'details'
      : 'permissions'
    : selectedTab;
  const [confirmClose, setConfirmClose] = useState(false);
  const [limit, setLimit] = useState(80);
  const dirty = initial !== JSON.stringify(draft);
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const current = new Map(
    draft.grants.map((item) => [
      resourceKey(item.resource.type, item.resource.id),
      item,
    ]),
  );
  const selected =
    active &&
    (current.get(
      resourceKey(active.grant.resource.type, active.grant.resource.id),
    ) ??
      active.grant);
  const known = resourceType?.resources ?? [];
  const resources: readonly ResourceOption[] = [
    ...known,
    ...draft.grants
      .filter(
        (item) =>
          item.resource.type === type &&
          !known.some((knownItem) => knownItem.value === item.resource.id),
      )
      .map((item) => ({ value: item.resource.id, label: item.resource.id })),
  ];
  const query = search.trim().toLowerCase();
  const visible = resources.filter(
    (item) =>
      (!configuredOnly ||
        Boolean(current.get(resourceKey(type, item.value))?.actions.length)) &&
      (!query || `${item.label} ${item.value}`.toLowerCase().includes(query)),
  );
  const rows = resourceRows(
    resourceType?.groups ?? [],
    visible,
    query ? new Set() : collapsed,
  );
  const actions = resourceType?.actions ?? [];
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  function close(): void {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }
  function update(grant: GrantDraft): void {
    if (readOnly) return;
    const key = resourceKey(grant.resource.type, grant.resource.id);
    const existing = draft.grants.some(
      (item) => resourceKey(item.resource.type, item.resource.id) === key,
    );
    const grants = existing
      ? draft.grants.map((item) =>
          resourceKey(item.resource.type, item.resource.id) === key
            ? grant
            : item,
        )
      : [...draft.grants, grant];
    onChange({
      ...draft,
      grants: grants.filter((item) => item.actions.length > 0),
    });
    if (
      active &&
      resourceKey(active.grant.resource.type, active.grant.resource.id) === key
    )
      setActive({ ...active, grant });
  }
  function choose(grant: GrantDraft, action: string, mode: string): void {
    if (readOnly) return;
    setCustomizing(mode === 'custom');
    if (mode === 'custom') {
      setActive({ grant, action });
      return;
    }
    const next = {
      ...grant,
      actions:
        mode === 'none'
          ? grant.actions.filter((item) => item !== action)
          : [...new Set([...grant.actions, action])],
    };
    if (grant.resource.type === 'database.collection' && mode === 'all')
      next.database = {
        ...grant.database,
        [action]: { input: '*', output: '*', recordAccess: 'allRecords' },
      };
    update(next);
    setActive(
      grant.resource.type === 'database.collection'
        ? { grant: next, action }
        : undefined,
    );
  }
  return (
    <>
      <form
        className={`flex flex-col overflow-hidden bg-background ${embedded ? 'min-h-0 flex-1' : 'h-[calc(100dvh-6rem)] min-h-80'}`}
        onSubmit={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          if (!draft.title.trim() || !draft.key.trim())
            setSelectedTab('details');
          void onSave(event);
        }}
      >
        {!embedded ? (
          <header className='flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3'>
            <div className='flex min-w-0 items-center gap-2'>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={t('common.cancel')}
                onClick={close}
              >
                <ArrowLeft className='size-4' />
              </Button>
              <h1 className='truncate text-lg font-semibold'>
                {draft.title || t('permissionSets.editor.newTitle')}
              </h1>
            </div>
            <div className='flex items-center gap-2'>
              <span className='hidden text-xs text-muted-foreground sm:block'>
                {dirty
                  ? t('permissionWorkspace.unsaved')
                  : t('permissionWorkspace.saved')}
              </span>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={close}
              >
                {t('common.cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {t(
                  busy
                    ? 'permissionSets.editor.saving'
                    : 'permissionSets.editor.save',
                )}
              </Button>
            </div>
          </header>
        ) : null}
        {!embedded ? (
          <nav
            className='flex shrink-0 gap-6 border-b px-5'
            aria-label={t('permissionWorkspace.sections')}
          >
            {['permissions', 'details'].map((item) => (
              <button
                className={`border-b-2 py-3 text-sm ${tab === item ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}
                type='button'
                aria-current={tab === item ? 'page' : undefined}
                key={item}
                onClick={() => setSelectedTab(item)}
              >
                {t(`permissionWorkspace.${item}`)}
              </button>
            ))}
          </nav>
        ) : null}
        {error ? (
          <p
            role='alert'
            className='shrink-0 border-b bg-destructive/5 px-5 py-2 text-sm text-destructive'
          >
            {error}
          </p>
        ) : null}
        <fieldset
          disabled={busy}
          className='flex min-h-0 min-w-0 flex-1 flex-col'
        >
          {tab === 'details' ? (
            <div className='min-h-0 flex-1 overflow-auto p-6'>
              <div className='max-w-xl space-y-5'>
                <label className='block space-y-2 text-sm'>
                  {t('permissionSets.editor.name')}
                  <Input
                    disabled={readOnly}
                    value={draft.title}
                    onChange={(event) =>
                      onChange({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                <label className='block space-y-2 text-sm'>
                  {t('common.key')}
                  <Input
                    disabled={readOnly || Boolean(draft.originalKey)}
                    value={draft.key}
                    onChange={(event) =>
                      onChange({ ...draft, key: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
          ) : (
            <div
              ref={configurationRef}
              className='relative isolate flex min-h-0 flex-1 overflow-hidden'
            >
              <aside className='w-44 shrink-0 overflow-auto border-r bg-muted/15 xl:w-52'>
                <ResourceTypeList
                  label={t('permissionSets.picker.resourceTypes')}
                  types={options.resourceTypes}
                  grants={draft.grants}
                  type={type}
                  onSelect={(next) => {
                    setType(next);
                    setCollapsed(new Set());
                    setSearch('');
                    setLimit(80);
                    setActive(undefined);
                  }}
                />
              </aside>
              <section
                className='flex min-h-0 min-w-0 flex-1 flex-col'
                aria-label={t('permissionSets.picker.resources')}
              >
                <div className='flex shrink-0 flex-wrap items-center gap-3 border-b p-3'>
                  <Input
                    className='min-w-32 flex-1'
                    aria-label={t('permissionSets.picker.searchResources')}
                    placeholder={t('permissionSets.picker.searchResources')}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setLimit(80);
                    }}
                  />
                  <label className='flex items-center gap-2 text-xs text-muted-foreground'>
                    <Checkbox
                      checked={configuredOnly}
                      onCheckedChange={(checked) => setConfiguredOnly(checked)}
                    />
                    {t('permissionWorkspace.configuredOnly')}
                  </label>
                </div>
                <div className='flex shrink-0 items-center justify-between gap-3 px-4 py-2'>
                  <p className='text-xs text-muted-foreground'>
                    {t('permissionWorkspace.clickScope')}
                  </p>
                </div>
                <div className='min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]'>
                  <table
                    className='w-full table-fixed text-sm'
                    style={{ minWidth: `${20 + actions.length * 8}rem` }}
                  >
                    <colgroup>
                      <col />
                      {actions.map((action) => (
                        <col key={action.value} style={{ width: '8rem' }} />
                      ))}
                    </colgroup>
                    <thead className='sticky top-0 z-10 bg-background'>
                      <tr className='border-b'>
                        <th className='min-w-40 px-4 py-3 text-left font-medium'>
                          {resourceType?.label}
                        </th>
                        {actions.map((action) => (
                          <th
                            className='min-w-32 px-2 py-3 text-center font-medium'
                            key={action.value}
                          >
                            {type !== 'database.collection' ? (
                              <span className='relative inline-flex'>
                                <span className='absolute right-full top-1/2 mr-1 -translate-y-1/2 whitespace-nowrap'>
                                  {action.label}
                                </span>
                                <BulkPermissionToggle
                                  items={visible}
                                  actions={[action]}
                                  type={type}
                                  draft={draft}
                                  disabled={busy || readOnly}
                                  label={`${action.label}: ${t(query || configuredOnly ? 'permissionWorkspace.selectFiltered' : 'permissionWorkspace.selectAll')}`}
                                  onChange={onChange}
                                />
                              </span>
                            ) : (
                              action.label
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, limit).map((row) => {
                        if (row.kind === 'group')
                          return (
                            <tr
                              key={`group:${row.group.value}`}
                              className='border-b bg-muted/20'
                            >
                              <td
                                colSpan={
                                  type === 'database.collection'
                                    ? actions.length + 1
                                    : 1
                                }
                              >
                                <div className='flex items-center gap-3 pr-4'>
                                  <button
                                    type='button'
                                    aria-expanded={
                                      query
                                        ? true
                                        : !collapsed.has(row.group.value)
                                    }
                                    className='flex min-w-0 flex-1 items-center gap-2 py-2 pr-4 text-left text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                                    style={{ paddingLeft: 16 + row.depth * 20 }}
                                    onClick={() =>
                                      setCollapsed((previous) => {
                                        const next = new Set(previous);
                                        if (next.has(row.group.value))
                                          next.delete(row.group.value);
                                        else next.add(row.group.value);
                                        return next;
                                      })
                                    }
                                  >
                                    {!query &&
                                    collapsed.has(row.group.value) ? (
                                      <ChevronRight className='size-4' />
                                    ) : (
                                      <ChevronDown className='size-4' />
                                    )}
                                    {row.group.label}
                                  </button>
                                </div>
                              </td>
                              {type !== 'database.collection'
                                ? actions.map((action) => (
                                    <td
                                      key={action.value}
                                      className='px-2 py-1.5 text-center'
                                    >
                                      <BulkPermissionToggle
                                        items={visible.filter(
                                          (item) =>
                                            item.group &&
                                            descendantGroups(
                                              [row.group],
                                              row.group.value,
                                            ).includes(item.group),
                                        )}
                                        actions={[action]}
                                        type={type}
                                        draft={draft}
                                        disabled={busy || readOnly}
                                        label={`${action.label}: ${t('permissionWorkspace.selectGroup', { group: row.group.label })}`}
                                        onChange={onChange}
                                      />
                                    </td>
                                  ))
                                : null}
                            </tr>
                          );
                        const item = row.item;
                        const grant =
                          current.get(resourceKey(type, item.value)) ??
                          newGrantForResource(type, item.value);
                        return (
                          <tr
                            className='border-b hover:bg-muted/20'
                            key={`item:${item.value}`}
                          >
                            <td
                              className='py-1.5 pr-4'
                              style={{ paddingLeft: 16 + row.depth * 20 }}
                            >
                              <div className='flex min-w-0 items-center gap-2 whitespace-nowrap'>
                                <span
                                  className='truncate font-medium'
                                  title={item.label}
                                >
                                  {item.label}
                                </span>
                                <span
                                  className='truncate text-xs text-muted-foreground'
                                  title={item.value}
                                >
                                  {item.value}
                                </span>
                              </div>
                            </td>
                            {actions.map((action) => (
                              <td
                                className='px-2 py-1.5 text-center'
                                key={action.value}
                              >
                                {item.actions &&
                                !item.actions.some(
                                  (candidate) =>
                                    candidate.value === action.value,
                                ) ? null : type !== 'database.collection' ? (
                                  <button
                                    type='button'
                                    disabled={readOnly}
                                    className='inline-flex rounded-md p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                                    aria-label={`${item.label}: ${action.label}`}
                                    aria-pressed={grant.actions.includes(
                                      action.value,
                                    )}
                                    title={t(
                                      grant.actions.includes(action.value)
                                        ? 'permissionWorkspace.revokeAccess'
                                        : 'permissionWorkspace.grantAccess',
                                    )}
                                    onClick={() =>
                                      choose(
                                        grant,
                                        action.value,
                                        grant.actions.includes(action.value)
                                          ? 'none'
                                          : 'all',
                                      )
                                    }
                                  >
                                    <ScopeMark
                                      value={actionMark(grant, action.value)}
                                    />
                                  </button>
                                ) : (
                                  <Dialog.Root
                                    modal={false}
                                    onOpenChange={(open) => {
                                      setCustomizing(false);
                                      setActive(
                                        open
                                          ? { grant, action: action.value }
                                          : undefined,
                                      );
                                    }}
                                  >
                                    <Dialog.Trigger
                                      className='inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-muted/30 p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                                      aria-label={`${item.label}: ${action.label}`}
                                    >
                                      <ScopeMark
                                        value={actionMark(grant, action.value)}
                                      />
                                      <ChevronDown className='size-3 text-muted-foreground' />
                                    </Dialog.Trigger>
                                    <Dialog.Portal container={configurationRef}>
                                      <Dialog.Popup className='absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col overflow-hidden border-l bg-background text-left text-foreground shadow-xl'>
                                        <header className='flex shrink-0 items-center justify-between gap-3 border-b p-3'>
                                          <Dialog.Title className='text-sm font-semibold'>
                                            {item.label} · {action.label}
                                          </Dialog.Title>
                                          <Dialog.Close
                                            className='rounded-md p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
                                            aria-label={t(
                                              'permissionWorkspace.backResources',
                                            )}
                                          >
                                            <X className='size-4' />
                                          </Dialog.Close>
                                        </header>
                                        <div
                                          className='flex shrink-0 gap-1 border-b p-3'
                                          role='group'
                                          aria-label={t(
                                            'permissionWorkspace.configureScope',
                                          )}
                                        >
                                          {['none', 'all', 'custom'].map(
                                            (mode) => {
                                              const mark = actionMark(
                                                grant,
                                                action.value,
                                              );
                                              const currentMode =
                                                customizing || mark === 'scoped'
                                                  ? 'custom'
                                                  : mark;
                                              return (
                                                <button
                                                  key={mode}
                                                  disabled={readOnly}
                                                  type='button'
                                                  aria-pressed={
                                                    currentMode === mode
                                                  }
                                                  className='flex-1 rounded-md px-2 py-2 text-sm hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:font-medium aria-pressed:text-primary focus-visible:ring-2 focus-visible:ring-ring'
                                                  onClick={() =>
                                                    choose(
                                                      grant,
                                                      action.value,
                                                      mode,
                                                    )
                                                  }
                                                >
                                                  {t(
                                                    `permissionWorkspace.mode.${mode}`,
                                                  )}
                                                </button>
                                              );
                                            },
                                          )}
                                        </div>
                                        {selected &&
                                        active &&
                                        (customizing ||
                                          actionMark(grant, action.value) ===
                                            'scoped') ? (
                                          <fieldset
                                            disabled={readOnly}
                                            className='min-h-0 flex-1 space-y-5 overflow-y-auto p-4'
                                          >
                                            {active.action !== 'create' ? (
                                              <RecordAccessEditor
                                                action={active.action}
                                                fields={collectionFields(
                                                  options,
                                                  selected.resource.id,
                                                )}
                                                options={options}
                                                value={
                                                  (
                                                    selected.database[
                                                      active.action
                                                    ] ??
                                                    defaultDatabaseActionDraft(
                                                      options,
                                                    )
                                                  ).recordAccess
                                                }
                                                onChange={(recordAccess) =>
                                                  update({
                                                    ...selected,
                                                    actions: [
                                                      ...new Set([
                                                        ...selected.actions,
                                                        active.action,
                                                      ]),
                                                    ],
                                                    database: {
                                                      ...selected.database,
                                                      [active.action]: {
                                                        ...(selected.database[
                                                          active.action
                                                        ] ??
                                                          defaultDatabaseActionDraft(
                                                            options,
                                                          )),
                                                        recordAccess,
                                                      },
                                                    },
                                                  })
                                                }
                                              />
                                            ) : null}
                                            {active.action !== 'delete' ? (
                                              <FieldMatrix
                                                options={options}
                                                grant={selected}
                                                action={active.action}
                                                onChange={(database) =>
                                                  update({
                                                    ...selected,
                                                    actions: [
                                                      ...new Set([
                                                        ...selected.actions,
                                                        active.action,
                                                      ]),
                                                    ],
                                                    database,
                                                  })
                                                }
                                              />
                                            ) : null}
                                          </fieldset>
                                        ) : (
                                          <p className='p-4 text-sm text-muted-foreground'>
                                            {t(
                                              actionMark(
                                                grant,
                                                action.value,
                                              ) === 'all'
                                                ? 'permissionWorkspace.fullScopeHint'
                                                : 'permissionWorkspace.noScopeHint',
                                            )}
                                          </p>
                                        )}
                                      </Dialog.Popup>
                                    </Dialog.Portal>
                                  </Dialog.Root>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!visible.length ? (
                    <p className='p-6 text-sm text-muted-foreground'>
                      {t('permissionSets.picker.noResources')}
                    </p>
                  ) : null}
                  {rows.length > limit ? (
                    <Button
                      className='m-3'
                      type='button'
                      variant='outline'
                      onClick={() => setLimit(limit + 80)}
                    >
                      {t('permissionWorkspace.showMore')}
                    </Button>
                  ) : null}
                </div>
                <div className='shrink-0 border-t p-3'>
                  <ScopeLegend values={['all', 'scoped', 'none']} />
                </div>
              </section>
            </div>
          )}
        </fieldset>
        {embedded && !readOnly ? (
          <footer className='flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3'>
            {dirty ? (
              <span className='mr-auto text-xs text-muted-foreground'>
                {t('permissionWorkspace.unsaved')}
              </span>
            ) : null}
            <Button
              type='button'
              variant='ghost'
              disabled={busy || !dirty}
              onClick={close}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={busy || (!dirty && Boolean(draft.originalKey))}
            >
              {t(
                busy
                  ? 'permissionSets.editor.saving'
                  : 'permissionSets.editor.save',
              )}
            </Button>
          </footer>
        ) : null}
      </form>
      <ConfirmDialog
        open={confirmClose}
        title={t('permissionWorkspace.discardTitle')}
        confirmLabel={t('permissionWorkspace.discard')}
        onCancel={() => setConfirmClose(false)}
        onConfirm={onClose}
      >
        {t('permissionWorkspace.discardBody')}
      </ConfirmDialog>
    </>
  );
}
