import { Button, Input } from '../components/ui.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import type {
  AuthorizationOptions,
  AuthorizationSubject,
  AuthorizationUser,
  PermissionGrant,
  PermissionSet,
  PermissionSetAssignment,
} from '../authorization-client.js';
import { ActionsEditor, Field } from '../components/editors.js';
import { ErrorBox, errorMessage as message } from '../components/feedback.js';
import {
  DetailHeader,
  DetailTabs,
  EmptyTableRow,
  ManagementTable,
  ManagementToolbar,
  SidePanel,
} from '../components/management-ui.js';
import { getAuthorizationClient } from '../runtime.js';

interface GrantDraft {
  id: number;
  resource: { type: string; id: string };
  actions: readonly string[];
  database: Readonly<Record<string, DatabaseActionDraft>>;
}
interface DatabaseActionDraft {
  input: '*' | readonly string[];
  output: '*' | readonly string[];
  recordAccess: RecordAccessDraft;
}
type RecordAccessDraft =
  | string
  | {
      key: string;
      params?: unknown;
    };
interface FilterConditionDraft {
  id: number;
  field: string;
  operator: '$eq' | '$ne' | '$in' | '$notIn' | '$gt' | '$gte' | '$lt' | '$lte';
  value: string;
}
interface Draft {
  originalKey?: string;
  key: string;
  title: string;
  grants: readonly GrantDraft[];
}
type DetailSection = 'permissions' | 'assignments';

let nextId = 0;
const authz = getAuthorizationClient();

export function PermissionSetsPanel({
  options,
  users,
}: {
  options: AuthorizationOptions;
  users: readonly AuthorizationUser[];
}): ReactElement {
  const [sets, setSets] = useState<readonly PermissionSet[]>([]);
  const [assignments, setAssignments] = useState<
    readonly PermissionSetAssignment[]
  >([]);
  const [draft, setDraft] = useState<Draft>();
  const [editorDraft, setEditorDraft] = useState<Draft>();
  const [section, setSection] = useState<DetailSection>('permissions');
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    try {
      setSets(await authz.listPermissionSets());
    } catch (cause) {
      setError(message(cause));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visibleSets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sets;
    return sets.filter((set) =>
      [set.title, set.key].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [search, sets]);

  async function open(set: PermissionSet): Promise<void> {
    setDraft(fromSet(set));
    setEditorDraft(undefined);
    setSection('permissions');
    setAssignments(await authz.listAssignments(set.key));
  }
  function create(): void {
    setDraft(undefined);
    setEditorDraft(empty());
    setAssignments([]);
    setSection('permissions');
    setEditorOpen(true);
  }
  function closeEditor(): void {
    setEditorOpen(false);
    setEditorDraft(undefined);
  }
  function edit(): void {
    if (!draft) return;
    setEditorDraft(cloneDraft(draft));
    setEditorOpen(true);
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!editorDraft) return;
    setBusy(true);
    setError(undefined);
    try {
      const input = toInput(editorDraft);
      if (
        !input.key ||
        input.grants.some(
          (grant) => !grant.resource.id || grant.actions.length === 0,
        ) ||
        hasEmptyCustomFilter(editorDraft)
      )
        throw new TypeError('Complete every permission before saving.');
      const saved = editorDraft.originalKey
        ? await authz.updatePermissionSet(editorDraft.originalKey, input)
        : await authz.createPermissionSet(input);
      authz.invalidatePermissions();
      await load();
      setDraft(fromSet(saved));
      setSection('permissions');
      setEditorDraft(undefined);
      setEditorOpen(false);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(): Promise<void> {
    if (!draft?.originalKey) return;
    setBusy(true);
    try {
      await authz.deletePermissionSet(draft.originalKey);
      setDraft(undefined);
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function assign(
    subjects: readonly AuthorizationSubject[],
  ): Promise<void> {
    if (!draft?.originalKey || subjects.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        subjects.map((subject) =>
          authz.assign(draft.originalKey!, { subject }),
        ),
      );
      setAssignments(await authz.listAssignments(draft.originalKey));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => authz.revoke(id)));
      setAssignments((items) => items.filter((item) => !ids.includes(item.id)));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <>
        <ManagementTable>
          <ManagementToolbar
            search={search}
            onSearch={setSearch}
            actionLabel='New permission set'
            onAction={create}
          />
          {error ? (
            <div className='p-5'>
              <ErrorBox value={error} />
            </div>
          ) : null}
          <table className='w-full min-w-[48rem] text-left text-sm'>
            <thead className='border-b bg-muted/30 text-xs tracking-wide text-muted-foreground uppercase'>
              <tr>
                <th className='px-5 py-3 font-medium'>Permission set</th>
                <th className='px-5 py-3 font-medium'>Type</th>
                <th className='px-5 py-3 font-medium'>Permissions</th>
                <th className='px-5 py-3 font-medium'>Key</th>
                <th className='w-20 px-5 py-3' />
              </tr>
            </thead>
            <tbody className='divide-y'>
              {visibleSets.map((set) => (
                <tr key={set.key} className='hover:bg-muted/30'>
                  <td className='px-5 py-4'>
                    <button
                      className='font-medium text-primary hover:underline'
                      type='button'
                      onClick={() => void open(set)}
                    >
                      {set.title ?? humanize(set.key)}
                    </button>
                    <p className='mt-0.5 text-xs text-muted-foreground'>
                      {describeSet(set)}
                    </p>
                  </td>
                  <td className='px-5 py-4'>
                    <Badge
                      tone={
                        set.key === 'system-administrator'
                          ? 'protected'
                          : 'neutral'
                      }
                    >
                      {set.key === 'system-administrator' ? 'System' : 'Custom'}
                    </Badge>
                  </td>
                  <td className='px-5 py-4 tabular-nums'>
                    {permissionCount(set)}
                  </td>
                  <td className='px-5 py-4 font-mono text-xs text-muted-foreground'>
                    {set.key}
                  </td>
                  <td className='px-5 py-4 text-right'>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => void open(set)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {visibleSets.length === 0 ? (
                <EmptyTableRow colSpan={5}>
                  No permission sets match your search.
                </EmptyTableRow>
              ) : null}
            </tbody>
          </table>
        </ManagementTable>
        {editorDraft ? (
          <PermissionSetEditor
            options={options}
            draft={editorDraft}
            busy={busy}
            onChange={setEditorDraft}
            onSave={save}
            onClose={closeEditor}
          />
        ) : null}
      </>
    );
  }

  const protectedSet = draft.originalKey === 'system-administrator';
  return (
    <div className='space-y-5'>
      {error ? <ErrorBox value={error} /> : null}
      <DetailHeader
        onBack={() => setDraft(undefined)}
        title={draft.title || humanize(draft.key) || 'New permission set'}
        subtitle={detailSummary(draft, assignments)}
        badge={
          protectedSet ? (
            <Badge tone='protected'>Protected system set</Badge>
          ) : (
            <Badge tone='neutral'>Custom</Badge>
          )
        }
        actions={
          <>
            <Button variant='outline' onClick={edit}>
              Edit
            </Button>
            {draft.originalKey && !protectedSet ? (
              <Button
                className='text-destructive hover:text-destructive'
                variant='ghost'
                disabled={busy}
                onClick={() => void remove()}
              >
                Delete
              </Button>
            ) : null}
          </>
        }
      />
      {protectedSet ? (
        <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
          Required administration permissions and assignments are preserved so
          administrators cannot be locked out.
        </div>
      ) : null}
      <DetailTabs
        value={section}
        onChange={(value) => setSection(value as DetailSection)}
        items={[
          {
            value: 'permissions',
            label: 'Permissions',
            count: permissionCountFromDraft(draft),
          },
          {
            value: 'assignments',
            label: 'Assignments',
            count: assignments.length,
          },
        ]}
      />
      {section === 'permissions' ? (
        <PermissionsSummary options={options} draft={draft} onEdit={edit} />
      ) : null}
      {section === 'assignments' ? (
        <Assignments
          users={users}
          assignments={assignments}
          protectedSet={protectedSet}
          busy={busy}
          onAssign={assign}
          onRevoke={revoke}
        />
      ) : null}
      {editorOpen && editorDraft ? (
        <PermissionSetEditor
          options={options}
          draft={editorDraft}
          busy={busy}
          onChange={setEditorDraft}
          onSave={save}
          onClose={closeEditor}
        />
      ) : null}
    </div>
  );
}

function PermissionsSummary({
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
        <div className='flex flex-wrap gap-2'>
          <Input
            className='w-64'
            type='search'
            placeholder='Search resources or actions'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label='Resource type'
            className='h-9 rounded-md border bg-background px-3 text-sm'
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
          <Button size='sm' onClick={onEdit}>
            Edit permissions
          </Button>
        </div>
      </div>
      <table className='w-full min-w-[42rem] text-left text-sm'>
        <thead className='border-b bg-muted/30 text-xs text-muted-foreground uppercase'>
          <tr>
            <th className='px-5 py-3 font-medium'>Category</th>
            <th className='px-5 py-3 font-medium'>Resource</th>
            <th className='px-5 py-3 font-medium'>Actions</th>
            <th className='px-5 py-3 font-medium'>Record access</th>
          </tr>
        </thead>
        <tbody className='divide-y'>
          {visible.map((grant) => (
            <tr
              className='cursor-pointer hover:bg-muted/20'
              key={grant.id}
              onClick={() => setSelected(grant.id)}
            >
              <td className='px-5 py-4'>
                {resourceTypeLabel(options, grant.resource.type)}
              </td>
              <td className='px-5 py-4 font-medium'>
                {resourceLabel(options, grant.resource)}
              </td>
              <td className='px-5 py-4'>
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
              </td>
              <td className='px-5 py-4 text-muted-foreground'>
                {grant.resource.type === 'database.collection'
                  ? databaseAccessSummary(grant)
                  : '—'}
              </td>
            </tr>
          ))}
          {visible.length === 0 ? (
            <EmptyTableRow colSpan={4}>
              No permissions match these filters.
            </EmptyTableRow>
          ) : null}
        </tbody>
      </table>
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

function Assignments({
  users,
  assignments,
  protectedSet,
  busy,
  onAssign,
  onRevoke,
}: {
  users: readonly AuthorizationUser[];
  assignments: readonly PermissionSetAssignment[];
  protectedSet: boolean;
  busy: boolean;
  onAssign: (subjects: readonly AuthorizationSubject[]) => Promise<void>;
  onRevoke: (ids: readonly string[]) => Promise<void>;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const query = search.trim().toLowerCase();
  const visible = assignments.filter((item) => {
    const label = subjectLabel(item.subject, users).toLowerCase();
    const itemKind =
      item.subject.type === 'authenticated' ? 'audience' : 'user';
    return (
      (kind === 'all' || kind === itemKind) && (!query || label.includes(query))
    );
  });
  function toggle(id: string, checked: boolean): void {
    setSelected((items) =>
      checked ? [...items, id] : items.filter((item) => item !== id),
    );
  }
  return (
    <ManagementTable>
      <div className='flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap gap-2'>
          <Input
            className='w-64'
            type='search'
            placeholder='Search name, username, or email'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label='Assignment type'
            className='h-9 rounded-md border bg-background px-3 text-sm'
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value='all'>All assignments</option>
            <option value='user'>Users</option>
            <option value='audience'>Audiences</option>
          </select>
        </div>
        <div className='flex gap-2'>
          {selected.length > 0 ? (
            <Button
              variant='outline'
              disabled={busy || protectedSet}
              onClick={() =>
                void onRevoke(selected).then(() => setSelected([]))
              }
            >
              Revoke selected ({selected.length})
            </Button>
          ) : null}
          <Button disabled={protectedSet} onClick={() => setAddOpen(true)}>
            Add assignments
          </Button>
        </div>
      </div>
      <table className='w-full text-left text-sm'>
        <thead className='border-b bg-muted/30 text-xs text-muted-foreground uppercase'>
          <tr>
            <th className='w-12 px-5 py-3'>
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
            </th>
            <th className='px-5 py-3 font-medium'>Assigned to</th>
            <th className='px-5 py-3 font-medium'>Subject type</th>
            <th className='w-24 px-5 py-3' />
          </tr>
        </thead>
        <tbody className='divide-y'>
          {visible.map((item) => (
            <tr key={item.id}>
              <td className='px-5 py-4'>
                <input
                  aria-label={`Select ${subjectLabel(item.subject, users)}`}
                  type='checkbox'
                  checked={selected.includes(item.id)}
                  onChange={(event) => toggle(item.id, event.target.checked)}
                />
              </td>
              <td className='px-5 py-4 font-medium'>
                {subjectLabel(item.subject, users)}
              </td>
              <td className='px-5 py-4 text-muted-foreground'>
                {item.subject.type === 'authenticated' ? 'Audience' : 'User'}
              </td>
              <td className='px-5 py-4 text-right'>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={protectedSet}
                  onClick={() => void onRevoke([item.id])}
                >
                  Revoke
                </Button>
              </td>
            </tr>
          ))}
          {visible.length === 0 ? (
            <EmptyTableRow colSpan={4}>
              {assignments.length === 0
                ? 'This permission set has no assignments.'
                : 'No assignments match these filters.'}
            </EmptyTableRow>
          ) : null}
        </tbody>
      </table>
      {addOpen ? (
        <AssignmentPicker
          users={users}
          assignments={assignments}
          busy={busy}
          onClose={() => setAddOpen(false)}
          onAdd={(subjects) =>
            void onAssign(subjects).then(() => setAddOpen(false))
          }
        />
      ) : null}
    </ManagementTable>
  );
}

function AssignmentPicker({
  users,
  assignments,
  busy,
  onClose,
  onAdd,
}: {
  users: readonly AuthorizationUser[];
  assignments: readonly PermissionSetAssignment[];
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
  const visible = users.filter(
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
          <Input
            className='mt-3'
            type='search'
            placeholder='Search name, username, or email'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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

function PermissionSetEditor({
  options,
  draft,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  options: AuthorizationOptions;
  draft: Draft;
  busy: boolean;
  onChange: (value: Draft) => void;
  onSave: (event: FormEvent) => Promise<void>;
  onClose: () => void;
}): ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceType, setResourceType] = useState('all');
  const [expanded, setExpanded] = useState<number>();
  const query = resourceSearch.trim().toLowerCase();
  const visibleIndexes = draft.grants
    .map((grant, index) => ({ grant, index }))
    .filter(
      ({ grant }) =>
        (resourceType === 'all' || grant.resource.type === resourceType) &&
        (!query ||
          [
            grant.resource.id,
            resourceLabel(options, grant.resource),
            ...grant.actions,
          ].some((value) => value.toLowerCase().includes(query))),
    );

  function changeGrant(index: number, change: Partial<GrantDraft>): void {
    onChange({
      ...draft,
      grants: draft.grants.map((grant, current) =>
        current === index ? { ...grant, ...change } : grant,
      ),
    });
  }
  return (
    <SidePanel
      title={draft.originalKey ? 'Edit permission set' : 'New permission set'}
      description='Bundle access into a reusable assignment.'
      onClose={onClose}
      wide
    >
      <form className='space-y-6' onSubmit={(event) => void onSave(event)}>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Name'>
            <Input
              required
              value={draft.title}
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
            />
          </Field>
          <Field label='Key' hint='Stable identifier used by APIs.'>
            <Input
              required
              disabled={Boolean(draft.originalKey)}
              value={draft.key}
              onChange={(event) =>
                onChange({ ...draft, key: event.target.value })
              }
            />
          </Field>
        </div>
        <div className='flex items-center justify-between border-t pt-5'>
          <div>
            <h3 className='font-medium'>Permissions</h3>
            <p className='text-sm text-muted-foreground'>
              Choose resources and the actions this set grants.
            </p>
          </div>
          <Button
            size='sm'
            type='button'
            variant='outline'
            onClick={() => setPickerOpen(true)}
          >
            Add permission
          </Button>
        </div>
        <div className='flex flex-wrap gap-2 border-b pb-4'>
          <Input
            className='w-64'
            type='search'
            placeholder='Search resources or actions'
            value={resourceSearch}
            onChange={(event) => setResourceSearch(event.target.value)}
          />
          <select
            aria-label='Permission resource type'
            className='h-9 rounded-md border bg-background px-3 text-sm'
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
          >
            <option value='all'>All resource types</option>
            {options.resourceTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className='self-center text-xs text-muted-foreground'>
            {visibleIndexes.length} of {draft.grants.length} resources
          </span>
        </div>
        <div className='space-y-3'>
          {visibleIndexes.map(({ grant, index }) => (
            <section
              className='overflow-hidden rounded-lg border'
              key={grant.id}
            >
              <button
                className='flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/20'
                type='button'
                onClick={() =>
                  setExpanded(expanded === grant.id ? undefined : grant.id)
                }
              >
                <span className='min-w-0'>
                  <span className='flex items-center gap-2'>
                    <span className='truncate text-sm font-medium'>
                      {resourceLabel(options, grant.resource)}
                    </span>
                    <span className='rounded-md bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground'>
                      {resourceTypeLabel(options, grant.resource.type)}
                    </span>
                  </span>
                  <span className='mt-1 block truncate text-xs text-muted-foreground'>
                    {grant.resource.id} ·{' '}
                    {grant.actions.map(humanize).join(', ') || 'No actions'}
                  </span>
                </span>
                <span className='flex shrink-0 items-center gap-3'>
                  {grant.resource.type === 'database.collection' ? (
                    <span className='hidden text-xs text-muted-foreground sm:inline'>
                      {databaseAccessSummary(grant)}
                    </span>
                  ) : null}
                  <span className='text-muted-foreground'>
                    {expanded === grant.id ? '−' : '+'}
                  </span>
                </span>
              </button>
              {expanded === grant.id ? (
                <div className='space-y-4 border-t p-4'>
                  <div className='flex justify-end'>
                    <Button
                      size='sm'
                      type='button'
                      variant='ghost'
                      onClick={() =>
                        onChange({
                          ...draft,
                          grants: draft.grants.filter(
                            (_item, current) => current !== index,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <ActionsEditor
                    options={options}
                    resourceType={grant.resource.type}
                    resourceId={grant.resource.id}
                    value={grant.actions}
                    onChange={(actions) =>
                      changeGrant(index, {
                        actions,
                        database: syncDatabaseActions(
                          options,
                          grant.database,
                          actions,
                        ),
                      })
                    }
                  />
                  {grant.resource.type === 'database.collection' ? (
                    <DatabasePolicyEditor
                      options={options}
                      grant={grant}
                      onChange={(database) => changeGrant(index, { database })}
                    />
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
          {visibleIndexes.length === 0 && draft.grants.length > 0 ? (
            <p className='rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
              No permissions match these filters.
            </p>
          ) : null}
          {draft.grants.length === 0 ? (
            <button
              className='w-full rounded-lg border border-dashed px-5 py-10 text-center hover:border-primary/50 hover:bg-muted/20'
              type='button'
              onClick={() => setPickerOpen(true)}
            >
              <span className='block text-sm font-medium'>
                Add the first permission
              </span>
              <span className='mt-1 block text-xs text-muted-foreground'>
                Select resources by type, then configure their actions.
              </span>
            </button>
          ) : null}
        </div>
        <div className='sticky bottom-0 flex justify-end gap-2 border-t bg-background py-4'>
          <Button type='button' variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} type='submit'>
            {busy ? 'Saving…' : 'Save permission set'}
          </Button>
        </div>
      </form>
      {pickerOpen ? (
        <PermissionResourcePicker
          options={options}
          grants={draft.grants}
          onClose={() => setPickerOpen(false)}
          onAdd={(grants) => {
            onChange({
              ...draft,
              grants: [...draft.grants, ...grants],
            });
            setPickerOpen(false);
          }}
        />
      ) : null}
    </SidePanel>
  );
}

function PermissionResourcePicker({
  options,
  grants,
  onClose,
  onAdd,
}: {
  options: AuthorizationOptions;
  grants: readonly GrantDraft[];
  onClose: () => void;
  onAdd: (grants: readonly GrantDraft[]) => void;
}): ReactElement {
  const [type, setType] = useState(options.resourceTypes[0]?.value ?? '');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<readonly GrantDraft[]>([]);
  const [active, setActive] = useState<string>();
  const resourceType = options.resourceTypes.find(
    (item) => item.value === type,
  );
  const query = search.trim().toLowerCase();
  const resources = (resourceType?.resources ?? []).filter(
    (resource) =>
      !query ||
      [resource.label, resource.value, resource.description].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );
  const existing = new Set(
    grants.map((grant) => resourceKey(grant.resource.type, grant.resource.id)),
  );
  const activeGrant = pending.find(
    (grant) => resourceKey(grant.resource.type, grant.resource.id) === active,
  );
  const incomplete = pending.some((grant) => grant.actions.length === 0);

  function selectResource(resourceId: string): void {
    const key = resourceKey(type, resourceId);
    if (existing.has(key)) return;
    setPending((items) =>
      items.some(
        (item) => resourceKey(item.resource.type, item.resource.id) === key,
      )
        ? items
        : [...items, newGrantForResource(type, resourceId)],
    );
    setActive(key);
  }

  function toggleResource(resourceId: string, checked: boolean): void {
    const key = resourceKey(type, resourceId);
    if (checked) {
      selectResource(resourceId);
      return;
    }
    setPending((items) =>
      items.filter(
        (item) => resourceKey(item.resource.type, item.resource.id) !== key,
      ),
    );
    if (active === key) setActive(undefined);
  }

  function updateActive(change: Partial<GrantDraft>): void {
    if (!activeGrant) return;
    const key = resourceKey(activeGrant.resource.type, activeGrant.resource.id);
    setPending((items) =>
      items.map((item) =>
        resourceKey(item.resource.type, item.resource.id) === key
          ? { ...item, ...change }
          : item,
      ),
    );
  }

  return (
    <SidePanel
      title='Add permissions'
      description='Select resources and configure their access in one workspace.'
      onClose={onClose}
      wide
    >
      <div className='overflow-hidden rounded-xl border bg-card'>
        <div className='grid min-h-[34rem] grid-cols-[13rem_18rem_minmax(0,1fr)]'>
          <nav
            className='border-r bg-muted/20 py-3'
            aria-label='Resource types'
          >
            <p className='px-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              Resource types
            </p>
            {options.resourceTypes.map((item) => {
              const count = pending.filter(
                (grant) => grant.resource.type === item.value,
              ).length;
              return (
                <button
                  className={`flex w-full items-center justify-between border-l-2 px-4 py-2.5 text-left text-sm ${item.value === type ? 'border-primary bg-background font-medium text-foreground' : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}
                  key={item.value}
                  type='button'
                  onClick={() => {
                    setType(item.value);
                    setSearch('');
                    const first = pending.find(
                      (grant) => grant.resource.type === item.value,
                    );
                    setActive(
                      first
                        ? resourceKey(first.resource.type, first.resource.id)
                        : undefined,
                    );
                  }}
                >
                  <span>{item.label}</span>
                  {count > 0 ? (
                    <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <section className='border-r'>
            <div className='space-y-3 border-b p-3'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {resourceType?.label ?? 'Resources'}
                </h3>
                <p className='text-xs text-muted-foreground'>
                  Select a resource to configure it.
                </p>
              </div>
              <Input
                placeholder='Search resources'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className='divide-y overflow-y-auto'>
              {resources.map((resource) => {
                const key = resourceKey(type, resource.value);
                const disabled = existing.has(key);
                const selected = pending.some(
                  (grant) =>
                    resourceKey(grant.resource.type, grant.resource.id) === key,
                );
                return (
                  <button
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left ${active === key ? 'bg-primary/5' : 'hover:bg-muted/20'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={disabled}
                    key={resource.value}
                    type='button'
                    onClick={() => selectResource(resource.value)}
                  >
                    <input
                      className='mt-0.5'
                      type='checkbox'
                      checked={disabled || selected}
                      disabled={disabled}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        toggleResource(resource.value, event.target.checked)
                      }
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-center gap-2'>
                        <span className='truncate text-sm font-medium'>
                          {resource.label}
                        </span>
                        {disabled ? (
                          <span className='rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground'>
                            Added
                          </span>
                        ) : null}
                      </span>
                      <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                        {resource.value}
                      </span>
                      {resource.description ? (
                        <span className='mt-1 line-clamp-2 block text-xs text-muted-foreground'>
                          {resource.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
              {resources.length === 0 ? (
                <p className='px-4 py-10 text-center text-sm text-muted-foreground'>
                  No resources match your search.
                </p>
              ) : null}
            </div>
          </section>

          <section className='min-w-0 p-5'>
            {activeGrant ? (
              <div className='space-y-5'>
                <div className='border-b pb-4'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {resourceTypeLabel(options, activeGrant.resource.type)}
                  </p>
                  <h3 className='mt-1 text-lg font-semibold'>
                    {resourceLabel(options, activeGrant.resource)}
                  </h3>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {activeGrant.resource.id}
                  </p>
                </div>
                <ActionsEditor
                  options={options}
                  resourceType={activeGrant.resource.type}
                  resourceId={activeGrant.resource.id}
                  value={activeGrant.actions}
                  onChange={(actions) =>
                    updateActive({
                      actions,
                      database: syncDatabaseActions(
                        options,
                        activeGrant.database,
                        actions,
                      ),
                    })
                  }
                />
                {activeGrant.resource.type === 'database.collection' ? (
                  <DatabasePolicyEditor
                    options={options}
                    grant={activeGrant}
                    onChange={(database) => updateActive({ database })}
                  />
                ) : null}
              </div>
            ) : (
              <div className='flex h-full items-center justify-center text-center'>
                <div className='max-w-xs'>
                  <p className='text-sm font-medium'>
                    Select a resource to configure
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Its actions and resource-specific access settings will
                    appear here.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        <div className='flex items-center justify-between border-t bg-background px-4 py-3'>
          <p className='text-sm text-muted-foreground'>
            {pending.length} resource{pending.length === 1 ? '' : 's'} ready to
            add
            {incomplete
              ? ' · Select at least one action for each resource'
              : ''}
          </p>
          <div className='flex gap-2'>
            <Button type='button' variant='outline' onClick={onClose}>
              Cancel
            </Button>
            <Button
              type='button'
              disabled={pending.length === 0 || incomplete}
              onClick={() => onAdd(pending)}
            >
              Add permissions
            </Button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

function DatabasePolicyEditor({
  options,
  grant,
  onChange,
}: {
  options: AuthorizationOptions;
  grant: GrantDraft;
  onChange: (value: Readonly<Record<string, DatabaseActionDraft>>) => void;
}): ReactElement {
  const fields = collectionFields(options, grant.resource.id);
  const [activeAction, setActiveAction] = useState(grant.actions[0] ?? '');
  const currentAction = grant.actions.includes(activeAction)
    ? activeAction
    : (grant.actions[0] ?? '');
  const value =
    grant.database[currentAction] ?? defaultDatabaseActionDraft(options);
  return (
    <section className='rounded-lg border'>
      <header className='flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2.5'>
        <div>
          <h4 className='text-sm font-medium'>Data access</h4>
          <p className='text-xs text-muted-foreground'>
            Configure one action at a time
          </p>
        </div>
        <div className='flex flex-wrap gap-1 rounded-md border bg-background p-1'>
          {grant.actions.map((action) => (
            <button
              className={`rounded px-2.5 py-1 text-xs font-medium ${currentAction === action ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              key={action}
              type='button'
              onClick={() => setActiveAction(action)}
            >
              {humanize(action)}
            </button>
          ))}
        </div>
      </header>
      {currentAction ? (
        <DatabaseActionPolicyEditor
          action={currentAction}
          fields={fields}
          options={options}
          value={value}
          onChange={(next) =>
            onChange({ ...grant.database, [currentAction]: next })
          }
        />
      ) : (
        <p className='px-4 py-5 text-sm text-muted-foreground'>
          Select an action before configuring data access.
        </p>
      )}
    </section>
  );
}

function DatabaseActionPolicyEditor({
  action,
  fields,
  options,
  value,
  onChange,
}: {
  action: string;
  fields: readonly string[];
  options: AuthorizationOptions;
  value: DatabaseActionDraft;
  onChange: (value: DatabaseActionDraft) => void;
}): ReactElement {
  const input = action === 'create' || action === 'update';
  const output =
    action === 'create' || action === 'read' || action === 'update';
  const recordAccess = action !== 'create';
  return (
    <div className='space-y-4 p-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h5 className='text-sm font-medium'>{humanize(action)} access</h5>
          <p className='text-xs text-muted-foreground'>
            {databaseActionDescription(action)}
          </p>
        </div>
        <span className='text-xs text-muted-foreground'>
          {databaseActionSummary(action, value)}
        </span>
      </div>
      {input || output ? (
        <div className='grid gap-3 sm:grid-cols-2'>
          {input ? (
            <FieldChecklist
              label='Writable fields'
              fields={fields}
              value={value.input}
              onChange={(next) => onChange({ ...value, input: next })}
            />
          ) : null}
          {output ? (
            <FieldChecklist
              label='Visible fields'
              fields={fields}
              value={value.output}
              onChange={(next) => onChange({ ...value, output: next })}
            />
          ) : null}
        </div>
      ) : null}
      {recordAccess ? (
        <RecordAccessEditor
          action={action}
          fields={fields}
          options={options}
          value={value.recordAccess}
          onChange={(recordAccess) => onChange({ ...value, recordAccess })}
        />
      ) : null}
    </div>
  );
}

function databaseActionDescription(action: string): string {
  switch (action) {
    case 'create':
      return 'Choose fields that can be submitted and returned.';
    case 'read':
      return 'Choose visible fields and which records can be read.';
    case 'update':
      return 'Choose editable fields and which records can be updated.';
    case 'delete':
      return 'Choose which records can be deleted.';
    default:
      return 'Configure fields and record access for this action.';
  }
}

function databaseActionSummary(
  action: string,
  value: DatabaseActionDraft,
): string {
  const parts: string[] = [];
  if (action === 'create' || action === 'update')
    parts.push(`${fieldSelectionLabel(value.input)} writable`);
  if (action === 'create' || action === 'read' || action === 'update')
    parts.push(`${fieldSelectionLabel(value.output)} visible`);
  if (action !== 'create')
    parts.push(humanize(recordAccessKey(value.recordAccess)));
  return parts.join(' · ');
}

function RecordAccessEditor({
  action,
  fields,
  options,
  value,
  onChange,
}: {
  action: string;
  fields: readonly string[];
  options: AuthorizationOptions;
  value: RecordAccessDraft;
  onChange: (value: RecordAccessDraft) => void;
}): ReactElement {
  const key = recordAccessKey(value);
  const conditions = customFilterConditions(value);
  function updateConditions(next: readonly FilterConditionDraft[]): void {
    onChange({
      key: 'customFilter',
      params: { filter: filterFromConditions(next) },
    });
  }
  return (
    <div className='space-y-3'>
      <Field label='Record access'>
        <select
          aria-label={`${humanize(action)} record access`}
          className='h-9 w-full rounded-md border bg-background px-2.5 text-sm'
          value={key}
          onChange={(event) =>
            onChange(
              event.target.value === 'customFilter'
                ? {
                    key: 'customFilter',
                    params: { filter: { $and: [] } },
                  }
                : event.target.value,
            )
          }
        >
          {options.recordAccessPolicies.map((policy) => (
            <option key={policy.value} value={policy.value}>
              {policy.label}
            </option>
          ))}
        </select>
      </Field>
      {key === 'customFilter' ? (
        <div className='space-y-2 rounded-md border bg-muted/10 p-3'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <p className='text-xs font-medium'>Filter conditions</p>
              <p className='text-xs text-muted-foreground'>
                All conditions must match.
              </p>
            </div>
            <Button
              size='sm'
              type='button'
              variant='outline'
              onClick={() =>
                updateConditions([
                  ...conditions,
                  {
                    id: ++nextId,
                    field: fields[0] ?? '',
                    operator: '$eq',
                    value: '',
                  },
                ])
              }
            >
              Add condition
            </Button>
          </div>
          {conditions.map((condition, index) => (
            <div
              className='grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]'
              key={condition.id}
            >
              <select
                aria-label='Filter field'
                className='h-9 rounded-md border bg-background px-2 text-sm'
                value={condition.field}
                onChange={(event) =>
                  updateConditions(
                    conditions.map((item, current) =>
                      current === index
                        ? { ...item, field: event.target.value }
                        : item,
                    ),
                  )
                }
              >
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              <select
                aria-label='Filter operator'
                className='h-9 rounded-md border bg-background px-2 text-sm'
                value={condition.operator}
                onChange={(event) =>
                  updateConditions(
                    conditions.map((item, current) =>
                      current === index
                        ? {
                            ...item,
                            operator: event.target
                              .value as FilterConditionDraft['operator'],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value='$eq'>Equals</option>
                <option value='$ne'>Not equal</option>
                <option value='$in'>In</option>
                <option value='$notIn'>Not in</option>
                <option value='$gt'>Greater than</option>
                <option value='$gte'>At least</option>
                <option value='$lt'>Less than</option>
                <option value='$lte'>At most</option>
              </select>
              <Input
                aria-label='Filter value'
                value={condition.value}
                onChange={(event) =>
                  updateConditions(
                    conditions.map((item, current) =>
                      current === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                aria-label='Remove condition'
                size='sm'
                type='button'
                variant='ghost'
                onClick={() =>
                  updateConditions(
                    conditions.filter((_item, current) => current !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {conditions.length === 0 ? (
            <p className='py-2 text-xs text-muted-foreground'>
              Add at least one condition.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function recordAccessKey(value: RecordAccessDraft): string {
  return typeof value === 'string' ? value : value.key;
}

function customFilterConditions(
  value: RecordAccessDraft,
): readonly FilterConditionDraft[] {
  if (typeof value === 'string' || value.key !== 'customFilter') return [];
  const params = readRecord(value.params);
  const filter = readRecord(params?.filter);
  const items = readArray(filter?.$and) ?? [];
  return items.flatMap((item, index) => {
    const condition = readRecord(item);
    const entry = condition ? Object.entries(condition)[0] : undefined;
    const expression = readRecord(entry?.[1]);
    const operation = expression ? Object.entries(expression)[0] : undefined;
    if (!entry || !operation) return [];
    return [
      {
        id: index + 1,
        field: entry[0],
        operator: operation[0] as FilterConditionDraft['operator'],
        value: Array.isArray(operation[1])
          ? operation[1].join(', ')
          : filterValueText(operation[1]),
      },
    ];
  });
}

function filterValueText(value: unknown): string {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function isRecordAccessValue(value: unknown): value is RecordAccessDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'key') === 'string'
  );
}

function filterFromConditions(
  conditions: readonly FilterConditionDraft[],
): Readonly<Record<string, unknown>> {
  return {
    $and: conditions.map((condition) => ({
      [condition.field]: {
        [condition.operator]:
          condition.operator === '$in' || condition.operator === '$notIn'
            ? condition.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : condition.value,
      },
    })),
  };
}

function fieldSelectionLabel(value: '*' | readonly string[]): string {
  return value === '*' ? 'All fields' : `${value.length} fields`;
}

function FieldChecklist({
  label,
  fields,
  value,
  onChange,
}: {
  label: string;
  fields: readonly string[];
  value: '*' | readonly string[];
  onChange: (value: '*' | readonly string[]) => void;
}): ReactElement {
  return (
    <Field label={label}>
      <div className='rounded-md border bg-background p-2.5'>
        <label className='flex cursor-pointer items-center gap-2 border-b pb-2 text-xs font-medium'>
          <input
            type='checkbox'
            checked={value === '*'}
            onChange={(event) => onChange(event.target.checked ? '*' : [])}
          />
          All fields
        </label>
        <div className='mt-2 grid max-h-32 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto'>
          {fields.map((field) => (
            <label
              className={`flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/30 ${value === '*' ? 'text-muted-foreground' : ''}`}
              key={field}
            >
              <input
                aria-label={`${label}: ${field}`}
                type='checkbox'
                checked={value === '*' || value.includes(field)}
                disabled={value === '*'}
                onChange={(event) =>
                  onChange(
                    value === '*'
                      ? []
                      : event.target.checked
                        ? [...value, field]
                        : value.filter((item) => item !== field),
                  )
                }
              />
              <span className='truncate'>{field}</span>
            </label>
          ))}
        </div>
      </div>
    </Field>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'neutral' | 'protected';
  children: string;
}): ReactElement {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone === 'protected' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}
    >
      {children}
    </span>
  );
}
function toInput(draft: Draft): {
  key: string;
  title?: string;
  grants: readonly PermissionGrant[];
} {
  return {
    key: draft.key.trim(),
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    grants: draft.grants.map((grant) => ({
      resource: grant.resource,
      actions: grant.actions.map((action) =>
        grant.resource.type === 'database.collection'
          ? {
              action,
              policy: databasePolicyForAction(
                action,
                grant.database[action] ?? defaultDatabaseActionDraft(),
              ),
            }
          : { action },
      ),
    })),
  };
}
function newGrantForResource(type: string, id: string): GrantDraft {
  return {
    id: ++nextId,
    resource: {
      type,
      id,
    },
    actions: [],
    database: {},
  };
}
function empty(): Draft {
  return { key: '', title: '', grants: [] };
}

function hasEmptyCustomFilter(draft: Draft): boolean {
  return draft.grants.some((grant) =>
    Object.values(grant.database).some((value) => {
      if (recordAccessKey(value.recordAccess) !== 'customFilter') return false;
      const conditions = customFilterConditions(value.recordAccess);
      return conditions.length === 0 || conditions.some((item) => !item.field);
    }),
  );
}
function fromSet(set: PermissionSet): Draft {
  return {
    originalKey: set.key,
    key: set.key,
    title: set.title ?? '',
    grants: set.grants.map((grant) => {
      return {
        id: ++nextId,
        resource: grant.resource,
        actions: grant.actions.map((action) => action.action),
        database: Object.fromEntries(
          grant.actions.map((action) => [
            action.action,
            databaseActionFromPolicy(action.policy),
          ]),
        ),
      };
    }),
  };
}
function cloneDraft(draft: Draft): Draft {
  return {
    ...draft,
    grants: draft.grants.map((grant) => ({
      ...grant,
      resource: { ...grant.resource },
      actions: [...grant.actions],
      database: Object.fromEntries(
        Object.entries(grant.database).map(([action, value]) => [
          action,
          {
            ...value,
            input: value.input === '*' ? '*' : [...value.input],
            output: value.output === '*' ? '*' : [...value.output],
          },
        ]),
      ),
    })),
  };
}

function defaultDatabaseActionDraft(
  options?: AuthorizationOptions,
): DatabaseActionDraft {
  return {
    input: '*',
    output: '*',
    recordAccess: options?.recordAccessPolicies[0]?.value ?? 'allRecords',
  };
}

function syncDatabaseActions(
  options: AuthorizationOptions,
  current: Readonly<Record<string, DatabaseActionDraft>>,
  actions: readonly string[],
): Readonly<Record<string, DatabaseActionDraft>> {
  return Object.fromEntries(
    actions.map((action) => [
      action,
      current[action] ?? defaultDatabaseActionDraft(options),
    ]),
  );
}

function databasePolicyForAction(
  action: string,
  value: DatabaseActionDraft,
): Readonly<Record<string, unknown>> & { type: string } {
  const fields = {
    ...(action === 'create' || action === 'update'
      ? { input: value.input }
      : {}),
    ...(action === 'create' || action === 'read' || action === 'update'
      ? { output: value.output }
      : {}),
  };
  return {
    type: 'database',
    ...(Object.keys(fields).length === 0 ? {} : { fields }),
    ...(action === 'create' ? {} : { recordAccess: [value.recordAccess] }),
  };
}

function databaseActionFromPolicy(
  policy: (Readonly<Record<string, unknown>> & { type: string }) | undefined,
): DatabaseActionDraft {
  const fields = readRecord(policy?.fields);
  const recordAccess = readArray(policy?.recordAccess)?.[0];
  return {
    input: readFields(fields?.input),
    output: readFields(fields?.output),
    recordAccess:
      typeof recordAccess === 'string' || isRecordAccessValue(recordAccess)
        ? recordAccess
        : 'allRecords',
  };
}

function databaseAccessSummary(grant: GrantDraft): string {
  return grant.actions
    .map((action) => {
      const value = grant.database[action] ?? defaultDatabaseActionDraft();
      return `${humanize(action)}: ${action === 'create' ? 'new records' : humanize(recordAccessKey(value.recordAccess))}`;
    })
    .join(', ');
}
function resourceKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}
function collectionFields(
  options: AuthorizationOptions,
  name: string,
): readonly string[] {
  return (
    options.collections.find((collection) => collection.name === name)
      ?.fields ?? []
  );
}
function permissionCount(set: PermissionSet): number {
  return set.grants.reduce((sum, grant) => sum + grant.actions.length, 0);
}
function permissionCountFromDraft(draft: Draft): number {
  return draft.grants.reduce((sum, grant) => sum + grant.actions.length, 0);
}
function describeSet(set: PermissionSet): string {
  return set.key === 'system-administrator'
    ? 'Protected access to Authorization administration'
    : `${set.grants.length} configured resource${set.grants.length === 1 ? '' : 's'}`;
}
function detailSummary(
  draft: Draft,
  assignments: readonly PermissionSetAssignment[],
): string {
  const categories = new Set(draft.grants.map((grant) => grant.resource.type));
  return `Key: ${draft.key} · ${permissionCountFromDraft(draft)} permissions · ${categories.size} resource ${categories.size === 1 ? 'type' : 'types'} · ${assignments.length} ${assignments.length === 1 ? 'assignment' : 'assignments'}`;
}
function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function resourceTypeLabel(
  options: AuthorizationOptions,
  type: string,
): string {
  return (
    options.resourceTypes.find((item) => item.value === type)?.label ??
    humanize(type)
  );
}
function resourceLabel(
  options: AuthorizationOptions,
  resource: { type: string; id: string },
): string {
  return (
    options.resourceTypes
      .find((item) => item.value === resource.type)
      ?.resources.find((item) => item.value === resource.id)?.label ??
    resource.id
  );
}
function readRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
function readFields(value: unknown): '*' | readonly string[] {
  return value === '*' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    ? value
    : '*';
}
function readArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
function subjectLabel(
  subject: AuthorizationSubject,
  users: readonly AuthorizationUser[],
): string {
  if (subject.type === 'authenticated') return 'All signed-in users';
  const user = users.find((item) => item.id === subject.id);
  return user
    ? `${user.name} · ${user.username ?? user.email}`
    : `User ${subject.id}`;
}
