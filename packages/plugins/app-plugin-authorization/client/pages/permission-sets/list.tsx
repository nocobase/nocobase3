import type { ReactElement } from 'react';

import type { PermissionSet } from '../../authorization-client.js';
import { ErrorBox } from '../../components/feedback.js';
import {
  EmptyTableRow,
  ManagementTable,
  ManagementToolbar,
} from '../../components/management-ui.js';
import { Button } from '../../components/ui/button.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import {
  describeSet,
  humanize,
  isSystemSet,
  permissionCount,
} from './labels.js';
import { SetBadge } from './set-badge.js';

export function PermissionSetsList({
  sets,
  total,
  search,
  error,
  onSearch,
  onOpen,
  onCreate,
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
}): ReactElement {
  return (
    <>
      {error ? <ErrorBox value={error} /> : null}
      <ManagementTable>
        <ManagementToolbar
          search={search}
          onSearch={onSearch}
          actionLabel='New permission set'
          onAction={onCreate}
        />
        <Table className='min-w-[48rem]'>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='px-5 py-3 font-medium'>
                Permission set
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>Type</TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                Permissions
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>Key</TableHead>
              <TableHead className='w-20 px-5 py-3' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sets.map((set) => (
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
                <TableCell className='px-5 py-4 tabular-nums'>
                  {permissionCount(set)}
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
              <EmptyTableRow colSpan={5}>
                {total === 0
                  ? 'No permission sets yet. Create one to bundle the resources and actions people need.'
                  : 'No permission sets match your search.'}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
      </ManagementTable>
    </>
  );
}
