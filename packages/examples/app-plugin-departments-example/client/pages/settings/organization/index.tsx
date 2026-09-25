import { ApiClientError } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { NavLink, Outlet, useParams } from 'react-router';

import { PageContainer } from '../../../components/page-container.js';
import { PageHeader } from '../../../components/page-header.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import { ORGANIZATION_SETTINGS } from '../../../constants.js';
import { cn } from '../../../lib/utils.js';
import {
  useOrganizationApi,
  type Department,
  type OrganizationOutletContext,
} from './api.js';

interface TreeNode {
  readonly department: Department;
  readonly children: TreeNode[];
}

function buildTree(departments: readonly Department[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>(
    departments.map((department) => [
      department.id,
      { department, children: [] },
    ]),
  );
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent =
      node.department.parentId === null
        ? undefined
        : nodes.get(node.department.parentId);
    // A parent that no longer resolves leaves the department at the top level rather than hiding it.
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

interface TreeProps {
  readonly nodes: readonly TreeNode[];
  readonly selectedId: string | undefined;
  readonly canUpdate: boolean;
  readonly pending: string | undefined;
  readonly onToggle: (department: Department) => void;
}

function Tree({
  nodes,
  selectedId,
  canUpdate,
  pending,
  onToggle,
}: TreeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <ul className='space-y-1'>
      {nodes.map(({ department, children }) => (
        <li key={department.id}>
          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg px-2 py-1',
              department.id === selectedId && 'bg-muted',
            )}
          >
            <NavLink
              to={`departments/${encodeURIComponent(department.id)}`}
              className={cn(
                'min-w-0 truncate text-sm hover:underline',
                !department.active && 'text-muted-foreground line-through',
              )}
            >
              {department.title}
            </NavLink>
            <div className='flex shrink-0 items-center gap-2'>
              {!department.active ? (
                <span className='text-xs text-muted-foreground'>
                  {t('organization.disabled')}
                </span>
              ) : null}
              {canUpdate ? (
                <Button
                  size='xs'
                  variant='ghost'
                  disabled={pending === department.id}
                  onClick={() => onToggle(department)}
                >
                  {department.active
                    ? t('organization.disable')
                    : t('organization.enable')}
                </Button>
              ) : null}
            </div>
          </div>
          {children.length ? (
            <div className='ml-4 border-l border-border pl-2'>
              <Tree
                nodes={children}
                selectedId={selectedId}
                canUpdate={canUpdate}
                pending={pending}
                onToggle={onToggle}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function OrganizationPage(): ReactElement {
  const { t } = useTranslation();
  const api = useOrganizationApi();
  const { departmentId } = useParams();
  const { can: canUpdate } = useCan({
    resource: { type: 'settings', id: ORGANIZATION_SETTINGS },
    action: 'update',
  });
  const [reloadCount, setReloadCount] = useState(0);
  // Each result is stored with the request that produced it, so a stale response never replaces a newer one.
  const [result, setResult] = useState<{
    readonly key: number;
    readonly departments?: readonly Department[];
    readonly error?: unknown;
  }>();
  const [pending, setPending] = useState<string>();
  const [saveError, setSaveError] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const key = reloadCount;
    api.listDepartments(controller.signal).then(
      (departments) => {
        if (!controller.signal.aborted) setResult({ key, departments });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== reloadCount;
  const error = loading ? undefined : result?.error;
  // During a reload the last successful tree stays on screen.
  const departments = result?.departments;
  const reload = useCallback((): void => {
    setReloadCount((count) => count + 1);
  }, []);

  const tree = useMemo(() => buildTree(departments ?? []), [departments]);

  async function toggle(department: Department): Promise<void> {
    setPending(department.id);
    setSaveError(false);
    try {
      await api.setActive(department.id, !department.active);
      reload();
    } catch {
      setSaveError(true);
    } finally {
      setPending(undefined);
    }
  }

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) return;
    setPending('new');
    setSaveError(false);
    try {
      await api.createDepartment({ title: title.trim() });
      setTitle('');
      reload();
    } catch {
      setSaveError(true);
    } finally {
      setPending(undefined);
    }
  }

  const context: OrganizationOutletContext = {
    departments: departments ?? [],
    canUpdate,
    reload,
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('organization.title')}
        description={t('organization.description')}
      />
      {error instanceof ApiClientError && error.status === 403 ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('organization.forbidden')}
        </p>
      ) : error ? (
        <div role='alert' className='flex items-center gap-2 text-sm'>
          <span className='text-destructive'>{t('organization.failed')}</span>
          <Button size='sm' variant='outline' onClick={reload}>
            {t('organization.retry')}
          </Button>
        </div>
      ) : !departments ? (
        <p className='text-sm text-muted-foreground'>
          {t('organization.loading')}
        </p>
      ) : (
        <div className='grid gap-6 md:grid-cols-[minmax(16rem,1fr)_2fr]'>
          <section aria-label={t('organization.tree')} className='space-y-4'>
            {tree.length ? (
              <Tree
                nodes={tree}
                selectedId={departmentId}
                canUpdate={canUpdate}
                pending={pending}
                onToggle={(department) => void toggle(department)}
              />
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('organization.empty')}
              </p>
            )}
            {canUpdate ? (
              <form
                className='flex gap-2'
                onSubmit={(event) => void create(event)}
              >
                <Input
                  aria-label={t('organization.newTitle')}
                  placeholder={t('organization.newTitle')}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <Button type='submit' disabled={pending === 'new'}>
                  {t('organization.add')}
                </Button>
              </form>
            ) : null}
            {saveError ? (
              <p role='alert' className='text-sm text-destructive'>
                {t('organization.saveFailed')}
              </p>
            ) : null}
          </section>
          <section>
            {departmentId ? (
              <Outlet context={context} />
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('organization.select')}
              </p>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
