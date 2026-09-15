import { useState, type ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import { ActionsEditor } from '../../components/editors.js';
import { SidePanel } from '../../components/management-ui.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { DatabasePolicyEditor } from './database-policy.js';
import {
  newGrantForResource,
  resourceKey,
  syncDatabaseActions,
} from './drafts.js';
import { resourceLabel, resourceTypeLabel } from './labels.js';
import type { GrantDraft } from './types.js';

export function PermissionResourcePicker({
  options,
  grants,
  onClose,
  onAdd,
}: {
  options: AuthorizationOptions;
  grants: readonly GrantDraft[];
  onClose: () => void;
  onAdd: (grants: readonly GrantDraft[]) => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [type, setType] = useState(options.resourceTypes[0]?.value ?? '');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<readonly GrantDraft[]>([]);
  const [active, setActive] = useState<string>();
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const query = search.trim().toLowerCase();
  const resources = (resourceType?.resources ?? []).filter(
    (resource) =>
      !query ||
      [resource.label, resource.value, resource.description].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );
  const existing = new Set(
    grants.map((grant) => resourceKey(grant.resource.type, grant.resource.id)),
  );
  const activeGrant = pending.find(
    (grant) => resourceKey(grant.resource.type, grant.resource.id) === active,
  );
  const incomplete = pending.some((grant) => grant.actions.length === 0);

  function selectResource(resourceId: string): void {
    const key = resourceKey(type, resourceId);
    if (existing.has(key)) return;
    setPending((items) =>
      items.some(
        (item) => resourceKey(item.resource.type, item.resource.id) === key,
      )
        ? items
        : [...items, newGrantForResource(type, resourceId)],
    );
    setActive(key);
  }

  function toggleResource(resourceId: string, checked: boolean): void {
    const key = resourceKey(type, resourceId);
    if (checked) {
      selectResource(resourceId);
      return;
    }
    setPending((items) =>
      items.filter(
        (item) => resourceKey(item.resource.type, item.resource.id) !== key,
      ),
    );
    if (active === key) setActive(undefined);
  }

  function updateActive(change: Partial<GrantDraft>): void {
    if (!activeGrant) return;
    const key = resourceKey(activeGrant.resource.type, activeGrant.resource.id);
    setPending((items) =>
      items.map((item) =>
        resourceKey(item.resource.type, item.resource.id) === key
          ? { ...item, ...change }
          : item,
      ),
    );
  }

  return (
    <SidePanel
      title={t('permissionSets.picker.title')}
      description={t('permissionSets.picker.description')}
      onClose={onClose}
      wide
    >
      <div className='overflow-hidden rounded-xl border bg-card'>
        <div className='grid min-h-[34rem] grid-cols-[13rem_18rem_minmax(0,1fr)]'>
          <nav
            className='border-r bg-muted/20 py-3'
            aria-label={t('permissionSets.picker.resourceTypes')}
          >
            <p className='px-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('permissionSets.picker.resourceTypes')}
            </p>
            {options.resourceTypes.map((item) => {
              const count = pending.filter(
                (grant) => grant.resource.type === item.value,
              ).length;
              return (
                <button
                  className={`flex w-full items-center justify-between border-l-2 px-4 py-2.5 text-left text-sm ${item.value === type ? 'border-primary bg-background font-medium text-foreground' : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
                  key={item.value}
                  type='button'
                  onClick={() => {
                    setType(item.value);
                    setSearch('');
                    const first = pending.find(
                      (grant) => grant.resource.type === item.value,
                    );
                    setActive(
                      first
                        ? resourceKey(first.resource.type, first.resource.id)
                        : undefined,
                    );
                  }}
                >
                  <span>{item.label}</span>
                  {count > 0 ? (
                    <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <section className='border-r'>
            <div className='space-y-3 border-b p-3'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {resourceType?.label ?? t('permissionSets.picker.resources')}
                </h3>
                <p className='text-xs text-muted-foreground'>
                  {t('permissionSets.picker.selectResourceHint')}
                </p>
              </div>
              <Input
                placeholder={t('permissionSets.picker.searchResources')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className='divide-y overflow-y-auto'>
              {resources.map((resource) => {
                const key = resourceKey(type, resource.value);
                const disabled = existing.has(key);
                const selected = pending.some(
                  (grant) =>
                    resourceKey(grant.resource.type, grant.resource.id) === key,
                );
                return (
                  <button
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left ${active === key ? 'bg-primary/5' : 'hover:bg-muted/20'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={disabled}
                    key={resource.value}
                    type='button'
                    onClick={() => selectResource(resource.value)}
                  >
                    <input
                      className='mt-0.5'
                      type='checkbox'
                      checked={disabled || selected}
                      disabled={disabled}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        toggleResource(resource.value, event.target.checked)
                      }
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-center gap-2'>
                        <span className='truncate text-sm font-medium'>
                          {resource.label}
                        </span>
                        {disabled ? (
                          <span className='rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground'>
                            {t('permissionSets.picker.added')}
                          </span>
                        ) : null}
                      </span>
                      <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                        {resource.value}
                      </span>
                      {resource.description ? (
                        <span className='mt-1 line-clamp-2 block text-xs text-muted-foreground'>
                          {resource.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {resources.length === 0 ? (
                <p className='px-4 py-10 text-center text-sm text-muted-foreground'>
                  {t('permissionSets.picker.noResources')}
                </p>
              ) : null}
            </div>
          </section>

          <section className='min-w-0 p-5'>
            {activeGrant ? (
              <div className='space-y-5'>
                <div className='border-b pb-4'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {resourceTypeLabel(options, activeGrant.resource.type)}
                  </p>
                  <h3 className='mt-1 text-lg font-semibold'>
                    {resourceLabel(options, activeGrant.resource)}
                  </h3>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {activeGrant.resource.id}
                  </p>
                </div>
                <ActionsEditor
                  options={options}
                  resourceType={activeGrant.resource.type}
                  resourceId={activeGrant.resource.id}
                  value={activeGrant.actions}
                  onChange={(actions) =>
                    updateActive({
                      actions,
                      database: syncDatabaseActions(
                        options,
                        activeGrant.database,
                        actions,
                      ),
                    })
                  }
                />
                {activeGrant.resource.type === 'database.collection' ? (
                  <DatabasePolicyEditor
                    options={options}
                    grant={activeGrant}
                    onChange={(database) => updateActive({ database })}
                  />
                ) : null}
              </div>
            ) : (
              <div className='flex h-full items-center justify-center text-center'>
                <div className='max-w-xs'>
                  <p className='text-sm font-medium'>
                    {t('permissionSets.picker.emptyTitle')}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {t('permissionSets.picker.emptyHint')}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        <div className='flex items-center justify-between border-t bg-background px-4 py-3'>
          <p className='text-sm text-muted-foreground'>
            {t(
              `permissionSets.picker.readyCount.${pending.length === 1 ? 'one' : 'other'}`,
              { count: pending.length },
            )}
            {incomplete ? t('permissionSets.picker.incomplete') : ''}
          </p>
          <div className='flex gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type='button'
              disabled={pending.length === 0 || incomplete}
              onClick={() => onAdd(pending)}
            >
              {t('permissionSets.picker.add')}
            </Button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
