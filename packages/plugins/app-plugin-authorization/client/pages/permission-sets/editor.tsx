import { useState, type FormEvent, type ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import { ConfirmDialog } from '../../components/confirm-dialog.js';
import { ActionsEditor, Field } from '../../components/editors.js';
import {
  ClearFilterButton,
  FilterBar,
  FilterBarSpacer,
  SearchField,
} from '../../components/filters.js';
import { isUnknownPage } from '../../components/page-options.js';
import { SidePanel } from '../../components/management-ui.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation, type Translate } from '../../i18n.js';
import { DatabasePolicyEditor } from './database-policy.js';
import { syncDatabaseActions } from './drafts.js';
import {
  databaseAccessSummary,
  humanize,
  resourceLabel,
  resourceTypeLabel,
} from './labels.js';
import { PermissionResourcePicker } from './resource-picker.js';
import type { Draft, GrantDraft } from './types.js';

export function PermissionSetEditor({
  options,
  draft,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  options: AuthorizationOptions;
  draft: Draft;
  busy: boolean;
  onChange: (value: Draft) => void;
  onSave: (event: FormEvent) => Promise<void>;
  onClose: () => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceType, setResourceType] = useState('all');
  const [expanded, setExpanded] = useState<number>();
  // The grant a confirmed removal would drop, by its position in the draft.
  const [pendingRemoval, setPendingRemoval] = useState<number>();
  const query = resourceSearch.trim().toLowerCase();
  const visibleIndexes = draft.grants
    .map((grant, index) => ({ grant, index }))
    .filter(
      ({ grant }) =>
        (resourceType === 'all' || grant.resource.type === resourceType) &&
        (!query ||
          [
            grant.resource.id,
            resourceLabel(options, grant.resource),
            ...grant.actions,
          ].some((value) => value.toLowerCase().includes(query))),
    );

  function changeGrant(index: number, change: Partial<GrantDraft>): void {
    onChange({
      ...draft,
      grants: draft.grants.map((grant, current) =>
        current === index ? { ...grant, ...change } : grant,
      ),
    });
  }
  return (
    <SidePanel
      title={t(
        draft.originalKey
          ? 'permissionSets.editor.editTitle'
          : 'permissionSets.editor.newTitle',
      )}
      description={t('permissionSets.editor.description')}
      onClose={onClose}
      wide
    >
      <form className='space-y-6' onSubmit={(event) => void onSave(event)}>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={t('permissionSets.editor.name')}>
            <Input
              required
              value={draft.title}
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
            />
          </Field>
          <Field label={t('common.key')} hint={t('common.keyHint')}>
            <Input
              required
              disabled={Boolean(draft.originalKey)}
              value={draft.key}
              onChange={(event) =>
                onChange({ ...draft, key: event.target.value })
              }
            />
          </Field>
        </div>
        <div className='flex items-center justify-between border-t pt-5'>
          <div>
            <h3 className='font-medium'>
              {t('permissionSets.editor.permissions')}
            </h3>
            <p className='text-sm text-muted-foreground'>
              {t('permissionSets.editor.permissionsHint')}
            </p>
          </div>
          <Button
            size='sm'
            type='button'
            variant='outline'
            onClick={() => setPickerOpen(true)}
          >
            {t('permissionSets.editor.addPermission')}
          </Button>
        </div>
        <FilterBar>
          <SearchField
            className='sm:max-w-72'
            label={t('permissionSets.editor.searchResources')}
            placeholder={t('permissionSets.editor.searchResources')}
            value={resourceSearch}
            onChange={setResourceSearch}
          />
          <select
            aria-label={t('permissionSets.editor.resourceTypeLabel')}
            className='h-9 min-w-48 rounded-lg border bg-background px-3 text-sm'
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
          >
            <option value='all'>
              {t('permissionSets.editor.allResourceTypes')}
            </option>
            {options.resourceTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {query || resourceType !== 'all' ? (
            <ClearFilterButton
              onClear={() => {
                setResourceSearch('');
                setResourceType('all');
              }}
            />
          ) : null}
          <FilterBarSpacer />
          <span className='text-xs text-muted-foreground'>
            {t('permissionSets.editor.visibleCount', {
              visible: visibleIndexes.length,
              total: draft.grants.length,
            })}
          </span>
        </FilterBar>
        <div className='space-y-3'>
          {visibleIndexes.map(({ grant, index }) => (
            <section
              className='overflow-hidden rounded-lg border'
              key={grant.id}
            >
              <button
                className='flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/20'
                type='button'
                onClick={() =>
                  setExpanded(expanded === grant.id ? undefined : grant.id)
                }
              >
                <span className='min-w-0'>
                  <span className='flex items-center gap-2'>
                    <span className='truncate text-sm font-medium'>
                      {resourceLabel(options, grant.resource)}
                    </span>
                    <span className='rounded-md bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground'>
                      {resourceTypeLabel(options, grant.resource.type)}
                    </span>
                    {isUnknownPage(options, grant.resource) ? (
                      <span className='rounded-md bg-destructive/10 px-2 py-0.5 text-[0.6875rem] text-destructive'>
                        {t('permissionSets.unknownPage')}
                      </span>
                    ) : null}
                  </span>
                  <span className='mt-1 block truncate text-xs text-muted-foreground'>
                    {grant.resource.id} ·{' '}
                    {grant.actions.map(humanize).join(', ') ||
                      t('permissionSets.editor.noActions')}
                  </span>
                </span>
                <span className='flex shrink-0 items-center gap-3'>
                  {grant.resource.type === 'database.collection' ? (
                    <span className='hidden text-xs text-muted-foreground sm:inline'>
                      {databaseAccessSummary(t, options, grant)}
                    </span>
                  ) : null}
                  <span className='text-muted-foreground'>
                    {expanded === grant.id ? '−' : '+'}
                  </span>
                </span>
              </button>
              {expanded === grant.id ? (
                <div className='space-y-4 border-t p-4'>
                  {isUnknownPage(options, grant.resource) ? (
                    <p className='rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground'>
                      {t('permissionSets.editor.unknownPageNotice')}
                    </p>
                  ) : null}
                  <div className='flex justify-end'>
                    <Button
                      size='sm'
                      type='button'
                      variant='ghost'
                      onClick={() => setPendingRemoval(index)}
                    >
                      {t('common.remove')}
                    </Button>
                  </div>
                  <ActionsEditor
                    options={options}
                    resourceType={grant.resource.type}
                    resourceId={grant.resource.id}
                    value={grant.actions}
                    onChange={(actions) =>
                      changeGrant(index, {
                        actions,
                        database: syncDatabaseActions(
                          options,
                          grant.database,
                          actions,
                        ),
                      })
                    }
                  />
                  {grant.resource.type === 'database.collection' ? (
                    <DatabasePolicyEditor
                      options={options}
                      grant={grant}
                      onChange={(database) => changeGrant(index, { database })}
                    />
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
          {visibleIndexes.length === 0 && draft.grants.length > 0 ? (
            <p className='rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
              {t('permissionSets.editor.emptyFiltered')}
            </p>
          ) : null}
          {draft.grants.length === 0 ? (
            <button
              className='w-full rounded-lg border border-dashed px-5 py-10 text-center hover:border-primary/50 hover:bg-muted/20'
              type='button'
              onClick={() => setPickerOpen(true)}
            >
              <span className='block text-sm font-medium'>
                {t('permissionSets.editor.addFirst')}
              </span>
              <span className='mt-1 block text-xs text-muted-foreground'>
                {t('permissionSets.editor.addFirstHint')}
              </span>
            </button>
          ) : null}
        </div>
        <div className='sticky bottom-0 flex justify-end gap-2 border-t bg-background py-4'>
          <Button type='button' variant='outline' onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy} type='submit'>
            {busy
              ? t('permissionSets.editor.saving')
              : t('permissionSets.editor.save')}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        confirmLabel={t('permissionSets.editor.confirmRemove')}
        open={pendingRemoval !== undefined}
        title={t('permissionSets.editor.confirmRemoveTitle')}
        onCancel={() => setPendingRemoval(undefined)}
        onConfirm={() => {
          const index = pendingRemoval;
          setPendingRemoval(undefined);
          if (index === undefined) return;
          onChange({
            ...draft,
            grants: draft.grants.filter((_item, current) => current !== index),
          });
        }}
      >
        {t('permissionSets.editor.confirmRemoveBody', {
          resource: removalLabel(t, options, draft, pendingRemoval),
        })}
      </ConfirmDialog>
      {pickerOpen ? (
        <PermissionResourcePicker
          options={options}
          grants={draft.grants}
          onClose={() => setPickerOpen(false)}
          onAdd={(grants) => {
            onChange({
              ...draft,
              grants: [...draft.grants, ...grants],
            });
            setPickerOpen(false);
          }}
        />
      ) : null}
    </SidePanel>
  );
}

/** The resource a pending removal names, for the confirmation body. */
function removalLabel(
  t: Translate,
  options: AuthorizationOptions,
  draft: Draft,
  index?: number,
): string {
  const grant = index === undefined ? undefined : draft.grants[index];
  return grant
    ? resourceLabel(options, grant.resource)
    : t('permissionSets.editor.thisResource');
}
