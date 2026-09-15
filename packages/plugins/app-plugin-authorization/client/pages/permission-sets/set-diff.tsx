import { Fragment, useMemo, useState, type ReactElement } from 'react';

import type {
  AuthorizationOptions,
  PermissionSet,
} from '../../authorization-client.js';
import { NoticeBox } from '../../components/feedback.js';
import {
  FilterBar,
  FilterBarSpacer,
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
import { setDiffRows, setTitle } from './access-report.js';
import { humanize } from './labels.js';
import { ScopeLegend, ScopeMark } from './marks.js';

/**
 * How one set differs from another. Two is deliberate: a column per set stops
 * being readable long before an installation stops adding sets, and the
 * question a comparison answers is always about a pair.
 */
export function SetDiff({
  options,
  sets,
  initialKey,
  onBack,
}: {
  options: AuthorizationOptions;
  sets: readonly PermissionSet[];
  /** The set the administrator came from, which the first selector opens on. */
  initialKey?: string;
  onBack: () => void;
}): ReactElement {
  const fallback = sets.find((set) => set.key === initialKey) ?? sets[0];
  const [leftKey, setLeftKey] = useState(fallback?.key ?? '');
  const [rightKey, setRightKey] = useState(
    sets.find((set) => set.key !== fallback?.key)?.key ?? '',
  );
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);

  const left = sets.find((set) => set.key === leftKey);
  const right = sets.find((set) => set.key === rightKey);
  const allRows = useMemo(
    () => (left && right ? setDiffRows(options, left, right) : []),
    [options, left, right],
  );
  const differing = allRows.filter((row) => row.differs);
  const rows = showAll ? allRows : differing;
  const visible = pageSlice(rows, page);
  const bypassing = [left, right].filter(
    (set) => set?.unrestricted === true,
  ) as readonly PermissionSet[];

  function choose(side: 'left' | 'right', value: string): void {
    if (side === 'left') setLeftKey(value);
    else setRightKey(value);
    setPage(1);
  }

  return (
    <div className='space-y-5'>
      <DetailHeader
        onBack={onBack}
        title='Compare two sets'
        subtitle='Where one set grants something the other does not, resource by resource and action by action.'
      />
      <FilterBar>
        <SetSelect
          label='First set'
          sets={sets}
          value={leftKey}
          onChange={(value) => choose('left', value)}
        />
        <SetSelect
          label='Second set'
          sets={sets}
          value={rightKey}
          onChange={(value) => choose('right', value)}
        />
        <FilterBarSpacer />
        <FilterChip
          count={differing.length}
          pressed={!showAll}
          onClick={() => {
            setShowAll(false);
            setPage(1);
          }}
        >
          Only differences
        </FilterChip>
        <FilterChip
          count={allRows.length}
          pressed={showAll}
          onClick={() => {
            setShowAll(true);
            setPage(1);
          }}
        >
          All rows
        </FilterChip>
      </FilterBar>
      {bypassing.length === 0 ? null : (
        <NoticeBox
          title={`${bypassing.map(setTitle).join(' and ')} ${bypassing.length === 1 ? 'confers' : 'confer'} unrestricted access.`}
        >
          <p>
            Grants are not consulted for such a set, so it is marked as
            unrestricted on every row rather than compared grant by grant.
          </p>
        </NoticeBox>
      )}
      <ManagementTable>
        <Table className='min-w-[42rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>Resource</TableHead>
              <TableHead className='px-5 py-3 font-medium'>Action</TableHead>
              <TableHead className='w-32 px-5 py-3 text-center font-medium'>
                {left ? setTitle(left) : 'First set'}
              </TableHead>
              <TableHead className='w-32 px-5 py-3 text-center font-medium'>
                {right ? setTitle(right) : 'Second set'}
              </TableHead>
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
                      colSpan={4}
                    >
                      {row.groupLabel}
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableCell className='px-5 py-3 font-medium'>
                    {row.resourceLabel}
                  </TableCell>
                  <TableCell className='px-5 py-3 text-sm text-muted-foreground'>
                    {humanize(row.action)}
                  </TableCell>
                  <TableCell className='px-5 py-3 text-center'>
                    <ScopeMark value={row.left} />
                  </TableCell>
                  <TableCell className='px-5 py-3 text-center'>
                    <ScopeMark value={row.right} />
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
            {rows.length === 0 ? (
              <EmptyTableRow colSpan={4}>
                {allRows.length === 0
                  ? 'Neither set grants anything yet. Open a set to grant resources and actions.'
                  : 'These two sets grant exactly the same thing. Show all rows to read what that is.'}
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

function SetSelect({
  label,
  sets,
  value,
  onChange,
}: {
  label: string;
  sets: readonly PermissionSet[];
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <label className='flex items-center gap-2 text-xs text-muted-foreground'>
      {label}
      <select
        aria-label={label}
        className='h-8 rounded-lg border bg-background px-2.5 text-sm text-foreground'
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {sets.map((set) => (
          <option key={set.key} value={set.key}>
            {setTitle(set)}
          </option>
        ))}
      </select>
    </label>
  );
}
