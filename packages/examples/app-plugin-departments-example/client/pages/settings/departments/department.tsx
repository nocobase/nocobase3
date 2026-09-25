import {
  ConfirmDialog,
  EmptyTableRow,
  ErrorBox,
  ManagementTable,
  SelectField,
  titleText,
} from '@nocobase/app-plugin-authorization/client/management';
import { useTranslation } from '@nocobase/i18n/client';
import { Search, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { useOutletContext, useParams, useSearchParams } from 'react-router';

import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';
import { Input } from '../../../components/ui/input.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table.js';
import { REGIONS } from '../../../constants.js';
import {
  errorKey,
  useDepartmentsApi,
  type Department,
  type DepartmentsOutletContext,
  type DirectMember,
  type UserOption,
} from './api.js';

const TABS = ['members', 'basic'] as const;
type Tab = (typeof TABS)[number];

/** One department's details: its members and its basic information, as tabs. */
export default function DepartmentPage(): ReactElement {
  const { t } = useTranslation();
  const { departmentId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { departments, canUpdate, reload } =
    useOutletContext<DepartmentsOutletContext>();
  const department = departments.find((item) => item.id === departmentId);
  const tab: Tab = params.get('tab') === 'basic' ? 'basic' : 'members';

  if (!department)
    return (
      <p role='alert' className='p-6 text-sm text-muted-foreground'>
        {t('details.notFound')}
      </p>
    );

  return (
    <>
      <header className='flex shrink-0 items-center gap-3 border-b px-4 py-3'>
        <h2 className='truncate text-lg font-semibold'>
          {titleText(department.title, t, department.id)}
        </h2>
        {department.region ? (
          <Badge className='bg-primary/10 text-primary'>
            {t(`regions.${department.region}`, {
              defaultValue: department.region,
            })}
          </Badge>
        ) : null}
        {!department.active ? (
          <Badge className='bg-muted text-muted-foreground'>
            {t('tree.disabled')}
          </Badge>
        ) : null}
      </header>
      <nav
        className='flex shrink-0 gap-6 border-b px-4'
        aria-label={t('details.tabs')}
      >
        {TABS.map((item) => (
          <button
            key={item}
            type='button'
            className={`border-b-2 py-3 text-sm ${item === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}
            aria-current={item === tab ? 'page' : undefined}
            onClick={() =>
              setParams(item === 'members' ? {} : { tab: item }, {
                replace: true,
              })
            }
          >
            {t(`details.${item}`)}
          </button>
        ))}
      </nav>
      <div className='min-h-0 flex-1 overflow-auto p-4'>
        {tab === 'members' ? (
          <MembersTab
            key={department.id}
            department={department}
            canUpdate={canUpdate}
          />
        ) : (
          <BasicInfoTab
            key={JSON.stringify(department)}
            department={department}
            departments={departments}
            canUpdate={canUpdate}
            onSaved={reload}
          />
        )}
      </div>
    </>
  );
}

function MembersTab({
  department,
  canUpdate,
}: {
  department: Department;
  canUpdate: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDepartmentsApi();
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${department.id}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly members?: readonly DirectMember[];
    readonly error?: unknown;
  }>();
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string>();
  const [removing, setRemoving] = useState<DirectMember>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `${department.id}:${reloadCount}`;
    api.listMembers(department.id, controller.signal).then(
      (members) => {
        if (!controller.signal.aborted) setResult({ key, members });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, department.id, reloadCount]);

  // A result for an earlier reload counts as still loading.
  const current = result?.key === requestKey ? result : undefined;
  const members = current?.members;
  const failed = current?.error !== undefined;
  const reloadMembers = (): void => setReloadCount((count) => count + 1);
  const departmentTitle = titleText(department.title, t, department.id);
  const columns = canUpdate ? 4 : 3;

  async function run(write: () => Promise<void>): Promise<void> {
    setBusy(true);
    setWriteError(undefined);
    try {
      await write();
      reloadMembers();
    } catch (cause) {
      setWriteError(t(errorKey(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-4'>
      {canUpdate ? (
        <UserPicker
          memberIds={new Set(members?.map((member) => member.userId))}
          busy={busy}
          onAdd={(user) =>
            void run(() => api.addMember(department.id, user.id))
          }
        />
      ) : null}
      {writeError ? <ErrorBox value={writeError} /> : null}
      {failed ? (
        <div role='alert' className='flex items-center gap-3 text-sm'>
          <span className='text-destructive'>{t('members.failed')}</span>
          <Button size='sm' variant='outline' onClick={reloadMembers}>
            {t('page.retry')}
          </Button>
        </div>
      ) : null}
      <ManagementTable>
        <Table aria-busy={!members && !failed}>
          <TableHeader className='bg-muted/30'>
            <TableRow>
              <TableHead className='px-5 py-3'>{t('members.name')}</TableHead>
              <TableHead className='px-5 py-3'>{t('members.email')}</TableHead>
              <TableHead className='px-5 py-3'>
                {t('members.primaryColumn')}
              </TableHead>
              {canUpdate ? (
                <TableHead className='px-5 py-3 text-right'>
                  {t('members.actions')}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className='px-5 py-3 font-medium'>
                  {member.title}
                </TableCell>
                <TableCell className='px-5 py-3 text-muted-foreground'>
                  {member.description ?? ''}
                </TableCell>
                <TableCell className='px-5 py-3'>
                  {member.primary ? (
                    <Badge className='bg-primary/10 text-primary'>
                      {t('members.primary')}
                    </Badge>
                  ) : null}
                </TableCell>
                {canUpdate ? (
                  <TableCell className='px-5 py-3 text-right whitespace-nowrap'>
                    {member.primary ? null : (
                      <Button
                        size='sm'
                        variant='ghost'
                        aria-label={t('members.setPrimaryNamed', {
                          name: member.title,
                        })}
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            api.setPrimary(department.id, member.userId),
                          )
                        }
                      >
                        {t('members.setPrimary')}
                      </Button>
                    )}
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-destructive hover:bg-destructive/10 hover:text-destructive'
                      aria-label={t('members.removeNamed', {
                        name: member.title,
                      })}
                      disabled={busy}
                      onClick={() => setRemoving(member)}
                    >
                      {t('members.remove')}
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {members && members.length === 0 ? (
              <EmptyTableRow colSpan={columns}>
                {t('members.empty')}
              </EmptyTableRow>
            ) : null}
            {!members && !failed ? (
              <EmptyTableRow colSpan={columns}>
                {t('members.loading')}
              </EmptyTableRow>
            ) : null}
          </TableBody>
        </Table>
      </ManagementTable>
      <ConfirmDialog
        open={removing !== undefined}
        busy={busy}
        title={t('members.removeTitle')}
        confirmLabel={t('members.remove')}
        cancelLabel={t('dialog.cancel')}
        onCancel={() => setRemoving(undefined)}
        onConfirm={() => {
          const member = removing;
          setRemoving(undefined);
          if (member)
            void run(() => api.removeMember(department.id, member.userId));
        }}
      >
        {t('members.removeBody', {
          name: removing?.title ?? '',
          department: departmentTitle,
        })}
      </ConfirmDialog>
    </div>
  );
}

/** Searches enabled users and adds one; current members are listed but cannot be added again. */
function UserPicker({
  memberIds,
  busy,
  onAdd,
}: {
  memberIds: ReadonlySet<string>;
  busy: boolean;
  onAdd: (user: UserOption) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDepartmentsApi();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{
    readonly search: string;
    readonly users?: readonly UserOption[];
    readonly error?: string;
  }>();
  const query = search.trim();

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.searchUsers(query, controller.signal).then(
        (users) => {
          if (!controller.signal.aborted) setFound({ search: query, users });
        },
        (cause: unknown) => {
          if (!controller.signal.aborted)
            setFound({ search: query, error: t(errorKey(cause)) });
        },
      );
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, query, t]);

  const current = found?.search === query ? found : undefined;
  return (
    <div className='space-y-2 rounded-xl border bg-muted/40 p-3'>
      <div className='relative'>
        <Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground' />
        <Input
          className='pl-8'
          aria-label={t('members.search')}
          placeholder={t('members.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {query ? (
        !current ? (
          <p className='px-1 text-sm text-muted-foreground'>
            {t('members.searching')}
          </p>
        ) : current.error ? (
          <ErrorBox value={current.error} />
        ) : current.users?.length ? (
          <ul className='divide-y rounded-lg border bg-background'>
            {current.users.map((user) => (
              <li
                key={user.id}
                className='flex items-center justify-between gap-3 px-3 py-2'
              >
                <span className='min-w-0 truncate text-sm'>
                  <span className='font-medium'>{user.title}</span>
                  {user.description ? (
                    <span className='ml-2 text-muted-foreground'>
                      {user.description}
                    </span>
                  ) : null}
                </span>
                {memberIds.has(user.id) ? (
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {t('members.alreadyMember')}
                  </span>
                ) : (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => {
                      onAdd(user);
                      setSearch('');
                    }}
                  >
                    <UserPlus />
                    {t('members.add')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className='px-1 text-sm text-muted-foreground'>
            {t('members.noUsers')}
          </p>
        )
      ) : null}
    </div>
  );
}

/** The ids a department may not move below: itself and every descendant. */
function descendantsOf(
  departments: readonly Department[],
  id: string,
): ReadonlySet<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of departments)
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        grew = true;
      }
  }
  return result;
}

// Sentinels a department id or region never takes.
const TOP_LEVEL = '__top-level__';
const NO_REGION = '__none__';

function BasicInfoTab({
  department,
  departments,
  canUpdate,
  onSaved,
}: {
  department: Department;
  departments: readonly Department[];
  canUpdate: boolean;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDepartmentsApi();
  const originalTitle = titleText(department.title, t, department.id);
  const [title, setTitle] = useState(originalTitle);
  const [parentId, setParentId] = useState(department.parentId ?? TOP_LEVEL);
  const [region, setRegion] = useState(department.region ?? NO_REGION);
  const [active, setActive] = useState(department.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const excluded = descendantsOf(departments, department.id);
  const regions = [
    ...REGIONS,
    ...(department.region &&
    !(REGIONS as readonly string[]).includes(department.region)
      ? [department.region]
      : []),
  ];
  const dirty =
    title.trim() !== originalTitle ||
    parentId !== (department.parentId ?? TOP_LEVEL) ||
    region !== (department.region ?? NO_REGION) ||
    active !== department.active;

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canUpdate || !dirty || !title.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const changes = {
        // A seeded title stays a translation key until someone actually renames it.
        ...(title.trim() !== originalTitle ? { title: title.trim() } : {}),
        ...(parentId !== (department.parentId ?? TOP_LEVEL)
          ? { parentId: parentId === TOP_LEVEL ? null : parentId }
          : {}),
        ...(region !== (department.region ?? NO_REGION)
          ? { region: region === NO_REGION ? null : region }
          : {}),
      };
      if (Object.keys(changes).length)
        await api.updateDepartment(department.id, changes);
      if (active !== department.active)
        await api.setActive(department.id, active);
      onSaved();
    } catch (cause) {
      setError(t(errorKey(cause)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className='max-w-xl space-y-5' onSubmit={(event) => void save(event)}>
      {!canUpdate ? (
        <p className='text-sm text-muted-foreground'>{t('basic.readOnly')}</p>
      ) : null}
      <label className='block space-y-1.5 text-sm font-medium'>
        <span>{t('basic.title')}</span>
        <Input
          value={title}
          maxLength={255}
          disabled={!canUpdate || busy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className='space-y-1.5 text-sm font-medium'>
        <span>{t('basic.parent')}</span>
        <SelectField
          aria-label={t('basic.parent')}
          className='w-full'
          disabled={!canUpdate || busy}
          value={parentId}
          onValueChange={setParentId}
          options={[
            { value: TOP_LEVEL, label: t('basic.topLevel') },
            ...departments
              .filter((item) => !excluded.has(item.id))
              .map((item) => ({
                value: item.id,
                label: titleText(item.title, t, item.id),
              })),
          ]}
        />
      </div>
      <div className='space-y-1.5 text-sm font-medium'>
        <span>{t('basic.region')}</span>
        <SelectField
          aria-label={t('basic.region')}
          className='w-full'
          disabled={!canUpdate || busy}
          value={region}
          onValueChange={setRegion}
          options={[
            { value: NO_REGION, label: t('regions.none') },
            ...regions.map((value) => ({
              value,
              label: t(`regions.${value}`, { defaultValue: value }),
            })),
          ]}
        />
        <p className='text-xs font-normal text-muted-foreground'>
          {t('basic.regionHint')}
        </p>
      </div>
      <div className='space-y-1.5 text-sm font-medium'>
        <span>{t('basic.active')}</span>
        <SelectField
          aria-label={t('basic.active')}
          className='w-full'
          disabled={!canUpdate || busy}
          value={active ? 'enabled' : 'disabled'}
          onValueChange={(value) => setActive(value === 'enabled')}
          options={[
            { value: 'enabled', label: t('basic.enabled') },
            { value: 'disabled', label: t('basic.disabled') },
          ]}
        />
      </div>
      {error ? <ErrorBox value={error} /> : null}
      {canUpdate ? (
        <Button type='submit' disabled={busy || !dirty || !title.trim()}>
          {t('basic.save')}
        </Button>
      ) : null}
    </form>
  );
}
