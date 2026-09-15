import { Check, Contrast, Minus } from 'lucide-react';
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
import { compareActions } from '../../components/rule-utils.js';
import { Button } from '../../components/ui/button.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { defaultDatabaseActionDraft, recordAccessKey } from './drafts.js';
import {
  databaseActionSummary,
  humanize,
  recordsAndFieldsSummary,
  resourceLabel,
  resourceTypeLabel,
} from './labels.js';
import type { Draft, GrantDraft } from './types.js';

const COLLECTION_TYPE = 'database.collection';

/** What one action on one resource reaches: every record, some of them, or nothing. */
type GrantMark = 'all' | 'scoped' | 'none';

export function PermissionsSummary({
  options,
  draft,
  onEdit,
}: {
  options: AuthorizationOptions;
  draft: Draft;
  onEdit: () => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number>();

  const types = useMemo(() => resourceTypes(options, draft), [options, draft]);
  // The type holding grants is the one worth opening on, and the first type otherwise.
  const defaultType =
    types.find((item) => item.count > 0)?.value ?? types[0]?.value;
  const activeType =
    type !== undefined && types.some((item) => item.value === type)
      ? type
      : defaultType;
  const actions = useMemo(
    () => actionColumns(options, draft, activeType),
    [options, draft, activeType],
  );

  const query = search.trim().toLowerCase();
  const rows = draft.grants.filter(
    (grant) =>
      grant.resource.type === activeType &&
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
  function changeType(value?: string): void {
    setType(value);
    setPage(1);
  }
  const filtered = query !== '' || activeType !== defaultType;
  const selectedGrant = draft.grants.find((grant) => grant.id === selected);
  const isCollection = activeType === COLLECTION_TYPE;

  return (
    <div className='space-y-4'>
      <div>
        <h3 className='font-medium'>Granted permissions</h3>
        <p className='text-sm text-muted-foreground'>
          Search and review resources without expanding every policy.
        </p>
      </div>
      <FilterBar>
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
          label='Search resources'
          placeholder='Search resources'
          value={search}
          onChange={changeSearch}
        />
        {filtered ? (
          <ClearFilterButton
            onClear={() => {
              changeSearch('');
              changeType(defaultType);
            }}
          />
        ) : null}
        <Button onClick={onEdit}>Edit permissions</Button>
      </FilterBar>
      <ManagementTable>
        <Table className='min-w-[42rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>Resource</TableHead>
              {actions.map((action) => (
                <TableHead
                  key={action}
                  className='w-24 px-5 py-3 text-center font-medium'
                >
                  {humanize(action)}
                </TableHead>
              ))}
              {isCollection ? (
                <TableHead className='px-5 py-3 font-medium'>
                  Records and fields
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((grant) => (
              <TableRow
                className='cursor-pointer'
                key={grant.id}
                onClick={() => setSelected(grant.id)}
              >
                <TableCell className='px-5 py-4 font-medium'>
                  {resourceLabel(options, grant.resource)}
                  {isUnknownPage(options, grant.resource) ? (
                    <span className='ml-2 rounded-md bg-destructive/10 px-2 py-0.5 text-[0.6875rem] font-normal text-destructive'>
                      Unknown page
                    </span>
                  ) : null}
                </TableCell>
                {actions.map((action) => (
                  <TableCell key={action} className='px-5 py-4 text-center'>
                    <ScopeMark value={actionMark(grant, action)} />
                  </TableCell>
                ))}
                {isCollection ? (
                  <TableCell className='px-5 py-4 text-sm text-muted-foreground'>
                    {recordsAndFieldsSummary(grant)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={actions.length + (isCollection ? 2 : 1)}>
                {draft.grants.length === 0
                  ? 'No permissions yet. Edit the set to grant resources and actions.'
                  : 'No permissions match these filters.'}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label='Permissions'
          page={page}
          total={rows.length}
          onPage={setPage}
        />
      </ManagementTable>
      {isCollection ? <ScopeLegend /> : null}
      {selectedGrant ? (
        <SidePanel
          title={resourceLabel(options, selectedGrant.resource)}
          description={`${resourceTypeLabel(options, selectedGrant.resource.type)} · ${selectedGrant.resource.id}`}
          onClose={() => setSelected(undefined)}
        >
          <PermissionDetails grant={selectedGrant} />
        </SidePanel>
      ) : null}
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

/** A type's own actions, plus any action its grants name that it no longer declares. */
function actionColumns(
  options: AuthorizationOptions,
  draft: Draft,
  type?: string,
): readonly string[] {
  if (type === undefined) return [];
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const declared = (resourceType?.actions ?? []).map((item) => item.value);
  const granted = draft.grants
    .filter((grant) => grant.resource.type === type)
    .flatMap((grant) => grant.actions);
  return [...new Set([...declared, ...granted])]
    .map((value) => ({ value }))
    .sort(compareActions)
    .map((item) => item.value);
}

function actionMark(grant: GrantDraft, action: string): GrantMark {
  if (!grant.actions.includes(action)) return 'none';
  if (grant.resource.type !== COLLECTION_TYPE) return 'all';
  // A create selects no records, so it is never scoped.
  if (action === 'create') return 'all';
  const value = grant.database[action] ?? defaultDatabaseActionDraft();
  return recordAccessKey(value.recordAccess) === 'allRecords'
    ? 'all'
    : 'scoped';
}

const markLabels: Readonly<Record<GrantMark, string>> = {
  all: 'Every record',
  scoped: 'Scoped records',
  none: 'Not granted',
};

function ScopeMark({ value }: { value: GrantMark }): ReactElement {
  const styles: Readonly<Record<GrantMark, string>> = {
    all: 'bg-primary/10 text-primary',
    scoped: 'bg-muted text-foreground',
    none: 'text-muted-foreground/60',
  };
  const Icon = value === 'all' ? Check : value === 'scoped' ? Contrast : Minus;
  return (
    <span
      aria-label={markLabels[value]}
      className={`inline-grid size-6 place-items-center rounded-md ${styles[value]}`}
      role='img'
      title={markLabels[value]}
    >
      <Icon className='size-3.5' />
    </span>
  );
}

function ScopeLegend(): ReactElement {
  return (
    <div className='flex flex-wrap gap-4 text-xs text-muted-foreground'>
      {(['all', 'scoped', 'none'] as const).map((value) => (
        <span key={value} className='flex items-center gap-2'>
          <ScopeMark value={value} />
          {markLabels[value]}
        </span>
      ))}
    </div>
  );
}

function PermissionDetails({ grant }: { grant: GrantDraft }): ReactElement {
  return (
    <div className='space-y-5'>
      <section>
        <h3 className='text-sm font-medium'>Allowed actions</h3>
        <div className='mt-3 flex flex-wrap gap-2'>
          {grant.actions.map((action) => (
            <span
              className='rounded-md border bg-muted/20 px-3 py-1.5 text-sm'
              key={action}
            >
              {humanize(action)}
            </span>
          ))}
        </div>
      </section>
      {grant.resource.type === COLLECTION_TYPE ? (
        <section className='border-t pt-5'>
          <h3 className='text-sm font-medium'>Data access</h3>
          <div className='mt-3 divide-y rounded-lg border'>
            {grant.actions.map((action) => (
              <div
                className='flex items-start justify-between gap-4 p-4'
                key={action}
              >
                <span className='font-medium'>{humanize(action)}</span>
                <span className='text-right text-sm text-muted-foreground'>
                  {databaseActionSummary(
                    action,
                    grant.database[action] ?? defaultDatabaseActionDraft(),
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
