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
import { COLLECTION_TYPE, actionMark } from './access-report.js';
import {
  customFilterConditions,
  defaultDatabaseActionDraft,
  recordAccessKey,
} from './drafts.js';
import {
  filterOperatorLabels,
  humanize,
  recordAccessLabel,
  recordsAndFieldsSummary,
  resourceLabel,
  resourceTypeLabel,
} from './labels.js';
import { ScopeLegend, ScopeMark } from './marks.js';
import type { DatabaseActionDraft, Draft, GrantDraft } from './types.js';

/** The chip that leaves every resource type in the table. */
const ALL_TYPES = 'all';

/** What an action's fields or records amount to when it names none. */
const NONE = '—';

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
  const [type, setType] = useState<string>(ALL_TYPES);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number>();

  const types = useMemo(() => resourceTypes(options, draft), [options, draft]);
  const activeType =
    type === ALL_TYPES || types.some((item) => item.value === type)
      ? type
      : ALL_TYPES;
  const actions = useMemo(
    () =>
      activeType === ALL_TYPES ? [] : actionColumns(options, draft, activeType),
    [options, draft, activeType],
  );

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
  const combined = activeType === ALL_TYPES;
  const isCollection = activeType === COLLECTION_TYPE;
  // The combined table carries a records column too, for the collection rows in it.
  const columns = combined ? 4 : actions.length + (isCollection ? 2 : 1);

  return (
    <div className='space-y-4'>
      <div>
        <h3 className='font-medium'>Granted permissions</h3>
        <p className='text-sm text-muted-foreground'>
          Search and review resources without expanding every policy.
        </p>
      </div>
      <FilterBar>
        <FilterChip
          count={draft.grants.length}
          pressed={combined}
          onClick={() => changeType(ALL_TYPES)}
        >
          All
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
          label='Search resources'
          placeholder='Search resources'
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
        <Button onClick={onEdit}>Edit permissions</Button>
      </FilterBar>
      <ManagementTable>
        <Table className='min-w-[42rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>Resource</TableHead>
              {combined ? (
                <>
                  <TableHead className='px-5 py-3 font-medium'>Type</TableHead>
                  <TableHead className='px-5 py-3 font-medium'>
                    Granted actions
                  </TableHead>
                </>
              ) : (
                actions.map((action) => (
                  <TableHead
                    key={action}
                    className='w-24 px-5 py-3 text-center font-medium'
                  >
                    {humanize(action)}
                  </TableHead>
                ))
              )}
              {combined || isCollection ? (
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
                {combined ? (
                  <>
                    <TableCell className='px-5 py-4 text-sm text-muted-foreground'>
                      {resourceTypeLabel(options, grant.resource.type)}
                    </TableCell>
                    <TableCell className='px-5 py-4'>
                      <GrantedActions grant={grant} />
                    </TableCell>
                  </>
                ) : (
                  actions.map((action) => (
                    <TableCell key={action} className='px-5 py-4 text-center'>
                      <ScopeMark value={actionMark(grant, action)} />
                    </TableCell>
                  ))
                )}
                {combined || isCollection ? (
                  <TableCell className='px-5 py-4 text-sm text-muted-foreground'>
                    {grant.resource.type === COLLECTION_TYPE
                      ? recordsAndFieldsSummary(grant)
                      : NONE}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={columns}>
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
      {combined || isCollection ? (
        <ScopeLegend values={['all', 'scoped', 'none']} />
      ) : null}
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

/** The actions one grant carries, each with the mark that says what it reaches. */
function GrantedActions({ grant }: { grant: GrantDraft }): ReactElement {
  const actions = sortActions(grant.actions);
  if (actions.length === 0)
    return <span className='text-sm text-muted-foreground'>{NONE}</span>;
  return (
    <div className='flex flex-wrap gap-2'>
      {actions.map((action) => (
        <span className='flex items-center gap-1.5 text-sm' key={action}>
          <ScopeMark value={actionMark(grant, action)} />
          {humanize(action)}
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

/** A type's own actions, plus any action its grants name that it no longer declares. */
function actionColumns(
  options: AuthorizationOptions,
  draft: Draft,
  type: string,
): readonly string[] {
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const declared = (resourceType?.actions ?? []).map((item) => item.value);
  const granted = draft.grants
    .filter((grant) => grant.resource.type === type)
    .flatMap((grant) => grant.actions);
  return sortActions([...declared, ...granted]);
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
  const isCollection = grant.resource.type === COLLECTION_TYPE;
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
              <h3 className='text-sm font-medium'>{humanize(action)}</h3>
              <span
                className={`text-xs ${allowed ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {allowed ? 'Allowed' : 'Not granted'}
              </span>
            </header>
            {allowed && isCollection ? (
              <ActionDetails
                action={action}
                options={options}
                value={grant.database[action] ?? defaultDatabaseActionDraft()}
              />
            ) : null}
          </section>
        );
      })}
      {actions.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          This resource declares no actions.
        </p>
      ) : null}
    </div>
  );
}

/** What one collection action was configured with: its records, then its fields. */
function ActionDetails({
  action,
  options,
  value,
}: {
  action: string;
  options: AuthorizationOptions;
  value: DatabaseActionDraft;
}): ReactElement {
  return (
    <dl className='divide-y text-sm'>
      <DetailRow label='Record access'>
        {action === 'create' ? (
          <span className='text-muted-foreground'>
            A create selects no records.
          </span>
        ) : (
          <RecordAccessDetails options={options} value={value} />
        )}
      </DetailRow>
      {action === 'create' || action === 'update' ? (
        <DetailRow label='Writable fields'>
          <FieldList value={value.input} />
        </DetailRow>
      ) : null}
      {action === 'create' || action === 'read' || action === 'update' ? (
        <DetailRow label='Visible fields'>
          <FieldList value={value.output} />
        </DetailRow>
      ) : null}
    </dl>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactElement | readonly ReactElement[];
}): ReactElement {
  return (
    <div className='grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'>
      <dt className='text-xs font-medium text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='min-w-0'>{children}</dd>
    </div>
  );
}

/** The policy the action holds, and the parameters it was configured with. */
function RecordAccessDetails({
  options,
  value,
}: {
  options: AuthorizationOptions;
  value: DatabaseActionDraft;
}): ReactElement {
  const conditions = customFilterConditions(value.recordAccess);
  const params =
    recordAccessKey(value.recordAccess) === 'customFilter'
      ? []
      : policyParams(value.recordAccess);
  return (
    <div className='space-y-2'>
      <p>{recordAccessLabel(options, value.recordAccess)}</p>
      {conditions.length === 0 ? null : (
        <ul className='space-y-1'>
          {conditions.map((condition) => (
            <li className='font-mono text-xs' key={condition.id}>
              {condition.field} {filterOperatorLabels[condition.operator]}{' '}
              {condition.value || "''"}
            </li>
          ))}
        </ul>
      )}
      {params.map((param) => (
        <p className='font-mono text-xs' key={param.name}>
          {param.name}: {param.text}
        </p>
      ))}
    </div>
  );
}

/** The parameters stored beside a policy key, read as they were stored. */
function policyParams(
  value: GrantDraft['database'][string]['recordAccess'],
): readonly { name: string; text: string }[] {
  if (typeof value === 'string') return [];
  const params = value.params;
  if (typeof params !== 'object' || params === null || Array.isArray(params))
    return [];
  return Object.entries(params).map(([name, item]) => ({
    name,
    text: typeof item === 'string' ? item : JSON.stringify(item),
  }));
}

/** The fields by name, because a count says nothing about which ones. */
function FieldList({
  value,
}: {
  value: '*' | readonly string[];
}): ReactElement {
  if (value === '*') return <span>All fields</span>;
  if (value.length === 0)
    return <span className='text-muted-foreground'>No fields</span>;
  return (
    <div className='flex flex-wrap gap-1.5'>
      {value.map((field) => (
        <span
          className='rounded-md border bg-muted/20 px-2 py-0.5 font-mono text-xs'
          key={field}
        >
          {field}
        </span>
      ))}
    </div>
  );
}
