import { resourceSections } from '../../components/resource-sections.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ArrowLeft, X } from 'lucide-react';
import type {
  AuthorizationOptions,
  ResourceOption,
} from '../../authorization-client.js';
import { ConfirmDialog } from '../../components/confirm-dialog.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { defaultDatabaseActionDraft, resourceKey } from './drafts.js';
import { actionMark, collectionFields } from './labels.js';
import './database-presentation.js';
import { ScopeMark } from '../../components/scope-marks.js';
import { RecordAccessEditor } from './database-policy.js';
import { FieldMatrix } from './field-matrix.js';
import { ResourceTypeList } from './resource-tree.js';
import { ModulePermissions } from './module-permissions.js';
import { resourceRows } from './resource-groups.js';
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
  const [type, setType] = useState(
    () => resourceSections(options)[0]?.value ?? '',
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [customizing, setCustomizing] = useState(false);
  const [businessGroup, setBusinessGroup] = useState(
    () =>
      resourceSections(options).find((section) => section.value === 'resource')
        ?.key ?? '',
  );
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
      (type !== 'resource' || !businessGroup || item.group === businessGroup) &&
      (!configuredOnly ||
        Boolean(current.get(resourceKey(type, item.value))?.actions.length)) &&
      (!query || `${item.label} ${item.value}`.toLowerCase().includes(query)),
  );
  const rows = resourceRows(
    type === 'resource' ? [] : (resourceType?.groups ?? []),
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
    setCustomizing(
      mode === 'custom' &&
        (active?.action === action || grant.actions.includes(action)),
    );
    if (mode === 'custom') {
      setActive({ grant, action });
      return;
    }
    const scoped = resources.find((item) => item.value === grant.resource.id)
      ?.actionScopes?.[action];
    const next = {
      ...grant,
      actions:
        mode === 'none'
          ? grant.actions.filter((item) => item !== action)
          : [...new Set([...grant.actions, action])],
    };
    if (
      grant.resource.type === 'database.collection' &&
      !scoped &&
      mode === 'all'
    )
      next.database = {
        ...grant.database,
        [action]: { input: '*', output: '*', recordAccess: 'allRecords' },
      };
    if (scoped && mode !== 'none' && !next.policies?.[action])
      next.policies = {
        ...next.policies,
        [action]: {
          type: scoped.policyType,
          ...Object.fromEntries(
            scoped.fields.map((field) => [field.key, field.defaultValue]),
          ),
        },
      };
    update(next);
    setActive(
      grant.resource.type === 'database.collection' && !scoped
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
            <>
              <div
                ref={configurationRef}
                className='relative isolate flex min-h-0 flex-1 overflow-hidden'
              >
                <aside className='w-44 shrink-0 overflow-auto border-r bg-muted/15 xl:w-52'>
                  <ResourceTypeList
                    label={t('permissionSets.picker.resourceTypes')}
                    types={resourceSections(options).map((section) => ({
                      ...section,
                      value: section.key,
                      resourceType: section.value,
                    }))}
                    grants={draft.grants}
                    type={type === 'resource' ? businessGroup : type}
                    onSelect={(key) => {
                      const section = resourceSections(options).find(
                        (item) => item.key === key,
                      )!;
                      setType(section.value);
                      setBusinessGroup(section.key);
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
                        onCheckedChange={(checked) =>
                          setConfiguredOnly(checked)
                        }
                      />
                      {t('permissionWorkspace.configuredOnly')}
                    </label>
                  </div>
                  <div className='flex shrink-0 items-center justify-between gap-3 px-4 py-2'>
                    <p className='text-xs text-muted-foreground'>
                      {t(
                        type === 'page'
                          ? 'permissionWorkspace.pageAccessHint'
                          : 'permissionWorkspace.clickScope',
                      )}
                    </p>
                  </div>
                  <div className='min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]'>
                    {
                      <ModulePermissions
                        container={configurationRef}
                        type={type}
                        label={
                          type === 'resource'
                            ? (options.resourceGroups?.find(
                                (group) => group.value === businessGroup,
                              )?.label ?? type)
                            : (resourceType?.label ?? type)
                        }
                        rows={rows.slice(0, limit)}
                        items={visible}
                        actions={actions}
                        draft={draft}
                        disabled={busy || readOnly}
                        filtered={Boolean(query) || configuredOnly}
                        collapsed={query ? new Set() : collapsed}
                        onCollapse={(id) =>
                          setCollapsed((previous) => {
                            const next = new Set(previous);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                        onChange={onChange}
                        onToggle={choose}
                      />
                    }
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
                    {
                      <div className='flex flex-wrap gap-4 text-xs text-muted-foreground'>
                        {(['all', 'scoped', 'none'] as const).map((value) => {
                          const label = t(
                            value === 'all'
                              ? 'permissionWorkspace.moduleGranted'
                              : value === 'scoped'
                                ? 'permissionWorkspace.modulePartial'
                                : 'permissionWorkspace.moduleNotGranted',
                          );
                          return (
                            <span
                              key={value}
                              className='flex items-center gap-2'
                            >
                              <ScopeMark value={value} legend label={label} />
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    }
                  </div>
                </section>
              </div>
            </>
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
      <Dialog.Root
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActive(undefined);
        }}
      >
        <Dialog.Portal container={configurationRef}>
          <Dialog.Popup className='absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l bg-white shadow-xl'>
            <header className='flex items-center justify-between border-b p-3'>
              <Dialog.Title>
                {resources.find((item) => item.value === selected?.resource.id)
                  ?.label ?? selected?.resource.id}{' '}
                ·{' '}
                {actions.find((item) => item.value === active?.action)?.label ??
                  active?.action}
              </Dialog.Title>
              <Dialog.Close aria-label={t('permissionWorkspace.backResources')}>
                <X className='size-4' />
              </Dialog.Close>
            </header>
            {selected && active ? (
              <>
                <div className='flex gap-2 border-b p-3'>
                  {['none', 'all', 'custom'].map((mode) => (
                    <button
                      type='button'
                      key={mode}
                      aria-pressed={
                        mode === 'custom'
                          ? customizing ||
                            actionMark(selected, active.action) === 'scoped'
                          : !customizing &&
                            actionMark(selected, active.action) ===
                              (mode === 'all' ? 'all' : 'none')
                      }
                      disabled={readOnly}
                      onClick={() => choose(selected, active.action, mode)}
                    >
                      {t(`permissionWorkspace.mode.${mode}`)}
                    </button>
                  ))}
                </div>
                {(customizing ||
                  actionMark(selected, active.action) === 'scoped') && (
                  <fieldset
                    disabled={readOnly}
                    className='space-y-5 overflow-auto p-4'
                  >
                    {active.action !== 'create' && (
                      <RecordAccessEditor
                        action={active.action}
                        fields={collectionFields(options, selected.resource.id)}
                        options={options}
                        value={
                          (
                            selected.database[active.action] ??
                            defaultDatabaseActionDraft(options)
                          ).recordAccess
                        }
                        onChange={(recordAccess) =>
                          update({
                            ...selected,
                            actions: [
                              ...new Set([...selected.actions, active.action]),
                            ],
                            database: {
                              ...selected.database,
                              [active.action]: {
                                ...(selected.database[active.action] ??
                                  defaultDatabaseActionDraft(options)),
                                recordAccess,
                              },
                            },
                          })
                        }
                      />
                    )}
                    {active.action !== 'delete' && (
                      <FieldMatrix
                        options={options}
                        grant={selected}
                        action={active.action}
                        onChange={(database) =>
                          update({
                            ...selected,
                            actions: [
                              ...new Set([...selected.actions, active.action]),
                            ],
                            database,
                          })
                        }
                      />
                    )}
                  </fieldset>
                )}
              </>
            ) : null}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
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
