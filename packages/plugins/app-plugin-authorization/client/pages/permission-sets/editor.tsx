import { useRef, useState, type FormEvent, type ReactElement } from 'react';
import { resourceSections } from '../../components/resource-sections.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import type {
  AuthorizationOptions,
  ResourceOption,
} from '../../authorization-client.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { resourceKey } from './drafts.js';
import { ScopeMark } from '../../components/scope-marks.js';
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
  dirty,
  readOnly = false,
  showDetails = false,
}: {
  dirty: boolean;
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
  const [type, setType] = useState(
    () => resourceSections(options)[0]?.value ?? '',
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [businessGroup, setBusinessGroup] = useState(
    () =>
      resourceSections(options).find((section) => section.value === 'resource')
        ?.key ?? '',
  );
  const [search, setSearch] = useState('');
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [limit, setLimit] = useState(80);
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const current = new Map(
    draft.grants.map((item) => [
      resourceKey(item.resource.type, item.resource.id),
      item,
    ]),
  );
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
      (!query ||
        `${item.label} ${item.searchText ?? ''} ${item.value}`
          .toLowerCase()
          .includes(query)),
  );
  const rows = resourceRows(
    type === 'resource' ? [] : (resourceType?.groups ?? []),
    visible,
    query ? new Set() : collapsed,
  );
  const actions = resourceType?.actions ?? [];
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
  }
  function choose(grant: GrantDraft, action: string, mode: string): void {
    if (readOnly) return;
    const scoped = resources.find((item) => item.value === grant.resource.id)
      ?.actionScopes?.[action];
    const next = {
      ...grant,
      actions:
        mode === 'none'
          ? grant.actions.filter((item) => item !== action)
          : [...new Set([...grant.actions, action])],
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
  }
  return (
    <>
      <form
        className='flex min-h-0 flex-1 flex-col overflow-hidden bg-background'
        onSubmit={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          void onSave(event);
        }}
      >
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
          {showDetails || !draft.originalKey ? (
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
        {!readOnly ? (
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
              onClick={onClose}
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
    </>
  );
}
