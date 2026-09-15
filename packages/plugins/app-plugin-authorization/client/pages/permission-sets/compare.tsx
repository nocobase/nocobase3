import { Fragment, useMemo, useState, type ReactElement } from 'react';

import type {
  AuthorizationOptions,
  PermissionSet,
} from '../../authorization-client.js';
import {
  ClearFilterButton,
  FilterBar,
  FilterChip,
} from '../../components/filters.js';
import {
  DetailHeader,
  EmptyTableRow,
  ManagementTable,
  TablePager,
} from '../../components/management-ui.js';
import { pageSlice } from '../../components/pagination.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { comparisonRows } from './access-report.js';
import { humanize, resourceTypeLabel } from './labels.js';
import { ScopeLegend, ScopeMark } from './marks.js';

const ALL_TYPES = 'all';

/**
 * What every set grants, side by side. The columns are the sets the list
 * already holds and the rows are one resource and action each, so nothing is
 * requested for this view.
 */
export function CompareSets({
  options,
  sets,
  onBack,
}: {
  options: AuthorizationOptions;
  sets: readonly PermissionSet[];
  onBack: () => void;
}): ReactElement {
  const [type, setType] = useState<string>(ALL_TYPES);
  const [page, setPage] = useState(1);

  const allRows = useMemo(() => comparisonRows(options, sets), [options, sets]);
  const types = useMemo(
    () =>
      [...new Set(allRows.map((row) => row.resourceType))].map((value) => ({
        value,
        label: resourceTypeLabel(options, value),
        count: allRows.filter((row) => row.resourceType === value).length,
      })),
    [allRows, options],
  );
  const rows =
    type === ALL_TYPES
      ? allRows
      : allRows.filter((row) => row.resourceType === type);
  const visible = pageSlice(rows, page);

  // Narrowing the filter can leave the current page past the end of the list.
  function changeType(value: string): void {
    setType(value);
    setPage(1);
  }

  return (
    <div className='space-y-5'>
      <DetailHeader
        onBack={onBack}
        title='Compare sets'
        subtitle="What each set grants, side by side. A grant that starts from every record reads differently from one scoped to the holder's own."
      />
      <FilterBar>
        <FilterChip
          count={allRows.length}
          pressed={type === ALL_TYPES}
          onClick={() => changeType(ALL_TYPES)}
        >
          All resources
        </FilterChip>
        {types.map((item) => (
          <FilterChip
            key={item.value}
            count={item.count}
            pressed={item.value === type}
            onClick={() => changeType(item.value)}
          >
            {item.label}
          </FilterChip>
        ))}
        {type === ALL_TYPES ? null : (
          <ClearFilterButton onClear={() => changeType(ALL_TYPES)} />
        )}
      </FilterBar>
      <ManagementTable>
        {/* Many sets means many columns, so the frame scrolls sideways and the resource column stays put. */}
        <Table className='min-w-max'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='sticky left-0 z-10 min-w-56 bg-muted/30 px-5 py-3 font-medium'>
                Resource and action
              </TableHead>
              {sets.map((set) => (
                <TableHead
                  key={set.key}
                  className='min-w-28 px-5 py-3 text-center font-medium'
                >
                  <span className='block text-foreground'>
                    {set.title ?? humanize(set.key)}
                  </span>
                  <span className='block font-mono text-[0.625rem] normal-case'>
                    {set.key}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, index) => (
              <Fragment key={row.key}>
                {index === 0 ||
                visible[index - 1]?.resourceType !== row.resourceType ? (
                  <TableRow className='hover:bg-transparent'>
                    <TableCell
                      className='bg-muted/20 px-5 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'
                      colSpan={sets.length + 1}
                    >
                      {row.groupLabel}
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableCell className='sticky left-0 z-10 bg-card px-5 py-3'>
                    <span className='font-medium'>{row.resourceLabel}</span>
                    <span className='ml-2 text-muted-foreground'>
                      · {humanize(row.action)}
                    </span>
                  </TableCell>
                  {sets.map((set, column) => (
                    <TableCell key={set.key} className='px-5 py-3 text-center'>
                      <ScopeMark value={row.marks[column] ?? 'none'} />
                    </TableCell>
                  ))}
                </TableRow>
              </Fragment>
            ))}
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={sets.length + 1}>
                {allRows.length === 0
                  ? 'No set grants anything yet. Open a set to grant resources and actions.'
                  : 'No permissions match this filter.'}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label='Compared permissions'
          page={page}
          total={rows.length}
          onPage={setPage}
        />
      </ManagementTable>
      <ScopeLegend values={['all', 'scoped', 'none', 'bypass']} />
    </div>
  );
}
