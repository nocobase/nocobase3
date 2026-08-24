import { Button, Input, Label } from '@nocobase/app-client/ui';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import type {
  PermissionGrant,
  PermissionSet,
  PermissionSetAssignment,
  PermissionSetInput,
} from '../authorization-client.js';
import { getAuthorizationClient } from '../runtime.js';

const authz = getAuthorizationClient();

interface PermissionSetDraft {
  originalKey?: string;
  key: string;
  title: string;
  grants: GrantDraft[];
}

interface GrantDraft {
  id: string;
  resourceType: string;
  resourceId: string;
  actions: string;
}

let nextGrantDraftId = 0;

export default function PermissionSetsPage(): ReactElement {
  const [sets, setSets] = useState<readonly PermissionSet[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [draft, setDraft] = useState<PermissionSetDraft>(createEmptyDraft);
  const [assignments, setAssignments] = useState<
    readonly PermissionSetAssignment[]
  >([]);
  const [subjectType, setSubjectType] = useState('authenticated');
  const [subjectId, setSubjectId] = useState('*');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (preferredKey?: string): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const nextSets = await authz.listPermissionSets();
      setSets(nextSets);
      const nextSelected =
        nextSets.find((set) => set.key === preferredKey) ?? nextSets[0];
      setSelectedKey(nextSelected?.key);
      setDraft(
        nextSelected ? permissionSetDraft(nextSelected) : createEmptyDraft(),
      );
      setAssignments(
        nextSelected ? await authz.listAssignments(nextSelected.key) : [],
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function selectPermissionSet(set: PermissionSet): Promise<void> {
    setSelectedKey(set.key);
    setDraft(permissionSetDraft(set));
    setAssignments([]);
    setError(undefined);
    try {
      setAssignments(await authz.listAssignments(set.key));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const input = permissionSetInput(draft);
      if (draft.originalKey) {
        await authz.updatePermissionSet(draft.originalKey, input);
      } else {
        await authz.createPermissionSet(input);
      }
      authz.invalidatePermissions();
      await load(input.key);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!draft.originalKey) return;
    setSaving(true);
    setError(undefined);
    try {
      await authz.deletePermissionSet(draft.originalKey);
      authz.invalidatePermissions();
      setDraft(createEmptyDraft());
      setSelectedKey(undefined);
      setAssignments([]);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  }

  async function assign(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!draft.originalKey) return;
    setError(undefined);
    try {
      await authz.assign(draft.originalKey, {
        subject: { type: subjectType, id: subjectId },
      });
      authz.invalidatePermissions();
      setAssignments(await authz.listAssignments(draft.originalKey));
    } catch (assignError) {
      setError(errorMessage(assignError));
    }
  }

  async function revoke(assignment: PermissionSetAssignment): Promise<void> {
    setError(undefined);
    try {
      await authz.revoke(assignment.id);
      authz.invalidatePermissions();
      setAssignments((current) =>
        current.filter((item) => item.id !== assignment.id),
      );
    } catch (revokeError) {
      setError(errorMessage(revokeError));
    }
  }

  return (
    <main className='mx-auto w-full max-w-6xl space-y-6 px-6 py-10'>
      <header className='space-y-2'>
        <p className='text-sm text-muted-foreground'>Authorization</p>
        <h1 className='text-2xl font-semibold'>Permission Sets</h1>
        <p className='text-sm text-muted-foreground'>
          Group permissions and assign them to users or all authenticated users.
        </p>
      </header>

      {error ? (
        <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
          {error}
        </div>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]'>
        <aside className='rounded-xl border bg-card p-4'>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <h2 className='font-medium'>Permission Sets</h2>
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                setSelectedKey(undefined);
                setDraft(createEmptyDraft());
                setAssignments([]);
              }}
            >
              New
            </Button>
          </div>
          {loading ? (
            <p className='text-sm text-muted-foreground'>Loading…</p>
          ) : sets.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No permission sets.</p>
          ) : (
            <div className='space-y-1'>
              {sets.map((set) => (
                <button
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedKey === set.key ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  key={set.key}
                  onClick={() => void selectPermissionSet(set)}
                  type='button'
                >
                  <span className='block font-medium'>
                    {set.title ?? set.key}
                  </span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {set.key}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className='space-y-6'>
          <form
            className='space-y-5 rounded-xl border bg-card p-6'
            onSubmit={(event) => void save(event)}
          >
            <div>
              <h2 className='font-medium'>Definition</h2>
              <p className='text-sm text-muted-foreground'>
                Page access uses resource type “page” and action “access”.
              </p>
            </div>
            <Field label='Key'>
              <Input
                required
                value={draft.key}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    key: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label='Title'>
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>
            <div className='space-y-3'>
              <div className='flex items-center justify-between gap-3'>
                <Label>Permissions</Label>
                <Button
                  size='sm'
                  type='button'
                  variant='outline'
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      grants: [...current.grants, createGrantDraft()],
                    }))
                  }
                >
                  Add permission
                </Button>
              </div>
              <div className='space-y-3'>
                {draft.grants.map((grant, index) => (
                  <div
                    className='grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_1fr_1fr_auto]'
                    key={grant.id}
                  >
                    <Field label='Resource type'>
                      <Input
                        required
                        placeholder='page'
                        value={grant.resourceType}
                        onChange={(event) =>
                          setDraft((current) =>
                            updateGrant(current, index, {
                              resourceType: event.target.value,
                            }),
                          )
                        }
                      />
                    </Field>
                    <Field label='Resource ID'>
                      <Input
                        required
                        placeholder='users or *'
                        value={grant.resourceId}
                        onChange={(event) =>
                          setDraft((current) =>
                            updateGrant(current, index, {
                              resourceId: event.target.value,
                            }),
                          )
                        }
                      />
                    </Field>
                    <Field label='Actions'>
                      <Input
                        required
                        placeholder='access'
                        value={grant.actions}
                        onChange={(event) =>
                          setDraft((current) =>
                            updateGrant(current, index, {
                              actions: event.target.value,
                            }),
                          )
                        }
                      />
                    </Field>
                    <div className='flex items-end'>
                      <Button
                        disabled={draft.grants.length === 1}
                        size='sm'
                        type='button'
                        variant='ghost'
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            grants: current.grants.filter(
                              (_item, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className='text-xs text-muted-foreground'>
                Separate multiple actions with commas. Page permissions use type
                “page” and action “access”.
              </p>
            </div>
            <div className='flex flex-wrap gap-3'>
              <Button disabled={saving} type='submit'>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {draft.originalKey ? (
                <Button
                  disabled={saving}
                  type='button'
                  variant='outline'
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </form>

          {draft.originalKey ? (
            <section className='space-y-5 rounded-xl border bg-card p-6'>
              <div>
                <h2 className='font-medium'>Assignments</h2>
                <p className='text-sm text-muted-foreground'>
                  Use authenticated / * for every signed-in user, or user / ID
                  for one user.
                </p>
              </div>
              <form
                className='grid gap-3 sm:grid-cols-[12rem_1fr_auto]'
                onSubmit={(event) => void assign(event)}
              >
                <select
                  className='h-9 rounded-md border bg-background px-3 text-sm'
                  value={subjectType}
                  onChange={(event) => {
                    const type = event.target.value;
                    setSubjectType(type);
                    setSubjectId(type === 'authenticated' ? '*' : '');
                  }}
                >
                  <option value='authenticated'>Authenticated users</option>
                  <option value='user'>User</option>
                </select>
                <Input
                  required
                  placeholder={subjectType === 'user' ? 'User ID' : '*'}
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                />
                <Button type='submit'>Assign</Button>
              </form>
              {assignments.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No assignments.</p>
              ) : (
                <div className='divide-y rounded-lg border'>
                  {assignments.map((assignment) => (
                    <div
                      className='flex items-center justify-between gap-4 px-4 py-3 text-sm'
                      key={assignment.id}
                    >
                      <span>
                        {assignment.subject.type}:{assignment.subject.id}
                      </span>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => void revoke(assignment)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}): ReactElement {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function permissionSetDraft(set: PermissionSet): PermissionSetDraft {
  return {
    originalKey: set.key,
    key: set.key,
    title: set.title ?? '',
    grants: set.grants.map((grant) => ({
      id: createGrantDraftId(),
      resourceType: grant.resource.type,
      resourceId: grant.resource.id,
      actions: grant.actions.map((action) => action.action).join(', '),
    })),
  };
}

function createEmptyDraft(): PermissionSetDraft {
  return {
    key: '',
    title: '',
    grants: [createGrantDraft()],
  };
}

function createGrantDraft(): GrantDraft {
  return {
    id: createGrantDraftId(),
    resourceType: 'page',
    resourceId: '',
    actions: 'access',
  };
}

function createGrantDraftId(): string {
  nextGrantDraftId += 1;
  return `grant-${nextGrantDraftId}`;
}

function permissionSetInput(draft: PermissionSetDraft): PermissionSetInput {
  const key = draft.key.trim();
  if (!key) throw new TypeError('Key is required.');
  return {
    key,
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    grants: draft.grants.map((grant): PermissionGrant => {
      const resourceType = grant.resourceType.trim();
      const resourceId = grant.resourceId.trim();
      const actions = grant.actions
        .split(',')
        .map((action) => action.trim())
        .filter(Boolean);
      if (!resourceType || !resourceId || actions.length === 0) {
        throw new TypeError(
          'Every permission requires a resource type, resource ID, and action.',
        );
      }
      return {
        resource: { type: resourceType, id: resourceId },
        actions: actions.map((action) => ({ action })),
      };
    }),
  };
}

function updateGrant(
  draft: PermissionSetDraft,
  index: number,
  update: Partial<GrantDraft>,
): PermissionSetDraft {
  return {
    ...draft,
    grants: draft.grants.map((grant, itemIndex) =>
      itemIndex === index ? { ...grant, ...update } : grant,
    ),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Authorization request failed.';
}
