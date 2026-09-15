import { useMemo, useState, type ReactElement } from 'react';

import type {
  AuthorizationOptions,
  PermissionSet,
} from '../../authorization-client.js';
import { ClearFilterButton, SearchCombobox } from '../../components/filters.js';
import {
  DetailHeader,
  EmptyTableRow,
  ManagementTable,
  TablePager,
} from '../../components/management-ui.js';
import { pageSlice } from '../../components/pagination.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '../../components/ui/empty.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { resourceAccessRows, resourceActions } from './access-report.js';
import { humanize } from './labels.js';
import { ScopeLegend, ScopeMark } from './marks.js';

const MATCH_LIMIT = 8;

/** One resource the search offers, carrying the type it belongs to. */
interface ResourceChoice {
  readonly key: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly id: string;
  readonly label: string;
}

/**
 * Who can act on one resource. The rows are the sets that grant anything on it
 * and the columns are that resource kind's own actions, so the vocabulary is
 * uniform by construction. Nothing is requested for this view: the sets and
 * their grants are the list the panel already holds.
 */
export function ResourceAccess({
  options,
  sets,
  onBack,
  onOpen,
}: {
  options: AuthorizationOptions;
  sets: readonly PermissionSet[];
  onBack: () => void;
  onOpen: (set: PermissionSet) => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<ResourceChoice>();
  const [page, setPage] = useState(1);

  // The options declare the types in order, so flattening them keeps the grouping.
  const choices = useMemo(
    () =>
      options.resourceTypes.flatMap((type) =>
        type.resources.map((resource) => ({
          key: `${type.value}:${resource.value}`,
          type: type.value,
          typeLabel: type.label,
          id: resource.value,
          label: resource.label,
        })),
      ),
    [options],
  );
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return choices
      .filter((choice) =>
        [choice.label, choice.id, choice.typeLabel].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
      .slice(0, MATCH_LIMIT);
  }, [choices, search]);

  return (
    <div className='space-y-5'>
      <DetailHeader
        onBack={onBack}
        title='Resource access'
        subtitle='Who can act on one resource, and what each set that grants it reaches.'
      />
      <div className='flex flex-wrap items-center gap-2'>
        <SearchCombobox
          emptyMessage={`No resource matches “${search.trim()}”.`}
          items={matches}
          itemKey={(choice) => choice.key}
          label='Search resources'
          placeholder='Search by resource name'
          renderItem={(choice) => (
            <span className='flex min-w-0 flex-col'>
              <span className='font-medium'>{choice.label}</span>
              <span className='truncate text-xs text-muted-foreground'>
                {choice.typeLabel} · {choice.id}
              </span>
            </span>
          )}
          value={search}
          onChange={setSearch}
          onSelect={(choice) => {
            setChosen(choice);
            setSearch(choice.label);
            setPage(1);
          }}
        />
        {chosen ? (
          <ClearFilterButton
            onClear={() => {
              setChosen(undefined);
              setSearch('');
              setPage(1);
            }}
          />
        ) : null}
      </div>
      {chosen ? (
        <ChosenResource
          choice={chosen}
          options={options}
          page={page}
          sets={sets}
          onOpen={onOpen}
          onPage={setPage}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No resource chosen yet</EmptyTitle>
            <EmptyDescription>
              Search for a resource by name to see which permission sets grant
              it, and what each of them reaches.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function ChosenResource({
  choice,
  options,
  sets,
  page,
  onOpen,
  onPage,
}: {
  choice: ResourceChoice;
  options: AuthorizationOptions;
  sets: readonly PermissionSet[];
  page: number;
  onOpen: (set: PermissionSet) => void;
  onPage: (page: number) => void;
}): ReactElement {
  const resource = { type: choice.type, id: choice.id };
  const actions = resourceActions(options, sets, resource);
  const rows = resourceAccessRows(sets, resource, actions);
  const visible = pageSlice(rows, page);
  return (
    <>
      <ManagementTable>
        <Table className='min-w-[36rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                Permission set
              </TableHead>
              {actions.map((action) => (
                <TableHead
                  key={action}
                  className='w-24 px-5 py-3 text-center font-medium'
                >
                  {humanize(action)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.key}>
                <TableCell className='px-5 py-4'>
                  <button
                    className='font-medium text-primary hover:underline'
                    type='button'
                    onClick={() => onOpen(row.set)}
                  >
                    {row.title}
                  </button>
                  <p className='mt-0.5 font-mono text-xs text-muted-foreground'>
                    {row.set.key}
                  </p>
                </TableCell>
                {actions.map((action, column) => (
                  <TableCell key={action} className='px-5 py-4 text-center'>
                    <ScopeMark value={row.marks[column] ?? 'none'} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={actions.length + 1}>
                No permission set grants {choice.label}. Open a set to grant it.
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label='Permission sets'
          page={page}
          total={rows.length}
          onPage={onPage}
        />
      </ManagementTable>
      <ScopeLegend values={['all', 'scoped', 'none', 'bypass']} />
    </>
  );
}
