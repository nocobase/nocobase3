import { useState, type ReactElement } from 'react';

import type { AuthorizationOptions } from '../../authorization-client.js';
import { isUnknownPage } from '../../components/page-options.js';
import {
  EmptyTableRow,
  ManagementTable,
  SidePanel,
} from '../../components/management-ui.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.js';
import { defaultDatabaseActionDraft } from './drafts.js';
import {
  databaseAccessSummary,
  databaseActionSummary,
  humanize,
  resourceLabel,
  resourceTypeLabel,
} from './labels.js';
import type { Draft, GrantDraft } from './types.js';

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
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<number>();
  const query = search.trim().toLowerCase();
  const visible = draft.grants.filter(
    (grant) =>
      (type === 'all' || grant.resource.type === type) &&
      (!query ||
        [
          grant.resource.id,
          resourceLabel(options, grant.resource),
          ...grant.actions,
        ].some((value) => value.toLowerCase().includes(query))),
  );
  const selectedGrant = draft.grants.find((grant) => grant.id === selected);
  return (
    <ManagementTable>
      <div className='flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <h3 className='font-medium'>Granted permissions</h3>
          <p className='text-sm text-muted-foreground'>
            Search and review resources without expanding every policy.
          </p>
        </div>
        <div className='flex w-full flex-wrap gap-2 lg:w-auto lg:flex-nowrap'>
          <Input
            className='max-w-72 flex-1 lg:w-72 lg:flex-none'
            type='search'
            placeholder='Search resources or actions'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label='Resource type'
            className='h-8 min-w-48 rounded-lg border bg-background px-3 text-sm'
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value='all'>All resource types</option>
            {options.resourceTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Button onClick={onEdit}>Edit permissions</Button>
        </div>
      </div>
      <Table className='min-w-[42rem]'>
        <TableHeader className='bg-muted/30 uppercase'>
          <TableRow>
            <TableHead className='px-5 py-3 font-medium'>Category</TableHead>
            <TableHead className='px-5 py-3 font-medium'>Resource</TableHead>
            <TableHead className='px-5 py-3 font-medium'>Actions</TableHead>
            <TableHead className='px-5 py-3 font-medium'>
              Record access
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
              <TableCell className='px-5 py-4'>
                {resourceTypeLabel(options, grant.resource.type)}
              </TableCell>
              <TableCell className='px-5 py-4 font-medium'>
                {resourceLabel(options, grant.resource)}
                {isUnknownPage(options, grant.resource) ? (
                  <span className='ml-2 rounded-md bg-destructive/10 px-2 py-0.5 text-[0.6875rem] font-normal text-destructive'>
                    Unknown page
                  </span>
                ) : null}
              </TableCell>
              <TableCell className='px-5 py-4'>
                <div className='flex flex-wrap gap-1.5'>
                  {grant.actions.map((action) => (
                    <span
                      className='rounded-md bg-muted px-2 py-1 text-xs font-medium'
                      key={action}
                    >
                      {humanize(action)}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell className='px-5 py-4 text-muted-foreground'>
                {grant.resource.type === 'database.collection'
                  ? databaseAccessSummary(grant)
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 ? (
            <EmptyTableRow colSpan={4}>
              {draft.grants.length === 0
                ? 'No permissions yet. Edit the set to grant resources and actions.'
                : 'No permissions match these filters.'}
            </EmptyTableRow>
          ) : null}
        </TableBody>
      </Table>
      {selectedGrant ? (
        <SidePanel
          title={resourceLabel(options, selectedGrant.resource)}
          description={`${resourceTypeLabel(options, selectedGrant.resource.type)} · ${selectedGrant.resource.id}`}
          onClose={() => setSelected(undefined)}
        >
          <PermissionDetails grant={selectedGrant} />
        </SidePanel>
      ) : null}
    </ManagementTable>
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
      {grant.resource.type === 'database.collection' ? (
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
