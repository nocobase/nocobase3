import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import {
  useOrganizationApi,
  type DirectMember,
  type OrganizationOutletContext,
  type UserOption,
} from './api.js';

/** The member panel of one department: its direct members, and, with `update`, the writes on them. */
export default function DepartmentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useOrganizationApi();
  const { departmentId = '' } = useParams();
  const { departments, canUpdate, reload } =
    useOutletContext<OrganizationOutletContext>();
  const department = departments.find((item) => item.id === departmentId);
  const parent = department?.parentId
    ? departments.find((item) => item.id === department.parentId)
    : undefined;
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${departmentId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly members?: readonly DirectMember[];
    readonly error?: unknown;
  }>();
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{
    readonly search: string;
    readonly users: readonly UserOption[];
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${departmentId}:${reloadCount}`;
    api.listMembers(departmentId, controller.signal).then(
      (members) => {
        if (!controller.signal.aborted) setResult({ key, members });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, departmentId, reloadCount]);

  const query = search.trim();
  useEffect(() => {
    if (!canUpdate || !query) return;
    const controller = new AbortController();
    api.searchUsers(query, controller.signal).then(
      (users) => {
        if (!controller.signal.aborted) setFound({ search: query, users });
      },
      () => {
        if (!controller.signal.aborted) setFound({ search: query, users: [] });
      },
    );
    return () => controller.abort();
  }, [api, canUpdate, query]);

  // A result for another department, or an earlier reload, counts as still loading.
  const current = result?.key === requestKey ? result : undefined;
  const members = current?.members;
  const failed = current?.error !== undefined;
  const candidates = found?.search === query ? found.users : [];
  const reloadMembers = (): void => setReloadCount((count) => count + 1);

  async function run(write: () => Promise<void>): Promise<void> {
    setPending(true);
    setSaveError(false);
    try {
      await write();
      reloadMembers();
    } catch {
      setSaveError(true);
    } finally {
      setPending(false);
    }
  }

  async function addChild(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!childTitle.trim()) return;
    await run(async () => {
      await api.createDepartment({
        title: childTitle.trim(),
        parentId: departmentId,
      });
      setChildTitle('');
      reload();
    });
  }

  if (!department)
    return (
      <p role='alert' className='text-sm text-muted-foreground'>
        {t('department.notFound')}
      </p>
    );

  const memberIds = new Set(members?.map((member) => member.userId));

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='font-heading text-xl font-semibold'>
          {department.title}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {parent
            ? t('department.parent', { title: parent.title })
            : t('department.topLevel')}
        </p>
      </div>

      {canUpdate ? (
        <form className='flex gap-2' onSubmit={(event) => void addChild(event)}>
          <Input
            aria-label={t('department.childTitle')}
            placeholder={t('department.childTitle')}
            value={childTitle}
            onChange={(event) => setChildTitle(event.target.value)}
          />
          <Button type='submit' variant='outline' disabled={pending}>
            {t('department.addChild')}
          </Button>
        </form>
      ) : null}

      <section className='space-y-2'>
        <h3 className='text-sm font-medium'>{t('department.members')}</h3>
        {failed ? (
          <div role='alert' className='flex items-center gap-2 text-sm'>
            <span className='text-destructive'>{t('organization.failed')}</span>
            <Button size='sm' variant='outline' onClick={reloadMembers}>
              {t('organization.retry')}
            </Button>
          </div>
        ) : !members ? (
          <p className='text-sm text-muted-foreground'>
            {t('organization.loading')}
          </p>
        ) : members.length ? (
          <ul className='divide-y divide-border rounded-lg border border-border'>
            {members.map((member) => (
              <li
                key={member.userId}
                className='flex items-center justify-between gap-2 px-3 py-2'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm'>{member.title}</p>
                  {member.description ? (
                    <p className='truncate text-xs text-muted-foreground'>
                      {member.description}
                    </p>
                  ) : null}
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  {member.primary ? (
                    <span className='text-xs text-muted-foreground'>
                      {t('department.primary')}
                    </span>
                  ) : canUpdate ? (
                    <Button
                      size='xs'
                      variant='ghost'
                      disabled={pending}
                      onClick={() =>
                        void run(() =>
                          api.setPrimary(departmentId, member.userId),
                        )
                      }
                    >
                      {t('department.setPrimary')}
                    </Button>
                  ) : null}
                  {canUpdate ? (
                    <Button
                      size='xs'
                      variant='destructive'
                      disabled={pending}
                      onClick={() =>
                        void run(() =>
                          api.removeMember(departmentId, member.userId),
                        )
                      }
                    >
                      {t('department.remove')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('department.noMembers')}
          </p>
        )}
      </section>

      {canUpdate ? (
        <section className='space-y-2'>
          <Input
            aria-label={t('department.searchUsers')}
            placeholder={t('department.searchUsers')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {query ? (
            candidates.filter((user) => !memberIds.has(user.id)).length ? (
              <ul className='space-y-1'>
                {candidates
                  .filter((user) => !memberIds.has(user.id))
                  .map((user) => (
                    <li
                      key={user.id}
                      className='flex items-center justify-between gap-2 text-sm'
                    >
                      <span className='min-w-0 truncate'>
                        {user.title}
                        {user.description ? (
                          <span className='ml-2 text-xs text-muted-foreground'>
                            {user.description}
                          </span>
                        ) : null}
                      </span>
                      <Button
                        size='xs'
                        variant='outline'
                        disabled={pending}
                        onClick={() =>
                          void run(() => api.addMember(departmentId, user.id))
                        }
                      >
                        {t('department.addMember')}
                      </Button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('department.noUsers')}
              </p>
            )
          ) : null}
        </section>
      ) : null}

      {saveError ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('organization.saveFailed')}
        </p>
      ) : null}
    </div>
  );
}
