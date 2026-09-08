import {
  ApiClientError,
  apiClientToken,
  useService,
} from '@nocobase/app-client';
import { authorizationClientToken } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  UserRoundCheck,
  UserRoundX,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import {
  emptyUserCapabilities,
  loadUserCapabilities,
  type UserCapabilities,
} from '../user-permissions.js';
import {
  UsersClient,
  type CreateUserInput,
  type ManagedUser,
  type ManagedUserPage,
  type UpdateUserInput,
  type UserRoleScopeOption,
  type UserRoleValue,
  type UsersOptions,
} from '../user-client.js';
import {
  emptyRoleScopeValues,
  hasEveryRequiredRoleScope,
  selectedRoleScopeValues,
} from '../role-scopes.js';

const EMPTY_PAGE: ManagedUserPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

export default function UsersPage(): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-users');
  const api = useService(apiClientToken);
  const authorization = useService(authorizationClientToken);
  const users = useMemo(() => new UsersClient(api), [api]);
  const [options, setOptions] = useState<UsersOptions>({ roleScopes: [] });
  const [result, setResult] = useState<ManagedUserPage>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editor, setEditor] = useState<ManagedUser | 'create'>();
  const [passwordUser, setPasswordUser] = useState<ManagedUser>();
  const [stateUser, setStateUser] = useState<ManagedUser>();
  const [globalCapabilities, setGlobalCapabilities] =
    useState<UserCapabilities>(emptyUserCapabilities);
  const [userCapabilities, setUserCapabilities] = useState<
    Readonly<Record<string, UserCapabilities>>
  >({});

  const roleChoices = options.roleScopes.flatMap((scope) =>
    scope.options.map((option) => ({ scope, option })),
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextOptions, nextPage, nextGlobalCapabilities] = await Promise.all(
        [
          users.options(),
          users.list({
            page,
            pageSize: 20,
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(status === 'all' ? {} : { status }),
            ...(role === 'all'
              ? {}
              : {
                  roleScope: role.slice(0, role.indexOf(':')),
                  role: role.slice(role.indexOf(':') + 1),
                }),
          }),
          loadUserCapabilities(authorization, '*'),
        ],
      );
      const capabilityEntries: readonly (readonly [
        string,
        UserCapabilities,
      ])[] = await Promise.all(
        nextPage.items.map(
          async (user): Promise<readonly [string, UserCapabilities]> => [
            user.id,
            await loadUserCapabilities(authorization, user.id),
          ],
        ),
      );
      const nextUserCapabilities: Readonly<Record<string, UserCapabilities>> =
        Object.fromEntries(capabilityEntries);
      setOptions(nextOptions);
      setResult(nextPage);
      setGlobalCapabilities(nextGlobalCapabilities);
      setUserCapabilities(nextUserCapabilities);
    } catch (reason) {
      setError(readError(reason, t('errors.operationFailed')));
    } finally {
      setLoading(false);
    }
  }, [authorization, page, role, search, status, t, users]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(
    () => authorization.onPermissionsInvalidated(() => void load()),
    [authorization, load],
  );

  const perform = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      await load();
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 403) {
        authorization.invalidatePermissions();
      }
      setError(readError(reason, t('errors.operationFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20 p-5 sm:p-8'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <header className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('page.title')}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('page.description')}
            </p>
          </div>
          {globalCapabilities.create && globalCapabilities['assign-role'] ? (
            <Button onClick={() => setEditor('create')}>
              <Plus /> {t('page.add')}
            </Button>
          ) : null}
        </header>

        {error ? (
          <div className='rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <div className='flex flex-wrap gap-3'>
          <label className='flex h-9 min-w-64 flex-1 items-center gap-2 rounded-lg border bg-background px-3'>
            <Search className='size-4 text-muted-foreground' />
            <Input
              className='h-auto border-0 p-0 focus-visible:ring-0'
              placeholder={t('page.search')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('page.allStatuses')}</SelectItem>
              <SelectItem value='enabled'>{t('page.enabled')}</SelectItem>
              <SelectItem value='disabled'>{t('page.disabled')}</SelectItem>
            </SelectContent>
          </Select>
          {roleChoices.length ? (
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(String(value));
                setPage(1);
              }}
            >
              <SelectTrigger className='w-48'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('page.allRoles')}</SelectItem>
                {roleChoices.map(({ scope, option }) => (
                  <SelectItem
                    key={`${scope.key}:${option.value}`}
                    value={`${scope.key}:${option.value}`}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className='overflow-hidden rounded-xl border bg-background'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('page.columns.user')}</TableHead>
                <TableHead>{t('page.columns.status')}</TableHead>
                {options.roleScopes.map((scope) => (
                  <TableHead key={scope.key}>{scope.label}</TableHead>
                ))}
                <TableHead className='w-14'>
                  <span className='sr-only'>{t('page.columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={3 + options.roleScopes.length}
                    className='h-32 text-center text-muted-foreground'
                  >
                    <LoaderCircle className='mx-auto size-5 animate-spin' />
                  </TableCell>
                </TableRow>
              ) : result.items.length ? (
                result.items.map((user) => {
                  const capabilities =
                    userCapabilities[user.id] ?? emptyUserCapabilities();
                  const canChangeState = user.disabledAt
                    ? capabilities.enable
                    : capabilities.disable;
                  const hasActions =
                    capabilities.update ||
                    capabilities['reset-password'] ||
                    capabilities['revoke-sessions'] ||
                    canChangeState;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className='font-medium'>{user.name}</div>
                        <div className='text-xs text-muted-foreground'>
                          {user.username ? `@${user.username} · ` : ''}
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.disabledAt ? 'secondary' : 'default'}
                        >
                          {user.disabledAt
                            ? t('page.disabled')
                            : t('page.enabled')}
                        </Badge>
                      </TableCell>
                      {options.roleScopes.map((scope) => (
                        <TableCell key={scope.key}>
                          {capabilities['assign-role'] ? (
                            <RoleEditor
                              disabled={busy}
                              scope={scope}
                              value={user.roleScopes[scope.key] ?? ''}
                              onChange={(value) =>
                                void perform(() =>
                                  users.replaceRoleScope(
                                    user.id,
                                    scope.key,
                                    value,
                                  ),
                                )
                              }
                            />
                          ) : (
                            <RoleValue
                              scope={scope}
                              value={user.roleScopes[scope.key] ?? ''}
                            />
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        {hasActions ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant='ghost' size='icon-sm' />}
                            >
                              <MoreHorizontal />
                              <span className='sr-only'>
                                {t('page.actions.menu')}
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              {capabilities.update ? (
                                <DropdownMenuItem
                                  onClick={() => setEditor(user)}
                                >
                                  {t('page.actions.edit')}
                                </DropdownMenuItem>
                              ) : null}
                              {capabilities['reset-password'] ? (
                                <DropdownMenuItem
                                  onClick={() => setPasswordUser(user)}
                                >
                                  {t('page.actions.resetPassword')}
                                </DropdownMenuItem>
                              ) : null}
                              {capabilities['revoke-sessions'] ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void perform(() =>
                                      users.revokeSessions(user.id),
                                    )
                                  }
                                >
                                  {t('page.actions.revokeSessions')}
                                </DropdownMenuItem>
                              ) : null}
                              {canChangeState ? (
                                <DropdownMenuItem
                                  onClick={() => setStateUser(user)}
                                >
                                  {user.disabledAt
                                    ? t('page.actions.enable')
                                    : t('page.actions.disable')}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3 + options.roleScopes.length}
                    className='h-32 text-center text-muted-foreground'
                  >
                    {t('page.noUsers')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>{t('page.total', { count: result.total })}</span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('page.previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page * result.pageSize >= result.total || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('page.next')}
            </Button>
          </div>
        </div>
      </div>

      {editor &&
      (editor === 'create'
        ? globalCapabilities.create && globalCapabilities['assign-role']
        : userCapabilities[editor.id]?.update) ? (
        <UserDialog
          busy={busy}
          options={options}
          user={editor === 'create' ? undefined : editor}
          onClose={() => setEditor(undefined)}
          onSubmit={(input) =>
            void perform(async () => {
              if (input.kind === 'create') await users.create(input.value);
              else if (editor !== 'create') {
                await users.update(editor.id, input.value);
              }
              setEditor(undefined);
            })
          }
        />
      ) : null}
      {passwordUser && userCapabilities[passwordUser.id]?.['reset-password'] ? (
        <PasswordDialog
          busy={busy}
          user={passwordUser}
          onClose={() => setPasswordUser(undefined)}
          onSubmit={(password) =>
            void perform(async () => {
              await users.resetPassword(passwordUser.id, password);
              setPasswordUser(undefined);
            })
          }
        />
      ) : null}
      {stateUser &&
      userCapabilities[stateUser.id]?.[
        stateUser.disabledAt ? 'enable' : 'disable'
      ] ? (
        <ConfirmStateDialog
          busy={busy}
          user={stateUser}
          onClose={() => setStateUser(undefined)}
          onConfirm={() =>
            void perform(async () => {
              if (stateUser.disabledAt) await users.enable(stateUser.id);
              else await users.disable(stateUser.id);
              setStateUser(undefined);
            })
          }
        />
      ) : null}
    </main>
  );
}

function RoleValue({
  scope,
  value,
}: {
  readonly scope: UserRoleScopeOption;
  readonly value: UserRoleValue;
}): ReactElement {
  const values = roleValues(value);
  const labels = values.map(
    (entry) =>
      scope.options.find((option) => option.value === entry)?.label ?? entry,
  );
  return <span className='text-sm'>{labels.join(', ') || '\u2014'}</span>;
}

function RoleEditor({
  disabled,
  scope,
  value,
  onChange,
}: {
  readonly disabled: boolean;
  readonly scope: UserRoleScopeOption;
  readonly value: UserRoleValue;
  readonly onChange: (value: UserRoleValue) => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-users');
  if (scope.selection === 'multiple') {
    const selected = roleValues(value);
    return (
      <select
        multiple
        disabled={disabled}
        aria-label={scope.label}
        className='min-h-9 rounded-lg border bg-background px-2 py-1 text-sm'
        value={[...selected]}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions, ({ value }) => value),
          )
        }
      >
        {scope.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Select
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onValueChange={(next) => onChange(String(next))}
    >
      <SelectTrigger aria-label={scope.label} className='w-44'>
        <SelectValue placeholder={t('page.selectRole')} />
      </SelectTrigger>
      <SelectContent>
        {scope.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserDialog({
  busy,
  options,
  user,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly options: UsersOptions;
  readonly user?: ManagedUser;
  readonly onClose: () => void;
  readonly onSubmit: (input: UserDialogSubmitInput) => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-users');
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<Record<string, UserRoleValue>>(() =>
    emptyRoleScopeValues(options.roleScopes),
  );
  const requiredRolesSelected = hasEveryRequiredRoleScope(
    options.roleScopes,
    roles,
  );
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit(
      user
        ? {
            kind: 'update',
            value: { name, username: username.trim() ? username : null, email },
          }
        : {
            kind: 'create',
            value: {
              name,
              ...(username.trim() ? { username } : {}),
              email,
              password,
              roleScopes: selectedRoleScopeValues(options.roleScopes, roles),
            },
          },
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}
    >
      <DialogContent>
        <form onSubmit={submit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>
              {user ? t('form.editTitle') : t('form.addTitle')}
            </DialogTitle>
            <DialogDescription>
              {user ? t('form.editDescription') : t('form.addDescription')}
            </DialogDescription>
          </DialogHeader>
          <Field label={t('form.name')}>
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t('form.username')}>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
          <Field label={t('form.email')}>
            <Input
              required
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          {!user ? (
            <>
              <Field label={t('form.password')}>
                <Input
                  required
                  type='password'
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              {options.roleScopes.map((scope) => (
                <Field key={scope.key} label={scope.label}>
                  <RoleEditor
                    disabled={busy}
                    scope={scope}
                    value={roles[scope.key] ?? ''}
                    onChange={(value) =>
                      setRoles((current) => ({
                        ...current,
                        [scope.key]: value,
                      }))
                    }
                  />
                </Field>
              ))}
            </>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={onClose}
            >
              {t('form.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={busy || (!user && !requiredRolesSelected)}
            >
              {busy ? <LoaderCircle className='animate-spin' /> : null}
              {user ? t('form.save') : t('form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type UserDialogSubmitInput =
  | { readonly kind: 'create'; readonly value: CreateUserInput }
  | { readonly kind: 'update'; readonly value: UpdateUserInput };

function PasswordDialog({
  busy,
  user,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly user: ManagedUser;
  readonly onClose: () => void;
  readonly onSubmit: (password: string) => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-users');
  const [password, setPassword] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}
    >
      <DialogContent>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(password);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('password.title')}</DialogTitle>
            <DialogDescription>
              {t('password.description', { name: user.name })}
            </DialogDescription>
          </DialogHeader>
          <Field label={t('password.newPassword')}>
            <Input
              required
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={onClose}
            >
              {t('form.cancel')}
            </Button>
            <Button type='submit' disabled={busy}>
              <KeyRound /> {t('password.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmStateDialog({
  busy,
  user,
  onClose,
  onConfirm,
}: {
  readonly busy: boolean;
  readonly user: ManagedUser;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}): ReactElement {
  const { t } = useTranslation('@nocobase/app-plugin-users');
  const enabling = Boolean(user.disabledAt);
  return (
    <Dialog
      open
      onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {enabling ? t('state.enableTitle') : t('state.disableTitle')}
          </DialogTitle>
          <DialogDescription>
            {enabling
              ? t('state.enableDescription', { name: user.name })
              : t('state.disableDescription', { name: user.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='outline' disabled={busy} onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button
            disabled={busy}
            variant={enabling ? 'default' : 'destructive'}
            onClick={onConfirm}
          >
            {enabling ? <UserRoundCheck /> : <UserRoundX />}
            {enabling ? t('state.enable') : t('state.disable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleValues(value: UserRoleValue): readonly string[] {
  return typeof value === 'string' ? (value ? [value] : []) : value;
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <div className='space-y-1.5'>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function readError(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message;
  return fallback;
}
