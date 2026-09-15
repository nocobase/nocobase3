import { useState, type ReactElement } from 'react';

import type { PermissionSet } from '../../authorization-client.js';
import { ErrorBox } from '../../components/feedback.js';
import {
  EmptyTableRow,
  ManagementTable,
  ManagementToolbar,
  TablePager,
} from '../../components/management-ui.js';
import { pageSlice } from '../../components/pagination.js';
import { Button } from '../../components/ui/button.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { describeSet, humanize, isSystemSet } from './labels.js';
import { SetBadge } from './set-badge.js';

export function PermissionSetsList({
  sets,
  total,
  search,
  error,
  onSearch,
  onOpen,
  onCreate,
  onResourceAccess,
  onCompare,
  onUserAccess,
}: {
  /** The sets the current search leaves visible. */
  sets: readonly PermissionSet[];
  /** How many exist at all, which is what tells an empty list from an empty search. */
  total: number;
  search: string;
  error?: string;
  onSearch: (value: string) => void;
  onOpen: (set: PermissionSet) => void;
  onCreate: () => void;
  /** Opens the view that reports which sets grant one resource. */
  onResourceAccess: () => void;
  /** Opens the view that diffs two of these sets. */
  onCompare: () => void;
  /** Opens the view that reports one person's access across those sets. */
  onUserAccess: () => void;
}): ReactElement {
  const [page, setPage] = useState(1);
  const [lastSearch, setLastSearch] = useState(search);
  // A narrower search can leave the current page past the end of the list.
  if (lastSearch !== search) {
    setLastSearch(search);
    setPage(1);
  }
  const visible = pageSlice(sets, page);
  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <ManagementToolbar
        search={search}
        searchLabel='Search permission sets'
        searchPlaceholder='Search permission sets'
        onSearch={onSearch}
        actionLabel='New permission set'
        onAction={onCreate}
        secondaryActions={
          <>
            <Button variant='outline' onClick={onResourceAccess}>
              Resource access
            </Button>
            <Button variant='outline' onClick={onCompare}>
              Compare two sets
            </Button>
            <Button variant='outline' onClick={onUserAccess}>
              User access
            </Button>
          </>
        }
      />
      <ManagementTable>
        <Table className='min-w-[48rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                Permission set
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>Type</TableHead>
              <TableHead className='px-5 py-3 font-medium'>Key</TableHead>
              <TableHead className='w-20 px-5 py-3' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((set) => (
              <TableRow key={set.key}>
                <TableCell className='px-5 py-4'>
                  <button
                    className='font-medium text-primary hover:underline'
                    type='button'
                    onClick={() => onOpen(set)}
                  >
                    {set.title ?? humanize(set.key)}
                  </button>
                  <p className='mt-0.5 text-xs text-muted-foreground'>
                    {describeSet(set)}
                  </p>
                </TableCell>
                <TableCell className='px-5 py-4'>
                  <SetBadge tone={isSystemSet(set) ? 'protected' : 'neutral'}>
                    {isSystemSet(set) ? 'System' : 'Custom'}
                  </SetBadge>
                </TableCell>
                <TableCell className='px-5 py-4 font-mono text-xs text-muted-foreground'>
                  {set.key}
                </TableCell>
                <TableCell className='px-5 py-4 text-right'>
                  <Button size='sm' variant='ghost' onClick={() => onOpen(set)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {sets.length === 0 ? (
              <EmptyTableRow colSpan={4}>
                {total === 0
                  ? 'No permission sets yet. Create one to bundle the resources and actions people need.'
                  : 'No permission sets match your search.'}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label='Permission sets'
          page={page}
          total={sets.length}
          onPage={setPage}
        />
      </ManagementTable>
    </>
  );
}
