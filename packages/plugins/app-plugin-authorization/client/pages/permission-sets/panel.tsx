import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
} from 'react-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from 'lucide-react';
import type {
  AuthorizationOptions,
  AuthorizationSubject,
  PermissionSet,
  PermissionSetAssignment,
} from '../../authorization-client.js';
import {
  canAssignSubjectType,
  permissionSetCapabilities,
  permissionSetErrorMessage as message,
} from '../../components/permission-set-access.js';
import type { UserDirectory } from '../../components/user-directory.js';
import { ConfirmDialog } from '../../components/confirm-dialog.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useAuthorizationTranslation } from '../../i18n.js';
import { getAuthorizationClient } from '../../runtime.js';
import { empty, fromSet, hasEmptyCustomFilter, toInput } from './drafts.js';
import { PermissionSetEditor } from './editor.js';
import { Assignments } from './assignments-tab.js';
import type { Draft } from './types.js';

const authz = getAuthorizationClient();
export interface PermissionWorkspaceContext {
  content: ReactElement;
}

export function PermissionSetsPanel({
  options,
  directory,
}: {
  options: AuthorizationOptions;
  directory: UserDirectory;
}): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const base = useResolvedPath('.').pathname;
  const { permissionSetKey } = useParams();
  const isNew = location.pathname === `${base}/new`;
  const assignmentsTab = location.pathname.endsWith('/assignments');
  const t = useAuthorizationTranslation();
  const [sets, setSets] = useState<readonly PermissionSet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | undefined>(() =>
    isNew ? empty() : undefined,
  );
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [assignments, setAssignments] = useState<
    readonly PermissionSetAssignment[]
  >([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const editingDetails = location.pathname.endsWith('/details');
  const section = assignmentsTab
    ? 'assignments'
    : editingDetails
      ? 'details'
      : 'permissions';
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const current = sets.find((item) => item.key === permissionSetKey);
  const capabilities = permissionSetCapabilities(current);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const setPath = (key: string, tab = 'permissions'): string =>
    `${base}/edit/${encodeURIComponent(key)}${tab === 'permissions' ? '' : `/${tab}`}`;
  const load = useCallback(async (): Promise<void> => {
    try {
      setSets(await authz.listPermissionSets());
      setLoaded(true);
    } catch (cause) {
      setError(message(t, cause));
    }
  }, [t]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    if (loaded && location.pathname === base && sets[0])
      void navigate(
        `${base}/edit/${encodeURIComponent(sets[0].key)}${location.search}`,
        { replace: true },
      );
  }, [loaded, location.pathname, location.search, base, sets, navigate]);
  const [draftSource, setDraftSource] = useState({ current, isNew });
  if (draftSource.current !== current || draftSource.isNew !== isNew) {
    setDraftSource({ current, isNew });
    const next = isNew ? empty() : current ? fromSet(current) : undefined;
    setDraft(next);
    setBaseline(next ? JSON.stringify(next) : '');
    setRevision((value) => value + 1);
    setError(undefined);
  }
  useEffect(() => {
    if (!permissionSetKey || !assignmentsTab) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (cancelled) return [];
        setAssignments([]);
        setAssignmentsLoading(true);
        return authz.listAssignments(permissionSetKey);
      })
      .then((items) => {
        if (!cancelled) setAssignments(items);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(message(t, cause));
      })
      .finally(() => {
        if (!cancelled) setAssignmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permissionSetKey, assignmentsTab, t]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function go(path: string): void {
    if (busy || path === location.pathname) return;
    if (dirty) setPending(path);
    else void navigate(path);
  }
  function discard(): void {
    const next = isNew ? empty() : current ? fromSet(current) : undefined;
    setDraft(next);
    setBaseline(next ? JSON.stringify(next) : '');
    setRevision((value) => value + 1);
  }
  async function save(): Promise<void> {
    if (!draft || (!isNew && !capabilities.canUpdate)) return;
    setBusy(true);
    setError(undefined);
    try {
      const inputDraft =
        current && !isNew
          ? editingDetails
            ? { ...fromSet(current), title: draft.title }
            : { ...fromSet(current), grants: draft.grants }
          : draft;
      const input = toInput(inputDraft);
      if (
        !input.key ||
        !draft.title.trim() ||
        input.grants.some(
          (grant) => !grant.resource.id || !grant.actions.length,
        ) ||
        hasEmptyCustomFilter(inputDraft)
      )
        throw new TypeError(t('errors.completePermissions'));
      const saved = draft.originalKey
        ? await authz.updatePermissionSet(draft.originalKey, input)
        : await authz.createPermissionSet(input);
      authz.invalidatePermissions();
      setSets((items) =>
        items.some((item) => item.key === saved.key)
          ? items.map((item) => (item.key === saved.key ? saved : item))
          : [...items, saved],
      );
      const next = fromSet(saved);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setRevision((value) => value + 1);
      if (isNew) void navigate(setPath(saved.key), { replace: true });
    } catch (cause) {
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(): Promise<void> {
    if (!current || !capabilities.canDelete) return;
    setBusy(true);
    try {
      await authz.deletePermissionSet(current.key);
      authz.invalidatePermissions();
      setSets((items) => items.filter((item) => item.key !== current.key));
      setDraft(undefined);
      setBaseline('');
      void navigate(base, { replace: true });
    } catch (cause) {
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
  }
  async function assign(
    subjects: readonly AuthorizationSubject[],
  ): Promise<void> {
    if (!current || !capabilities.canAssign) return;
    setBusy(true);
    setError(undefined);
    try {
      await Promise.all(
        subjects.map((subject) => authz.assign(current.key, { subject })),
      );
      setAssignments(await authz.listAssignments(current.key));
    } catch (cause) {
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(ids: readonly string[]): Promise<void> {
    if (!capabilities.canRevoke) return;
    setBusy(true);
    setError(undefined);
    try {
      await Promise.all(ids.map((id) => authz.revoke(id)));
      setAssignments((items) => items.filter((item) => !ids.includes(item.id)));
    } catch (cause) {
      setError(message(t, cause));
    } finally {
      setBusy(false);
    }
  }
  const content = !draft ? (
    <p className='p-6 text-sm text-muted-foreground'>
      {loaded ? t('permissionWorkspace.unavailableSet') : t('common.loading')}
    </p>
  ) : assignmentsTab ? (
    <div className='min-h-0 flex-1 overflow-auto p-4'>
      {assignmentsLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <Assignments
          key={permissionSetKey}
          directory={directory}
          assignments={assignments}
          canAssign={capabilities.canAssign}
          canAssignAudience={canAssignSubjectType(
            capabilities,
            'authenticated',
          )}
          canRevoke={capabilities.canRevoke}
          busy={busy}
          onAssign={assign}
          onRevoke={revoke}
        />
      )}
    </div>
  ) : capabilities.unrestricted && !editingDetails ? (
    <p className='p-6 text-sm text-muted-foreground'>
      {t('permissionSets.detail.unrestrictedBody')}
    </p>
  ) : (
    <PermissionSetEditor
      key={`${permissionSetKey ?? 'new'}:${revision}`}
      embedded
      showDetails={editingDetails}
      readOnly={!isNew && !capabilities.canUpdate}
      options={options}
      draft={draft}
      busy={busy}
      onChange={setDraft}
      onSave={(event) => {
        event.preventDefault();
        return save();
      }}
      onClose={discard}
    />
  );
  return (
    <div className='flex h-[calc(100dvh-6rem)] min-h-80 gap-3 overflow-hidden p-3'>
      <aside
        className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground ${collapsed ? 'w-14' : 'w-56'}`}
      >
        <div className='flex shrink-0 items-center justify-between gap-1 border-b p-2'>
          {!collapsed ? (
            <h1 className='truncate text-sm font-semibold'>
              {t('permissionSets.page.title')}
            </h1>
          ) : null}
          <div
            className={`flex shrink-0 items-center gap-1 ${collapsed ? 'flex-col' : ''}`}
          >
            <Button
              size='icon'
              variant='ghost'
              aria-label={t('permissionSets.list.create')}
              title={t('permissionSets.list.create')}
              disabled={busy}
              onClick={() => go(`${base}/new`)}
            >
              <Plus className='size-4' />
            </Button>
            <Button
              size='icon'
              variant='ghost'
              aria-label={t(
                collapsed
                  ? 'permissionWorkspace.expandSets'
                  : 'permissionWorkspace.collapseSets',
              )}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen className='size-4' />
              ) : (
                <PanelLeftClose className='size-4' />
              )}
            </Button>
          </div>
        </div>
        {!collapsed ? (
          <>
            <div className='space-y-2 p-2'>
              <Input
                aria-label={t('permissionSets.list.search')}
                placeholder={t('permissionSets.list.search')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <nav
              className='min-h-0 flex-1 space-y-1 overflow-y-auto p-2'
              aria-label={t('permissionSets.page.title')}
            >
              {sets
                .filter((item) =>
                  `${item.title} ${item.key}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.key}
                    type='button'
                    aria-label={item.title ?? item.key}
                    disabled={busy}
                    aria-current={
                      item.key === permissionSetKey ? 'page' : undefined
                    }
                    className='block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary'
                    onClick={() => go(setPath(item.key, section))}
                  >
                    <span className='block truncate'>
                      {item.title ?? item.key}
                    </span>
                    <span className='block truncate text-xs text-muted-foreground'>
                      {item.key}
                    </span>
                  </button>
                ))}
            </nav>
          </>
        ) : null}
      </aside>
      <main className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground'>
        <header className='flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3'>
          <h2 className='truncate text-lg font-semibold'>
            {draft?.title ||
              (isNew
                ? t('permissionSets.editor.newTitle')
                : t('permissionSets.page.title'))}
          </h2>
          <div className='flex items-center gap-2'>
            {current && capabilities.canDelete ? (
              <Button
                variant='ghost'
                className='text-destructive hover:bg-destructive/10 hover:text-destructive'
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className='size-4' />
                {t('common.delete')}
              </Button>
            ) : null}
          </div>
        </header>
        {current ? (
          <nav
            className='flex shrink-0 gap-6 border-b px-4'
            aria-label={t('permissionWorkspace.sections')}
          >
            {['permissions', 'assignments', 'details'].map((tab) => (
              <button
                key={tab}
                type='button'
                className={`border-b-2 py-3 text-sm ${tab === section ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}
                aria-current={tab === section ? 'page' : undefined}
                onClick={() => go(setPath(current.key, tab))}
              >
                {t(
                  tab === 'assignments'
                    ? 'permissionWorkspace.userAssignments'
                    : `permissionWorkspace.${tab}`,
                )}
              </button>
            ))}
          </nav>
        ) : null}
        {error ? (
          <p role='alert' className='p-3 text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        {location.pathname === base ? (
          <p className='p-6 text-sm text-muted-foreground'>
            {loaded ? t('permissionWorkspace.chooseSet') : t('common.loading')}
          </p>
        ) : (
          <Outlet context={{ content } satisfies PermissionWorkspaceContext} />
        )}
      </main>
      <ConfirmDialog
        open={pending !== undefined}
        title={t('permissionWorkspace.discardTitle')}
        confirmLabel={t('permissionWorkspace.discard')}
        onCancel={() => setPending(undefined)}
        onConfirm={() => {
          const path = pending;
          setPending(undefined);
          discard();
          if (path) void navigate(path);
        }}
      >
        {t('permissionWorkspace.discardBody')}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        busy={busy}
        title={t('permissionSets.detail.confirmDeleteTitle')}
        confirmLabel={t('permissionSets.detail.confirmDelete')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
      >
        {t('permissionSets.detail.confirmDeleteBody', {
          title: current?.title ?? current?.key ?? '',
        })}
      </ConfirmDialog>
    </div>
  );
}
