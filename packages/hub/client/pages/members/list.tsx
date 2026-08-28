import { Eye, UserPlus, Users } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslate } from '@refinedev/core';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import {
  type HubApplication,
  type HubAgentCredential,
  type HubFetcher,
  type HubInvitation,
  type HubMember,
  type HubMemberAccess,
  type HubRole,
  hubDelete,
  hubPatch,
  hubPut,
  hubRequest,
  useHubQuery,
} from '@/features/hub/api';
import {
  formatHubDate,
  getHubErrorMessage,
  HubEmptyState,
  HubErrorState,
  HubListSkeleton,
  HubStatusBadge,
} from '@/features/hub/components';
import {
  HubPageHeader,
  HubSearchInput,
  HubTablePagination,
  roleName,
} from '@/features/hub/management-components';
import { useHubPageQuery } from '@/features/hub/pagination';
import {
  getHubCapabilityActionLabel,
  getHubCapabilityResourceLabel,
  getHubRoleLabel,
  getHubRoleScopeLabel,
} from '@/features/hub/labels';

export interface MembersPageProps {
  fetcher?: HubFetcher;
}

export function MembersPage({ fetcher }: MembersPageProps) {
  const translate = useTranslate();
  const [tab, setTab] = useState('members');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const memberPath = useMemo(() => {
    const params = new URLSearchParams({ sort: 'name' });
    if (deferredSearch.trim()) params.set('query', deferredSearch.trim());
    if (status !== 'all') params.set('status', status);
    if (role !== 'all') params.set('role', role);
    return `/members?${params.toString()}`;
  }, [deferredSearch, role, status]);
  const members = useHubPageQuery<HubMember>({ path: memberPath, fetcher });
  const roles = useHubQuery<HubRole[]>({
    path: '/roles',
    fetcher,
    initialData: [],
  });
  const applications = useHubQuery<HubApplication[]>({
    path: '/apps?limit=100&offset=0&sort=name',
    fetcher,
    initialData: [],
  });
  const [invitationRevision, setInvitationRevision] = useState(0);

  return (
    <div className='hub-page'>
      <HubPageHeader
        eyebrow={
          <>
            <Users aria-hidden='true' />
            {translate('hub.members.eyebrow', 'Access control')}
          </>
        }
        title={translate('hub.members.title', 'Members and roles')}
        description={translate(
          'hub.members.description',
          'Control who can develop, publish, deploy, and administer each application through built-in roles and application scope.',
        )}
        actions={
          <>
            <Button variant='outline' onClick={() => setTab('roles')}>
              <Eye aria-hidden='true' />
              {translate('hub.members.viewRoles', 'View roles')}
            </Button>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden='true' />
              {translate('hub.members.invite', 'Invite member')}
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className='w-full justify-start overflow-x-auto'>
          <TabsTrigger value='members' className='flex-none px-3'>
            {translate('hub.members.tabs.members', 'Members')}
          </TabsTrigger>
          <TabsTrigger value='invitations' className='flex-none px-3'>
            {translate('hub.members.tabs.invitations', 'Invitations')}
          </TabsTrigger>
          <TabsTrigger value='agent-credentials' className='flex-none px-3'>
            {translate(
              'hub.members.tabs.agentCredentials',
              'Agent credentials',
            )}
          </TabsTrigger>
          <TabsTrigger value='roles' className='flex-none px-3'>
            {translate('hub.members.tabs.roles', 'Built-in roles')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='members' className='space-y-4 pt-4'>
          <div className='hub-filter-panel flex flex-col gap-3 lg:flex-row lg:items-center'>
            <HubSearchInput
              value={search}
              onChange={setSearch}
              label={translate('hub.members.search.label', 'Search members')}
              placeholder={translate(
                'hub.members.search.placeholder',
                'Search name, email, or username',
              )}
            />
            <div className='grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap'>
              <NativeSelect
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label={translate(
                  'hub.members.filter.status',
                  'Filter by member status',
                )}
              >
                <NativeSelectOption value='all'>
                  {translate('hub.members.filter.allStatuses', 'All statuses')}
                </NativeSelectOption>
                <NativeSelectOption value='active'>
                  {translate('hub.status.active', 'Active')}
                </NativeSelectOption>
                <NativeSelectOption value='disabled'>
                  {translate('hub.status.disabled', 'Disabled')}
                </NativeSelectOption>
              </NativeSelect>
              <NativeSelect
                value={role}
                onChange={(event) => setRole(event.target.value)}
                aria-label={translate(
                  'hub.members.filter.role',
                  'Filter by role',
                )}
              >
                <NativeSelectOption value='all'>
                  {translate('hub.members.filter.allRoles', 'All roles')}
                </NativeSelectOption>
                {(roles.data ?? []).map((item) => {
                  const key = item.key ?? item.id ?? item.name ?? 'role';
                  return (
                    <NativeSelectOption key={key} value={key}>
                      {getHubRoleLabel(item.name ?? key, translate)}
                    </NativeSelectOption>
                  );
                })}
              </NativeSelect>
            </div>
          </div>
          {members.error ? (
            <HubErrorState error={members.error} onRetry={members.reload} />
          ) : members.loading ? (
            <HubListSkeleton rows={8} />
          ) : members.data.length === 0 ? (
            <HubEmptyState
              title={translate('hub.members.empty.title', 'No members')}
              description={translate(
                'hub.members.empty.description',
                'No Hub members match the current filters.',
              )}
            />
          ) : (
            <Card className='hub-table-card py-0'>
              <CardContent className='px-0'>
                <Table className='min-w-[900px]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='pl-4'>
                        {translate('hub.common.name', 'Name')}
                      </TableHead>
                      <TableHead>
                        {translate('hub.members.email', 'Email')}
                      </TableHead>
                      <TableHead>
                        {translate('hub.members.roles', 'Roles')}
                      </TableHead>
                      <TableHead>
                        {translate(
                          'hub.members.visibleApps',
                          'Visible applications',
                        )}
                      </TableHead>
                      <TableHead>
                        {translate('hub.members.lastActive', 'Last active')}
                      </TableHead>
                      <TableHead>
                        {translate('hub.common.status', 'Status')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {translate('hub.common.action', 'Action')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.data.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        roles={roles.data ?? []}
                        applications={applications.data ?? []}
                        fetcher={fetcher}
                        onChanged={members.reload}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <HubTablePagination
                page={members.page}
                pageCount={members.pageCount}
                pageSize={members.pageSize}
                total={members.total}
                onPageChange={members.setPage}
                onPageSizeChange={members.setPageSize}
              />
            </Card>
          )}
        </TabsContent>
        <TabsContent value='invitations' className='pt-4'>
          <InvitationList key={invitationRevision} fetcher={fetcher} />
        </TabsContent>
        <TabsContent value='agent-credentials' className='pt-4'>
          <AgentCredentialList fetcher={fetcher} />
        </TabsContent>
        <TabsContent value='roles' className='pt-4'>
          <RoleCatalog
            roles={roles.data ?? []}
            loading={roles.loading}
            error={roles.error}
            onRetry={roles.reload}
          />
        </TabsContent>
      </Tabs>
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles.data ?? []}
        applications={applications.data ?? []}
        fetcher={fetcher}
        onCreated={() => setInvitationRevision((value) => value + 1)}
      />
    </div>
  );
}

function MemberRow({
  member,
  roles: roleCatalog,
  applications,
  fetcher,
  onChanged,
}: {
  member: HubMember;
  roles: HubRole[];
  applications: HubApplication[];
  fetcher?: HubFetcher;
  onChanged: () => void;
}) {
  const translate = useTranslate();
  const [busy, setBusy] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [statusActionOpen, setStatusActionOpen] = useState(false);
  const [statusError, setStatusError] = useState<Error | null>(null);
  const roles = member.roles ?? member.globalRoles ?? [];
  const enabling = member.status === 'disabled';
  const nextStatus = enabling ? 'active' : 'disabled';
  return (
    <TableRow>
      <TableCell className='pl-4'>
        <p className='font-medium'>{member.name}</p>
        <p className='text-xs text-muted-foreground'>
          @{member.username ?? '—'}
        </p>
      </TableCell>
      <TableCell>{member.email}</TableCell>
      <TableCell>
        <div className='flex flex-wrap gap-1'>
          {roles.length
            ? roles.map((item) => (
                <Badge
                  key={roleName(item)}
                  variant='secondary'
                  className='capitalize'
                >
                  {getHubRoleLabel(roleName(item), translate)}
                </Badge>
              ))
            : '—'}
        </div>
      </TableCell>
      <TableCell>{member.visibleApplicationCount ?? '—'}</TableCell>
      <TableCell>{formatHubDate(member.lastActiveAt)}</TableCell>
      <TableCell>
        <HubStatusBadge status={member.status} />
      </TableCell>
      <TableCell className='text-right'>
        <div className='flex justify-end gap-2'>
          <Button
            size='sm'
            variant='outline'
            aria-label={translate(
              'hub.members.editAccessFor',
              { name: member.name },
              'Edit access for {{name}}',
            ).replace('{{name}}', member.name)}
            onClick={() => setAccessOpen(true)}
          >
            {translate('hub.members.editAccess', 'Edit access')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={() => {
              setStatusError(null);
              setStatusActionOpen(true);
            }}
          >
            {enabling
              ? translate('hub.members.enable', 'Enable')
              : translate('hub.members.disable', 'Disable')}
          </Button>
        </div>
        <MemberAccessDialog
          open={accessOpen}
          onOpenChange={setAccessOpen}
          member={member}
          roles={roleCatalog}
          applications={applications}
          fetcher={fetcher}
          onSaved={onChanged}
        />
        <ConfirmActionDialog
          open={statusActionOpen}
          busy={busy}
          error={statusError}
          destructive={!enabling}
          title={
            enabling
              ? translate('hub.members.enableTitle', 'Enable member')
              : translate('hub.members.disableTitle', 'Disable member')
          }
          description={
            enabling
              ? translate(
                  'hub.members.enableConfirm',
                  'Enable this member and allow them to sign in again?',
                )
              : translate(
                  'hub.members.disableConfirm',
                  'Disable this member and revoke active sessions?',
                )
          }
          confirmLabel={
            enabling
              ? translate('hub.members.enableAction', 'Confirm enable')
              : translate('hub.members.disableAction', 'Confirm disable')
          }
          pendingLabel={
            enabling
              ? translate('hub.members.enabling', 'Enabling…')
              : translate('hub.members.disabling', 'Disabling…')
          }
          errorTitle={translate(
            'hub.members.statusError',
            'Unable to update member status',
          )}
          onOpenChange={(open) => {
            setStatusActionOpen(open);
            if (!open) setStatusError(null);
          }}
          onConfirm={() => {
            setBusy(true);
            setStatusError(null);
            void hubPatch<HubMember>(
              `/members/${encodeURIComponent(member.id)}`,
              { status: nextStatus },
              fetcher,
              { 'if-match': `"rev-${member.revision}"` },
            )
              .then(() => {
                setStatusActionOpen(false);
                onChanged();
              })
              .catch((reason: unknown) => setStatusError(toError(reason)))
              .finally(() => setBusy(false));
          }}
        />
      </TableCell>
    </TableRow>
  );
}

function MemberAccessDialog({
  open,
  onOpenChange,
  member,
  roles,
  applications,
  fetcher,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: HubMember;
  roles: HubRole[];
  applications: HubApplication[];
  fetcher?: HubFetcher;
  onSaved: () => void;
}) {
  const translate = useTranslate();
  const access = useHubQuery<HubMemberAccess>({
    path: open ? `/members/${encodeURIComponent(member.id)}/access` : null,
    fetcher,
  });
  const [globalRoles, setGlobalRoles] = useState<string[]>([]);
  const [applicationRoles, setApplicationRoles] = useState<
    Record<string, string[]>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!open || !access.data) return;
    setGlobalRoles([...access.data.globalRoles]);
    setApplicationRoles(
      Object.fromEntries(
        access.data.applications.map((item) => [
          item.applicationId,
          [...item.roles],
        ]),
      ),
    );
  }, [access.data, open]);

  const globalRoleOptions = roles.filter((role) =>
    roleSupportsScope(role, 'global'),
  );
  const applicationRoleOptions = roles.filter((role) =>
    roleSupportsScope(role, 'application'),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent className='max-h-[min(48rem,calc(100svh-2rem))] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'hub.members.access.title',
              { name: member.name },
              'Access for {{name}}',
            ).replace('{{name}}', member.name)}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'hub.members.access.description',
              'Global roles apply across Hub. Application roles apply only to the selected application.',
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertTitle>
              {translate(
                'hub.members.access.saveError',
                'Unable to save member access',
              )}
            </AlertTitle>
            <AlertDescription>
              {getHubErrorMessage(error, translate)}
            </AlertDescription>
          </Alert>
        ) : null}
        {access.error ? (
          <HubErrorState error={access.error} onRetry={access.reload} />
        ) : access.loading || !access.data ? (
          <HubListSkeleton rows={4} />
        ) : (
          <div className='space-y-5'>
            <RoleCheckboxGroup
              title={translate(
                'hub.members.access.globalRoles',
                'Global roles',
              )}
              ariaPrefix={translate(
                'hub.members.access.globalRoleAria',
                'Global role',
              )}
              roles={globalRoleOptions}
              selected={globalRoles}
              onChange={setGlobalRoles}
            />
            <div className='space-y-3'>
              <p className='text-sm font-medium'>
                {translate(
                  'hub.members.access.applicationRoles',
                  'Application roles',
                )}
              </p>
              {applications.length ? (
                applications.map((application) => (
                  <div key={application.id} className='rounded-lg border p-3'>
                    <RoleCheckboxGroup
                      title={application.name}
                      ariaPrefix={`${application.name} ${translate(
                        'hub.members.access.applicationRoleAria',
                        'application role',
                      )}`}
                      roles={applicationRoleOptions}
                      selected={applicationRoles[application.id] ?? []}
                      onChange={(next) =>
                        setApplicationRoles((current) => ({
                          ...current,
                          [application.id]: next,
                        }))
                      }
                    />
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {translate(
                    'hub.members.access.noApplications',
                    'No applications are available.',
                  )}
                </p>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {translate('hub.common.cancel', 'Cancel')}
          </Button>
          <Button
            type='button'
            disabled={submitting || access.loading || !access.data}
            onClick={() => {
              if (!access.data) return;
              setSubmitting(true);
              setError(null);
              const applicationsAccess = Object.entries(
                applicationRoles,
              ).flatMap(([applicationId, selectedRoles]) =>
                selectedRoles.length
                  ? [{ applicationId, roles: selectedRoles }]
                  : [],
              );
              void hubPut<HubMemberAccess>(
                `/members/${encodeURIComponent(member.id)}/access`,
                {
                  globalRoles,
                  applications: applicationsAccess,
                },
                fetcher,
                { 'if-match': `"rev-${access.data.revision}"` },
              )
                .then(() => {
                  onSaved();
                  onOpenChange(false);
                })
                .catch((reason: unknown) =>
                  setError(
                    reason instanceof Error
                      ? reason
                      : new Error(String(reason)),
                  ),
                )
                .finally(() => setSubmitting(false));
            }}
          >
            {submitting
              ? translate('hub.members.access.saving', 'Saving…')
              : translate('hub.members.access.save', 'Save access')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleCheckboxGroup({
  title,
  ariaPrefix,
  roles,
  selected,
  onChange,
}: {
  title: string;
  ariaPrefix: string;
  roles: HubRole[];
  selected: string[];
  onChange: (roles: string[]) => void;
}) {
  const translate = useTranslate();
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{title}</p>
      <div className='flex flex-wrap gap-x-5 gap-y-3'>
        {roles.map((role) => {
          const key = roleKey(role);
          return (
            <div key={key} className='flex items-center gap-2'>
              <Checkbox
                checked={selected.includes(key)}
                aria-label={`${ariaPrefix} ${getHubRoleLabel(
                  role.name ?? key,
                  translate,
                )}`}
                onCheckedChange={(checked) =>
                  onChange(toggleRole(selected, key, checked === true))
                }
              />
              <span className='text-sm'>
                {getHubRoleLabel(role.name ?? key, translate)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvitationList({ fetcher }: { fetcher?: HubFetcher }) {
  const translate = useTranslate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingInvitation, setPendingInvitation] =
    useState<HubInvitation | null>(null);
  const path = useMemo(() => {
    const params = new URLSearchParams({ sort: '-createdAt' });
    if (deferredSearch.trim()) params.set('query', deferredSearch.trim());
    if (status !== 'all') params.set('status', status);
    return `/invitations?${params.toString()}`;
  }, [deferredSearch, status]);
  const invitations = useHubPageQuery<HubInvitation>({ path, fetcher });

  return (
    <div className='space-y-4'>
      <div className='hub-filter-panel flex flex-col gap-3 lg:flex-row lg:items-center'>
        <HubSearchInput
          value={search}
          onChange={setSearch}
          label={translate(
            'hub.invitations.search.label',
            'Search invitations',
          )}
          placeholder={translate(
            'hub.invitations.search.placeholder',
            'Search invited email',
          )}
        />
        <NativeSelect
          className='w-full sm:w-fit'
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={translate(
            'hub.invitations.filter.status',
            'Filter by invitation status',
          )}
        >
          <NativeSelectOption value='all'>
            {translate('hub.invitations.filter.allStatuses', 'All statuses')}
          </NativeSelectOption>
          {['pending', 'accepted', 'expired', 'revoked'].map((value) => (
            <NativeSelectOption key={value} value={value}>
              {translate(`hub.status.${value}`, value)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {error && !pendingInvitation ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {translate(
              'hub.invitations.revokeError',
              'Unable to revoke invitation',
            )}
          </AlertTitle>
          <AlertDescription>
            {getHubErrorMessage(error, translate)}
          </AlertDescription>
        </Alert>
      ) : null}
      {invitations.error ? (
        <HubErrorState error={invitations.error} onRetry={invitations.reload} />
      ) : invitations.loading ? (
        <HubListSkeleton rows={6} />
      ) : invitations.data.length === 0 ? (
        <HubEmptyState
          title={translate('hub.invitations.empty.title', 'No invitations')}
          description={translate(
            'hub.invitations.empty.description',
            'No invitations match the current filters.',
          )}
        />
      ) : (
        <Card className='hub-table-card py-0'>
          <CardContent className='px-0'>
            <Table className='min-w-[820px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='pl-4'>
                    {translate('hub.members.email', 'Email')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.invitations.access', 'Access')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.common.status', 'Status')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.invitations.expires', 'Expires')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.common.created', 'Created')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {translate('hub.common.action', 'Action')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.data.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className='pl-4 font-medium'>
                      {invitation.email}
                    </TableCell>
                    <TableCell>{invitationAccessText(invitation)}</TableCell>
                    <TableCell>
                      <HubStatusBadge status={invitation.status} />
                    </TableCell>
                    <TableCell>{formatHubDate(invitation.expiresAt)}</TableCell>
                    <TableCell>{formatHubDate(invitation.createdAt)}</TableCell>
                    <TableCell className='text-right'>
                      {invitation.status === 'pending' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busyId === invitation.id}
                          aria-label={translate(
                            'hub.invitations.revoke',
                            'Revoke invitation',
                          )}
                          onClick={() => {
                            setError(null);
                            setPendingInvitation(invitation);
                          }}
                        >
                          {translate('hub.invitations.revokeShort', 'Revoke')}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <HubTablePagination
            page={invitations.page}
            pageCount={invitations.pageCount}
            pageSize={invitations.pageSize}
            total={invitations.total}
            onPageChange={invitations.setPage}
            onPageSizeChange={invitations.setPageSize}
          />
        </Card>
      )}
      <ConfirmActionDialog
        open={pendingInvitation !== null}
        busy={busyId !== null}
        error={error}
        destructive
        title={translate('hub.invitations.revokeTitle', 'Revoke invitation')}
        description={translate(
          'hub.invitations.revokeConfirm',
          'Revoke this invitation? The invitation link will stop working immediately.',
        )}
        confirmLabel={translate(
          'hub.invitations.revokeAction',
          'Confirm revoke',
        )}
        pendingLabel={translate('hub.invitations.revoking', 'Revoking…')}
        errorTitle={translate(
          'hub.invitations.revokeError',
          'Unable to revoke invitation',
        )}
        onOpenChange={(open) => {
          if (!open) {
            setPendingInvitation(null);
            setError(null);
          }
        }}
        onConfirm={() => {
          if (!pendingInvitation) return;
          setBusyId(pendingInvitation.id);
          setError(null);
          void hubDelete<HubInvitation>(
            `/invitations/${encodeURIComponent(pendingInvitation.id)}`,
            fetcher,
          )
            .then(() => {
              setPendingInvitation(null);
              invitations.reload();
            })
            .catch((reason: unknown) => setError(toError(reason)))
            .finally(() => setBusyId(null));
        }}
      />
    </div>
  );
}

function AgentCredentialList({ fetcher }: { fetcher?: HubFetcher }) {
  const translate = useTranslate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingCredential, setPendingCredential] =
    useState<HubAgentCredential | null>(null);
  const path = useMemo(() => {
    const params = new URLSearchParams({ sort: '-createdAt' });
    if (deferredSearch.trim()) params.set('query', deferredSearch.trim());
    if (status !== 'all') params.set('status', status);
    return `/agent-credentials?${params.toString()}`;
  }, [deferredSearch, status]);
  const credentials = useHubPageQuery<HubAgentCredential>({ path, fetcher });

  return (
    <div className='space-y-4'>
      <div className='hub-filter-panel flex flex-col gap-3 lg:flex-row lg:items-center'>
        <HubSearchInput
          value={search}
          onChange={setSearch}
          label={translate(
            'hub.agentCredentials.search.label',
            'Search Agent credentials',
          )}
          placeholder={translate(
            'hub.agentCredentials.search.placeholder',
            'Search Agent name or client ID',
          )}
        />
        <NativeSelect
          className='w-full sm:w-fit'
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={translate(
            'hub.agentCredentials.filter.status',
            'Filter by credential status',
          )}
        >
          <NativeSelectOption value='all'>
            {translate(
              'hub.agentCredentials.filter.allStatuses',
              'All statuses',
            )}
          </NativeSelectOption>
          {['active', 'revoked', 'expired'].map((value) => (
            <NativeSelectOption key={value} value={value}>
              {translate(`hub.status.${value}`, value)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {error && !pendingCredential ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {translate(
              'hub.agentCredentials.revokeError',
              'Unable to revoke credential',
            )}
          </AlertTitle>
          <AlertDescription>
            {getHubErrorMessage(error, translate)}
          </AlertDescription>
        </Alert>
      ) : null}
      {credentials.error ? (
        <HubErrorState error={credentials.error} onRetry={credentials.reload} />
      ) : credentials.loading ? (
        <HubListSkeleton rows={6} />
      ) : credentials.data.length === 0 ? (
        <HubEmptyState
          title={translate(
            'hub.agentCredentials.empty.title',
            'No Agent credentials',
          )}
          description={translate(
            'hub.agentCredentials.empty.description',
            'No credentials match the current filters.',
          )}
        />
      ) : (
        <Card className='hub-table-card py-0'>
          <CardContent className='px-0'>
            <Table className='min-w-[900px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='pl-4'>
                    {translate('hub.agentCredentials.client', 'Agent')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.agentCredentials.scopes', 'Scopes')}
                  </TableHead>
                  <TableHead>
                    {translate(
                      'hub.agentCredentials.applicationScope',
                      'Application scope',
                    )}
                  </TableHead>
                  <TableHead>
                    {translate('hub.common.status', 'Status')}
                  </TableHead>
                  <TableHead>
                    {translate('hub.agentCredentials.lastUsed', 'Last used')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {translate('hub.common.action', 'Action')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.data.map((credential) => (
                  <TableRow key={credential.id}>
                    <TableCell className='pl-4'>
                      <p className='font-medium'>{credential.clientName}</p>
                      <p className='text-xs text-muted-foreground'>
                        {credential.clientId}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className='flex max-w-72 flex-wrap gap-1'>
                        {credential.scopes.map((scope) => (
                          <Badge key={scope} variant='secondary'>
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {credential.applicationScope.mode === 'all-authorized'
                        ? translate(
                            'hub.agentCredentials.allAuthorized',
                            'All authorized applications',
                          )
                        : translate(
                            'hub.agentCredentials.selectedApplications',
                            {
                              count:
                                credential.applicationScope.applicationIds
                                  ?.length ?? 0,
                            },
                            '{{count}} selected applications',
                          ).replace(
                            '{{count}}',
                            String(
                              credential.applicationScope.applicationIds
                                ?.length ?? 0,
                            ),
                          )}
                    </TableCell>
                    <TableCell>
                      <HubStatusBadge status={credential.status} />
                    </TableCell>
                    <TableCell>
                      {formatHubDate(credential.lastUsedAt)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {credential.status === 'active' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={busyId === credential.id}
                          aria-label={translate(
                            'hub.agentCredentials.revoke',
                            'Revoke credential',
                          )}
                          onClick={() => {
                            setError(null);
                            setPendingCredential(credential);
                          }}
                        >
                          {translate(
                            'hub.agentCredentials.revokeShort',
                            'Revoke',
                          )}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <HubTablePagination
            page={credentials.page}
            pageCount={credentials.pageCount}
            pageSize={credentials.pageSize}
            total={credentials.total}
            onPageChange={credentials.setPage}
            onPageSizeChange={credentials.setPageSize}
          />
        </Card>
      )}
      <ConfirmActionDialog
        open={pendingCredential !== null}
        busy={busyId !== null}
        error={error}
        destructive
        title={translate(
          'hub.agentCredentials.revokeTitle',
          'Revoke Agent credential',
        )}
        description={translate(
          'hub.agentCredentials.revokeConfirm',
          'Revoke this Agent credential? The Agent will lose Hub access immediately.',
        )}
        confirmLabel={translate(
          'hub.agentCredentials.revokeAction',
          'Confirm revoke',
        )}
        pendingLabel={translate('hub.agentCredentials.revoking', 'Revoking…')}
        errorTitle={translate(
          'hub.agentCredentials.revokeError',
          'Unable to revoke credential',
        )}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCredential(null);
            setError(null);
          }
        }}
        onConfirm={() => {
          if (!pendingCredential) return;
          setBusyId(pendingCredential.id);
          setError(null);
          void hubDelete<{ revoked: boolean }>(
            `/agent-credentials/${encodeURIComponent(pendingCredential.id)}`,
            fetcher,
          )
            .then(() => {
              setPendingCredential(null);
              credentials.reload();
            })
            .catch((reason: unknown) => setError(toError(reason)))
            .finally(() => setBusyId(null));
        }}
      />
    </div>
  );
}

function roleKey(role: HubRole): string {
  return role.key ?? role.id ?? role.name ?? 'role';
}

function roleSupportsScope(
  role: HubRole,
  scope: 'global' | 'application',
): boolean {
  return role.scopes?.includes(scope) ?? role.scope === scope;
}

function toggleRole(roles: string[], role: string, checked: boolean): string[] {
  return checked
    ? roles.includes(role)
      ? roles
      : [...roles, role]
    : roles.filter((item) => item !== role);
}

function invitationAccessText(invitation: HubInvitation): string {
  if (!invitation.access) return '—';
  const roles = [
    ...invitation.access.globalRoles,
    ...invitation.access.applications.flatMap((item) => item.roles),
  ];
  return [...new Set(roles)].join(', ') || '—';
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function ConfirmActionDialog({
  open,
  busy,
  error,
  destructive = false,
  title,
  description,
  confirmLabel,
  pendingLabel,
  errorTitle,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: Error | null;
  destructive?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  errorTitle: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const translate = useTranslate();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && busy) return;
        onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>
              {getHubErrorMessage(error, translate)}
            </AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {translate('hub.common.cancel', 'Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy ? <Spinner aria-hidden='true' /> : null}
            {busy ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RoleCatalog({
  roles,
  loading,
  error,
  onRetry,
}: {
  roles: HubRole[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const translate = useTranslate();
  if (loading) return <HubListSkeleton rows={5} />;
  if (error) return <HubErrorState error={error} onRetry={onRetry} />;
  if (!roles.length)
    return (
      <HubEmptyState
        title={translate('hub.roles.empty.title', 'No role catalog')}
        description={translate(
          'hub.roles.empty.description',
          'The built-in role catalog is unavailable.',
        )}
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {translate('hub.roles.title', 'Built-in role capabilities')}
        </CardTitle>
        <CardDescription>
          {translate(
            'hub.roles.description',
            'These capability sets are read-only. Deployer controls Runtime and deployments; Developer publishes local build artifacts as Releases.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {roles.map((role) => {
          const key = role.key ?? role.id ?? role.name ?? 'role';
          return (
            <div key={key} className='rounded-lg border bg-muted/15 p-4'>
              <div className='flex items-center justify-between gap-2'>
                <p className='font-semibold capitalize'>
                  {getHubRoleLabel(role.name ?? key, translate)}
                </p>
                <Badge variant='outline'>
                  {getHubRoleScopeLabel(role.scope, translate)}
                </Badge>
              </div>
              <div className='mt-3 space-y-2'>
                {role.capabilities.map((capability) => (
                  <div key={capability.resource}>
                    <p className='text-xs font-medium'>
                      {getHubCapabilityResourceLabel(
                        capability.resource,
                        translate,
                      )}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {capability.actions
                        .map((action) =>
                          getHubCapabilityActionLabel(action, translate),
                        )
                        .join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function InviteMemberDialog({
  open,
  onOpenChange,
  roles,
  applications,
  fetcher,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: HubRole[];
  applications: HubApplication[];
  fetcher?: HubFetcher;
  onCreated: () => void;
}) {
  const translate = useTranslate();
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<'global' | 'application'>('application');
  const [role, setRole] = useState('viewer');
  const [applicationId, setApplicationId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [invite, setInvite] = useState<HubInvitation | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roleOptions = roles.filter((item) => (item.key ?? item.id) !== 'owner');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setInvite(null);
          setError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate('hub.invitation.title', 'Invite member')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'hub.invitation.description',
              'The invitation URL is shown once. Hub does not send email automatically.',
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant='destructive'>
            <AlertTitle>
              {translate('hub.invitation.error', 'Unable to create invitation')}
            </AlertTitle>
            <AlertDescription>
              {getHubErrorMessage(error, translate)}
            </AlertDescription>
          </Alert>
        ) : null}
        {invite?.inviteUrl ? (
          <div className='space-y-2'>
            <Label>{translate('hub.invitation.url', 'Invitation URL')}</Label>
            <Input value={invite.inviteUrl} readOnly />
            <p className='text-xs text-muted-foreground'>
              {translate(
                'hub.invitation.copyNow',
                'Copy this URL now; it will not be returned again.',
              )}
            </p>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='invite-email'>
                {translate('hub.members.email', 'Email')}
              </Label>
              <Input
                id='invite-email'
                type='email'
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='invite-scope'>
                {translate('hub.invitation.scope', 'Role scope')}
              </Label>
              <NativeSelect
                id='invite-scope'
                value={scope}
                onChange={(event) =>
                  setScope(event.target.value as 'global' | 'application')
                }
              >
                <NativeSelectOption value='application'>
                  {translate(
                    'hub.invitation.applicationScope',
                    'One application',
                  )}
                </NativeSelectOption>
                <NativeSelectOption value='global'>
                  {translate('hub.invitation.globalScope', 'All applications')}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {scope === 'application' ? (
              <div className='space-y-2'>
                <Label htmlFor='invite-app'>
                  {translate('hub.common.application', 'Application')}
                </Label>
                <NativeSelect
                  id='invite-app'
                  value={applicationId}
                  onChange={(event) => setApplicationId(event.target.value)}
                >
                  <NativeSelectOption value=''>
                    {translate(
                      'hub.invitation.selectApplication',
                      'Select an application',
                    )}
                  </NativeSelectOption>
                  {applications.map((application) => (
                    <NativeSelectOption
                      key={application.id}
                      value={application.id}
                    >
                      {application.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            <div className='space-y-2'>
              <Label htmlFor='invite-role'>
                {translate('hub.members.roles', 'Role')}
              </Label>
              <NativeSelect
                id='invite-role'
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {roleOptions.map((item) => {
                  const key = item.key ?? item.id ?? item.name ?? 'viewer';
                  return (
                    <NativeSelectOption key={key} value={key}>
                      {getHubRoleLabel(item.name ?? key, translate)}
                    </NativeSelectOption>
                  );
                })}
              </NativeSelect>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='invite-expiry'>
                {translate('hub.invitation.expiry', 'Expires in days')}
              </Label>
              <Input
                id='invite-expiry'
                type='number'
                min={1}
                max={30}
                value={expiresInDays}
                onChange={(event) =>
                  setExpiresInDays(Number(event.target.value))
                }
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {invite
              ? translate('hub.common.done', 'Done')
              : translate('hub.common.cancel', 'Cancel')}
          </Button>
          {!invite ? (
            <Button
              disabled={
                submitting ||
                !email.trim() ||
                (scope === 'application' && !applicationId)
              }
              onClick={() => {
                setSubmitting(true);
                setError(null);
                const access =
                  scope === 'global'
                    ? { globalRoles: [role], applications: [] }
                    : {
                        globalRoles: [],
                        applications: [{ applicationId, roles: [role] }],
                      };
                void hubRequest<HubInvitation>(
                  '/invitations',
                  {
                    method: 'POST',
                    headers: { 'idempotency-key': crypto.randomUUID() },
                    body: JSON.stringify({
                      email: email.trim(),
                      expiresInDays,
                      access,
                    }),
                  },
                  fetcher,
                )
                  .then((response) => {
                    setInvite(response.data);
                    onCreated();
                  })
                  .catch((reason: unknown) =>
                    setError(
                      reason instanceof Error
                        ? reason
                        : new Error(String(reason)),
                    ),
                  )
                  .finally(() => setSubmitting(false));
              }}
            >
              {submitting
                ? translate('hub.invitation.creating', 'Creating…')
                : translate('hub.invitation.create', 'Create invitation')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MembersPage;
