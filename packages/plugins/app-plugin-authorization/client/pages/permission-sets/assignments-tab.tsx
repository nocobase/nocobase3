import { useState, type ReactElement } from 'react';

import type {
  AuthorizationSubject,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import {
  ClearFilterButton,
  FilterBar,
  FilterBarSpacer,
  SearchField,
} from '../../components/filters.js';
import {
  EmptyTableRow,
  ManagementTable,
  SidePanel,
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
import {
  canAddAssignment,
  type UserDirectory,
} from '../../components/user-directory.js';
import { subjectLabel } from './labels.js';

export function Assignments({
  directory,
  assignments,
  canAssign,
  canAssignAudience,
  canRevoke,
  busy,
  onAssign,
  onRevoke,
}: {
  directory: UserDirectory;
  assignments: readonly PermissionSetAssignment[];
  /** A protected set may still accept new assignments; adding a superuser is the recovery path. */
  canAssign: boolean;
  /** The set's protection may name the subject types it accepts. */
  canAssignAudience: boolean;
  canRevoke: boolean;
  busy: boolean;
  onAssign: (subjects: readonly AuthorizationSubject[]) => Promise<void>;
  onRevoke: (ids: readonly string[]) => Promise<void>;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const query = search.trim().toLowerCase();
  const visible = assignments.filter((item) => {
    const label = subjectLabel(item.subject, directory).toLowerCase();
    const itemKind =
      item.subject.type === 'authenticated' ? 'audience' : 'user';
    return (
      (kind === 'all' || kind === itemKind) && (!query || label.includes(query))
    );
  });
  const paged = pageSlice(visible, page);
  // Narrowing a filter can leave the current page past the end of the list.
  function changeSearch(value: string): void {
    setSearch(value);
    setPage(1);
  }
  function changeKind(value: string): void {
    setKind(value);
    setPage(1);
  }
  function toggle(id: string, checked: boolean): void {
    setSelected((items) =>
      checked ? [...items, id] : items.filter((item) => item !== id),
    );
  }
  return (
    <div className='space-y-4'>
      <FilterBar>
        <SearchField
          className='sm:max-w-72'
          label='Search assignments'
          placeholder='Search name, username, or email'
          value={search}
          onChange={changeSearch}
        />
        <select
          aria-label='Assignment type'
          className='h-9 min-w-44 rounded-lg border bg-background px-3 text-sm'
          value={kind}
          onChange={(event) => changeKind(event.target.value)}
        >
          <option value='all'>All assignments</option>
          <option value='user'>Users</option>
          <option value='audience'>Audiences</option>
        </select>
        {query || kind !== 'all' ? (
          <ClearFilterButton
            onClear={() => {
              changeSearch('');
              setKind('all');
            }}
          />
        ) : null}
        <FilterBarSpacer />
        {selected.length > 0 ? (
          <Button
            variant='outline'
            disabled={busy || !canRevoke}
            onClick={() => void onRevoke(selected).then(() => setSelected([]))}
          >
            Revoke selected ({selected.length})
          </Button>
        ) : null}
        <Button
          disabled={!canAssign || !canAddAssignment(directory)}
          onClick={() => setAddOpen(true)}
        >
          Add assignments
        </Button>
      </FilterBar>
      <ManagementTable>
        {directory.unavailable ? (
          <p className='border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground'>
            {directory.unavailable}
          </p>
        ) : null}
        <Table>
          <TableHeader className='bg-muted/30 uppercase'>
            <TableRow>
              <TableHead className='w-12 px-5 py-3'>
                <input
                  aria-label='Select all visible assignments'
                  type='checkbox'
                  checked={
                    visible.length > 0 &&
                    visible.every((item) => selected.includes(item.id))
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [
                            ...new Set([
                              ...selected,
                              ...visible.map((item) => item.id),
                            ]),
                          ]
                        : selected.filter(
                            (id) => !visible.some((item) => item.id === id),
                          ),
                    )
                  }
                />
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                Assigned to
              </TableHead>
              <TableHead className='px-5 py-3 font-medium'>
                Subject type
              </TableHead>
              <TableHead className='w-24 px-5 py-3' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((item) => (
              <TableRow key={item.id}>
                <TableCell className='px-5 py-4'>
                  <input
                    aria-label={`Select ${subjectLabel(item.subject, directory)}`}
                    type='checkbox'
                    checked={selected.includes(item.id)}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                </TableCell>
                <TableCell className='px-5 py-4 font-medium'>
                  {subjectLabel(item.subject, directory)}
                </TableCell>
                <TableCell className='px-5 py-4 text-muted-foreground'>
                  {item.subject.type === 'authenticated' ? 'Audience' : 'User'}
                </TableCell>
                <TableCell className='px-5 py-4 text-right'>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={!canRevoke}
                    onClick={() => void onRevoke([item.id])}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 ? (
              <EmptyTableRow colSpan={4}>
                {assignments.length === 0
                  ? 'No assignments yet. Add one to give someone this permission set.'
                  : 'No assignments match these filters.'}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
        <TablePager
          label='Assignments'
          page={page}
          total={visible.length}
          onPage={setPage}
        />
      </ManagementTable>
      {addOpen ? (
        <AssignmentPicker
          directory={directory}
          assignments={assignments}
          canAssignAudience={canAssignAudience}
          busy={busy}
          onClose={() => setAddOpen(false)}
          onAdd={(subjects) =>
            void onAssign(subjects).then(() => setAddOpen(false))
          }
        />
      ) : null}
    </div>
  );
}

function AssignmentPicker({
  directory,
  assignments,
  canAssignAudience,
  busy,
  onClose,
  onAdd,
}: {
  directory: UserDirectory;
  assignments: readonly PermissionSetAssignment[];
  canAssignAudience: boolean;
  busy: boolean;
  onClose: () => void;
  onAdd: (subjects: readonly AuthorizationSubject[]) => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [audience, setAudience] = useState(false);
  const assignedUsers = new Set(
    assignments
      .filter((item) => item.subject.type === 'user')
      .map((item) => item.subject.id),
  );
  const audienceAssigned = assignments.some(
    (item) => item.subject.type === 'authenticated',
  );
  const query = search.trim().toLowerCase();
  const visible = directory.users.filter(
    (user) =>
      !assignedUsers.has(user.id) &&
      (!query ||
        [user.name, user.username, user.email].some((value) =>
          value?.toLowerCase().includes(query),
        )),
  );
  const subjects: readonly AuthorizationSubject[] = [
    ...(audience ? [{ type: 'authenticated', id: '*' }] : []),
    ...selected.map((id) => ({ type: 'user', id })),
  ];
  function toggle(id: string, checked: boolean): void {
    setSelected((items) =>
      checked ? [...items, id] : items.filter((item) => item !== id),
    );
  }
  return (
    <SidePanel
      title='Add assignments'
      description='Find people and assign this permission set in one operation.'
      onClose={onClose}
    >
      <div className='space-y-5'>
        {canAssignAudience ? (
          <section>
            <h3 className='text-sm font-medium'>Audience</h3>
            <label
              className={`mt-3 flex items-start gap-3 rounded-lg border p-4 ${audienceAssigned ? 'opacity-50' : 'cursor-pointer hover:bg-muted/20'}`}
            >
              <input
                className='mt-1'
                type='checkbox'
                checked={audienceAssigned || audience}
                disabled={audienceAssigned}
                onChange={(event) => setAudience(event.target.checked)}
              />
              <span>
                <span className='block text-sm font-medium'>
                  All signed-in users
                </span>
                <span className='mt-0.5 block text-xs text-muted-foreground'>
                  Everyone with a valid session. This is managed separately from
                  individual users.
                </span>
              </span>
            </label>
          </section>
        ) : null}
        <section className='border-t pt-5'>
          <div className='flex items-end justify-between gap-3'>
            <div>
              <h3 className='text-sm font-medium'>Users</h3>
              <p className='mt-0.5 text-xs text-muted-foreground'>
                Already assigned users are hidden.
              </p>
            </div>
            <span className='text-xs text-muted-foreground'>
              {selected.length} selected
            </span>
          </div>
          <SearchField
            className='mt-3 sm:max-w-none'
            label='Search people'
            placeholder='Search name, username, or email'
            value={search}
            onChange={setSearch}
          />
          <div className='mt-3 overflow-hidden rounded-lg border'>
            <label className='flex items-center gap-3 border-b bg-muted/20 px-4 py-3 text-sm font-medium'>
              <input
                type='checkbox'
                checked={
                  visible.length > 0 &&
                  visible.every((user) => selected.includes(user.id))
                }
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [
                          ...new Set([
                            ...selected,
                            ...visible.map((user) => user.id),
                          ]),
                        ]
                      : selected.filter(
                          (id) => !visible.some((user) => user.id === id),
                        ),
                  )
                }
              />
              Select all results
              <span className='ml-auto text-xs font-normal text-muted-foreground'>
                {visible.length} users
              </span>
            </label>
            <div className='max-h-[24rem] divide-y overflow-y-auto'>
              {visible.map((user) => (
                <label
                  className='flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/20'
                  key={user.id}
                >
                  <input
                    className='mt-1'
                    type='checkbox'
                    checked={selected.includes(user.id)}
                    onChange={(event) => toggle(user.id, event.target.checked)}
                  />
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-medium'>
                      {user.name}
                    </span>
                    <span className='block truncate text-xs text-muted-foreground'>
                      {[user.username, user.email].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              ))}
              {visible.length === 0 ? (
                <p className='px-4 py-10 text-center text-sm text-muted-foreground'>
                  No available users match your search.
                </p>
              ) : null}
            </div>
          </div>
        </section>
        <div className='sticky bottom-0 flex items-center justify-between border-t bg-background py-4'>
          <span className='text-sm text-muted-foreground'>
            {subjects.length} assignment{subjects.length === 1 ? '' : 's'}{' '}
            selected
          </span>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || subjects.length === 0}
              onClick={() => onAdd(subjects)}
            >
              {busy ? 'Assigning…' : 'Add assignments'}
            </Button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
