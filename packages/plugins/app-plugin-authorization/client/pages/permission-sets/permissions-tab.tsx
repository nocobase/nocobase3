import { useMemo, useState, type ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import {
  ClearFilterButton,
  FilterBar,
  FilterBarSpacer,
  FilterChip,
  SearchField,
} from '../../components/filters.js';
import { isUnknownPage } from '../../components/page-options.js';
import {
  EmptyTableRow,
  ManagementTable,
  SidePanel,
  TablePager,
} from '../../components/management-ui.js';
import { pageSlice } from '../../components/pagination.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { compareActions } from '../../components/rule-utils.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import {
  actionLabel,
  actionMark,
  resourceLabel,
  resourceTypeLabel,
} from './labels.js';
import { ScopeLegend, ScopeMark } from './marks.js';
import { resourceTypePresentation } from './resource-presentation.js';
import type { Draft, GrantDraft } from './types.js';

/** The chip that leaves every resource type in the table. */
const ALL_TYPES = 'all';

/** What a cell stands for when it has nothing to name. */
const NONE = '—';

/** The columns the table carries, whatever the rows in it are. */
const COLUMNS = 3;

export function PermissionsSummary({
  options,
  draft,
}: {
  options: AuthorizationOptions;
  draft: Draft;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>(ALL_TYPES);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number>();

  const types = useMemo(() => resourceTypes(options, draft), [options, draft]);
  const activeType =
    type === ALL_TYPES || types.some((item) => item.value === type)
      ? type
      : ALL_TYPES;

  const query = search.trim().toLowerCase();
  const rows = draft.grants.filter(
    (grant) =>
      (activeType === ALL_TYPES || grant.resource.type === activeType) &&
      (!query ||
        [grant.resource.id, resourceLabel(options, grant.resource)].some(
          (value) => value.toLowerCase().includes(query),
        )),
  );
  const visible = pageSlice(rows, page);
  // Narrowing a filter can leave the current page past the end of the list.
  function changeSearch(value: string): void {
    setSearch(value);
    setPage(1);
  }
  function changeType(value: string): void {
    setType(value);
    setPage(1);
  }
  const filtered = query !== '' || activeType !== ALL_TYPES;
  const selectedGrant = draft.grants.find((grant) => grant.id === selected);
  return (
    <div className='space-y-4'>
      <div>
        <h3 className='font-medium'>{t('permissionSets.permissions.title')}</h3>
        <p className='text-sm text-muted-foreground'>
          {t('permissionSets.permissions.description')}
        </p>
      </div>
      <FilterBar>
        <FilterChip
          count={draft.grants.length}
          pressed={activeType === ALL_TYPES}
          onClick={() => changeType(ALL_TYPES)}
        >
          {t('common.all')}
        </FilterChip>
        {types.map((item) => (
          <FilterChip
            key={item.value}
            count={item.count}
            pressed={item.value === activeType}
            onClick={() => changeType(item.value)}
          >
            {item.label}
          </FilterChip>
        ))}
        <FilterBarSpacer />
        <SearchField
          className='sm:max-w-60'
          label={t('permissionSets.permissions.searchResources')}
          placeholder={t('permissionSets.permissions.searchResources')}
          value={search}
          onChange={changeSearch}
        />
        {filtered ? (
          <ClearFilterButton
            onClear={() => {
              changeSearch('');
              changeType(ALL_TYPES);
            }}
          />
        ) : null}
      </FilterBar>
      <ManagementTable>
        <Table className='min-w-[42rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                {t('common.resource')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('permissionSets.permissions.grantedActions')}
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                {t('permissionSets.permissions.recordsAndFields')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((grant) => (
              <TableRow
                className='cursor-pointer'
                key={grant.id}
                onClick={() => setSelected(grant.id)}
              >
                <TableCell className='max-w-[18rem] px-5 py-4'>
                  <span className='flex items-center gap-2'>
                    <span
                      className='truncate font-medium'
                      title={resourceLabel(options, grant.resource)}
                    >
                      {resourceLabel(options, grant.resource)}
                    </span>
                    {isUnknownPage(options, grant.resource) ? (
                      <span className='shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-[0.6875rem] font-normal text-destructive'>
                        {t('permissionSets.unknownPage')}
                      </span>
                    ) : null}
                  </span>
                  <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                    {resourceTypeLabel(options, grant.resource.type)}
                  </span>
                </TableCell>
                <TableCell className='px-5 py-4'>
                  <GrantedActions grant={grant} options={options} />
                </TableCell>
                <TableCell className='px-5 py-4 text-sm text-muted-foreground'>
                  {grantSummary(t, options, grant)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={COLUMNS}>
                {draft.grants.length === 0
                  ? t('permissionSets.permissions.emptyNone')
                  : t('permissionSets.permissions.emptyFiltered')}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label={t('permissionSets.permissions.pagerLabel')}
          page={page}
          total={rows.length}
          onPage={setPage}
        />
      </ManagementTable>
      <ScopeLegend values={['all', 'scoped', 'none']} />
      {selectedGrant ? (
        <SidePanel
          title={resourceLabel(options, selectedGrant.resource)}
          description={`${resourceTypeLabel(options, selectedGrant.resource.type)} · ${selectedGrant.resource.id}`}
          onClose={() => setSelected(undefined)}
        >
          <PermissionDetails grant={selectedGrant} options={options} />
        </SidePanel>
      ) : null}
    </div>
  );
}

/**
 * What the grant amounts to beyond its actions, as its resource type says it. A
 * type that has nothing to add leaves the cell empty.
 */
function grantSummary(
  t: ReturnType<typeof useAuthorizationTranslation>,
  options: AuthorizationOptions,
  grant: GrantDraft,
): string {
  return (
    resourceTypePresentation(grant.resource.type)?.summary?.(
      t,
      options,
      grant,
    ) ?? ''
  );
}

/**
 * The actions the grant confers, each with the mark saying what it reaches and
 * its name beside it. A label never splits across lines; the column wraps
 * between labels instead.
 */
function GrantedActions({
  grant,
  options,
}: {
  grant: GrantDraft;
  options: AuthorizationOptions;
}): ReactElement {
  const actions = sortActions(grant.actions);
  if (actions.length === 0)
    return <span className='text-sm text-muted-foreground'>{NONE}</span>;
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
      {actions.map((action) => (
        <span
          className='flex items-center gap-1.5 text-sm whitespace-nowrap'
          key={action}
        >
          <ScopeMark value={actionMark(grant, action)} />
          {actionLabel(options, grant.resource.type, action)}
        </span>
      ))}
    </div>
  );
}

/** The resource types the chips offer, with how many grants each holds. */
function resourceTypes(
  options: AuthorizationOptions,
  draft: Draft,
): readonly { value: string; label: string; count: number }[] {
  const declared = options.resourceTypes.map((item) => item.value);
  const granted = draft.grants.map((grant) => grant.resource.type);
  return [...new Set([...declared, ...granted])].map((value) => ({
    value,
    label: resourceTypeLabel(options, value),
    count: draft.grants.filter((grant) => grant.resource.type === value).length,
  }));
}

function sortActions(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
    .map((value) => ({ value }))
    .sort(compareActions)
    .map((item) => item.value);
}

function PermissionDetails({
  options,
  grant,
}: {
  options: AuthorizationOptions;
  grant: GrantDraft;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const ActionDetails = resourceTypePresentation(
    grant.resource.type,
  )?.actionDetails;
  const actions = sortActions([
    ...(
      options.resourceTypes.find((item) => item.value === grant.resource.type)
        ?.actions ?? []
    ).map((item) => item.value),
    ...grant.actions,
  ]);
  return (
    <div className='space-y-3'>
      {actions.map((action) => {
        const allowed = grant.actions.includes(action);
        return (
          <section className='rounded-lg border' key={action}>
            <header className='flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-2.5'>
              <h3 className='text-sm font-medium'>
                {actionLabel(options, grant.resource.type, action)}
              </h3>
              <span
                className={`text-xs ${allowed ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {allowed
                  ? t('permissionSets.permissions.allowed')
                  : t('permissionSets.permissions.notGranted')}
              </span>
            </header>
            {allowed && ActionDetails ? (
              <ActionDetails action={action} grant={grant} options={options} />
            ) : null}
          </section>
        );
      })}
      {actions.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('permissionSets.permissions.noActions')}
        </p>
      ) : null}
    </div>
  );
}
