import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type {
  AuthorizationOptions,
  AuthorizationSubject,
  PermissionSet,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import { ErrorBox } from '../../components/feedback.js';
import { PageLoading } from '../../components/page-shell.js';
import {
  permissionSetCapabilities,
  permissionSetErrorMessage as message,
} from '../../components/permission-set-access.js';
import type { UserDirectory } from '../../components/user-directory.js';
import { getAuthorizationClient } from '../../runtime.js';
import { PermissionSetDetail } from './detail.js';
import {
  cloneDraft,
  empty,
  fromSet,
  hasEmptyCustomFilter,
  toInput,
} from './drafts.js';
import { PermissionSetEditor } from './editor.js';
import { PermissionSetsList } from './list.js';
import { ResourceAccess } from './resource-access.js';
import { SetDiff } from './set-diff.js';
import { UserAccess, type AccessRuleSources } from './user-access.js';
import type { DetailSection, Draft } from './types.js';

/** Which view of the same permission sets the panel is showing. */
type PanelView = 'list' | 'resource-access' | 'set-diff' | 'user-access';

/** What the user access view reads once, rather than a request per set. */
interface UserAccessData {
  readonly assignments: readonly PermissionSetAssignment[];
  readonly rules: AccessRuleSources;
}

/** A rule list the administrator may not be allowed to read; the section is then left out. */
function optional<T>(request: Promise<T>): Promise<T | undefined> {
  return request.then(
    (value) => value,
    () => undefined,
  );
}

const authz = getAuthorizationClient();

export function PermissionSetsPanel({
  options,
  directory,
}: {
  options: AuthorizationOptions;
  directory: UserDirectory;
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
  const [view, setView] = useState<PanelView>('list');
  // The set the administrator came from, which the diff opens its first selector on.
  const [lastOpened, setLastOpened] = useState<string>();
  const [userAccess, setUserAccess] = useState<UserAccessData>();
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

  const current = useMemo(
    () => sets.find((set) => set.key === draft?.originalKey),
    [sets, draft],
  );
  const capabilities = useMemo(
    () => permissionSetCapabilities(current),
    [current],
  );

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
    setLastOpened(set.key);
    setView('list');
    setEditorDraft(undefined);
    setSection(set.unrestricted === true ? 'assignments' : 'permissions');
    setError(undefined);
    setAssignments(await authz.listAssignments(set.key));
  }
  async function openUserAccess(): Promise<void> {
    setError(undefined);
    setView('user-access');
    if (userAccess) return;
    try {
      const [assignments, defaultAccess, sharing, restriction] =
        await Promise.all([
          authz.listAllAssignments(),
          optional(authz.listDefaultAccess()),
          optional(authz.listSharingRules()),
          optional(authz.listRestrictionRules()),
        ]);
      setUserAccess({
        assignments,
        rules: {
          ...(defaultAccess === undefined ? {} : { defaultAccess }),
          ...(sharing === undefined ? {} : { sharing }),
          ...(restriction === undefined ? {} : { restriction }),
        },
      });
    } catch (cause) {
      setError(message(cause));
      setView('list');
    }
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
    // An unrestricted or otherwise locked set is never editable through the generic API.
    if (!draft || !capabilities.canUpdate) return;
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

  if (!draft && view === 'resource-access') {
    return (
      <>
        {error ? <ErrorBox value={error} /> : null}
        <ResourceAccess
          options={options}
          sets={sets}
          onBack={() => setView('list')}
          onOpen={(set) => void open(set)}
        />
      </>
    );
  }

  if (!draft && view === 'set-diff') {
    return (
      <>
        {error ? <ErrorBox value={error} /> : null}
        <SetDiff
          options={options}
          sets={sets}
          {...(lastOpened === undefined ? {} : { initialKey: lastOpened })}
          onBack={() => setView('list')}
        />
      </>
    );
  }

  if (!draft && view === 'user-access') {
    return userAccess ? (
      <UserAccess
        assignments={userAccess.assignments}
        directory={directory}
        options={options}
        rules={userAccess.rules}
        sets={sets}
        onBack={() => setView('list')}
      />
    ) : (
      <PageLoading />
    );
  }

  if (!draft) {
    return (
      <>
        <PermissionSetsList
          sets={visibleSets}
          total={sets.length}
          search={search}
          {...(error === undefined ? {} : { error })}
          onSearch={setSearch}
          onOpen={(set) => void open(set)}
          onCreate={create}
          onResourceAccess={() => setView('resource-access')}
          onCompare={() => setView('set-diff')}
          onUserAccess={() => void openUserAccess()}
        />
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

  return (
    <>
      <PermissionSetDetail
        options={options}
        directory={directory}
        draft={draft}
        capabilities={capabilities}
        assignments={assignments}
        section={section}
        busy={busy}
        {...(error === undefined ? {} : { error })}
        onSection={setSection}
        onBack={() => setDraft(undefined)}
        onEdit={edit}
        onDelete={() => void remove()}
        onAssign={assign}
        onRevoke={revoke}
      />
      {editorOpen && editorDraft && capabilities.canUpdate ? (
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
