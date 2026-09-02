import { useTranslation } from '@nocobase/i18n/client';
import {
  Bot,
  CalendarClock,
  CircleCheck,
  Copy,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Checkbox } from '../components/ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import {
  NativeSelect,
  NativeSelectOption,
} from '../components/ui/native-select.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs.js';
import {
  BUILT_IN_ROLES,
  HUB_APPLICATIONS,
  createCredentialFixtures,
  createInvitationFixtures,
  createMemberFixtures,
  isValidInvitationEmail,
  memberRoles,
  visibleApplicationCount,
  type ApplicationId,
  type BuiltInRole,
  type CredentialStatus,
  type HubAgentCredential,
  type HubInvitation,
  type HubMember,
  type InvitationStatus,
  type MemberAccess,
  type MemberStatus,
  type RoleKey,
} from '../domain/members.js';

const PAGE_SIZE = 5;

type MembersTab = 'members' | 'invitations' | 'credentials' | 'roles';

function useRoleLabel(): (role: RoleKey) => string {
  const { t } = useTranslation();

  return (role: RoleKey): string => {
    switch (role) {
      case 'administrator':
        return t('members.roles.administrator', {
          defaultValue: 'Administrator',
        });
      case 'developer':
        return t('members.roles.developer', { defaultValue: 'Developer' });
      case 'deployer':
        return t('members.roles.deployer', { defaultValue: 'Deployer' });
      case 'viewer':
        return t('members.roles.viewer', { defaultValue: 'Viewer' });
    }
  };
}

function formatDate(value: string | null, locale?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function toggleValue<T extends string>(
  values: T[],
  value: T,
  checked: boolean,
): T[] {
  if (checked) return values.includes(value) ? values : [...values, value];
  return values.filter((item) => item !== value);
}

function cloneAccess(access: MemberAccess): MemberAccess {
  return {
    globalRoles: [...access.globalRoles],
    applicationRoles: Object.fromEntries(
      Object.entries(access.applicationRoles).map(([applicationId, roles]) => [
        applicationId,
        [...roles],
      ]),
    ),
  };
}

function interpolateMessage(
  message: string,
  values: Readonly<Record<string, string>>,
): string {
  return message.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? values[key] : placeholder,
  );
}

function roleSupportsScope(
  role: BuiltInRole,
  scope: 'global' | ApplicationId,
): boolean {
  return role.scopes.includes(scope === 'global' ? 'global' : 'application');
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export default function MembersPage(): ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<MembersTab>('members');
  const [members, setMembers] = useState<HubMember[]>(createMemberFixtures);
  const [invitations, setInvitations] = useState<HubInvitation[]>(
    createInvitationFixtures,
  );
  const [credentials, setCredentials] = useState<HubAgentCredential[]>(
    createCredentialFixtures,
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-4 py-7 sm:px-6'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between'>
          <div className='max-w-3xl'>
            <p className='inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase'>
              <ShieldCheck className='size-3.5' aria-hidden='true' />
              {t('members.header.eyebrow', { defaultValue: 'Access control' })}
            </p>
            <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
              {t('members.header.title', {
                defaultValue: 'Members and roles',
              })}
            </h1>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('members.header.description', {
                defaultValue:
                  'Control who can develop, deploy, and administer applications. This frontend preview keeps every change in memory.',
              })}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' onClick={() => setActiveTab('roles')}>
              <LockKeyhole aria-hidden='true' />
              {t('members.actions.viewRoles', {
                defaultValue: 'View roles',
              })}
            </Button>
            <Button variant='outline' onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden='true' />
              {t('members.actions.invite', { defaultValue: 'Invite member' })}
            </Button>
          </div>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6'>
        {notice ? <Feedback message={notice} /> : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as MembersTab)}
        >
          <TabsList className='w-full justify-start' variant='line'>
            <TabsTrigger value='members' className='flex-none px-3'>
              <Users aria-hidden='true' />
              {t('members.tabs.members', { defaultValue: 'Members' })}
            </TabsTrigger>
            <TabsTrigger value='invitations' className='flex-none px-3'>
              <CalendarClock aria-hidden='true' />
              {t('members.tabs.invitations', { defaultValue: 'Invitations' })}
            </TabsTrigger>
            <TabsTrigger value='credentials' className='flex-none px-3'>
              <Bot aria-hidden='true' />
              {t('members.tabs.credentials', {
                defaultValue: 'Agent credentials',
              })}
            </TabsTrigger>
            <TabsTrigger value='roles' className='flex-none px-3'>
              <KeyRound aria-hidden='true' />
              {t('members.tabs.roles', { defaultValue: 'Built-in roles' })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value='members' className='pt-3'>
            <MemberList members={members} onMembersChange={setMembers} />
          </TabsContent>
          <TabsContent value='invitations' className='pt-3'>
            <InvitationList
              invitations={invitations}
              onInvitationsChange={setInvitations}
            />
          </TabsContent>
          <TabsContent value='credentials' className='pt-3'>
            <CredentialList
              credentials={credentials}
              onCredentialsChange={setCredentials}
            />
          </TabsContent>
          <TabsContent value='roles' className='pt-3'>
            <RoleCatalog />
          </TabsContent>
        </Tabs>

        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onInvite={(invitation) => {
            setInvitations((current) => [invitation, ...current]);
            setNotice(
              t('members.feedback.invitationCreated', {
                defaultValue: 'Invitation created for {{email}}.',
                email: invitation.email,
              }),
            );
          }}
        />
      </div>
    </main>
  );
}

function MemberList({
  members,
  onMembersChange,
}: {
  members: HubMember[];
  onMembersChange: (members: HubMember[]) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const roleLabel = useRoleLabel();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | MemberStatus>('all');
  const [role, setRole] = useState<'all' | RoleKey>('all');
  const [page, setPage] = useState(1);
  const [editingMember, setEditingMember] = useState<HubMember | null>(null);
  const [statusMember, setStatusMember] = useState<HubMember | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return members.filter((member) => {
      const matchesSearch =
        query.length === 0 ||
        [member.name, member.username, member.email].some((value) =>
          value.toLocaleLowerCase().includes(query),
        );
      const matchesStatus = status === 'all' || member.status === status;
      const matchesRole = role === 'all' || memberRoles(member).includes(role);
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [members, role, search, status]);
  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleMembers = filteredMembers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className='space-y-4'>
      {feedback ? <Feedback message={feedback} /> : null}
      <FilterPanel>
        <div className='relative min-w-0 flex-1 lg:max-w-md'>
          <Label htmlFor='member-search' className='sr-only'>
            {t('members.filters.search', { defaultValue: 'Search members' })}
          </Label>
          <Search
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          <Input
            id='member-search'
            className='pl-8'
            value={search}
            placeholder={t('members.filters.searchPlaceholder', {
              defaultValue: 'Search name, email, or username',
            })}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className='grid gap-2 sm:grid-cols-2 lg:flex'>
          <div>
            <Label htmlFor='member-status' className='sr-only'>
              {t('members.filters.status', {
                defaultValue: 'Filter by member status',
              })}
            </Label>
            <NativeSelect
              id='member-status'
              className='w-full lg:w-44'
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as 'all' | MemberStatus);
                setPage(1);
              }}
            >
              <NativeSelectOption value='all'>
                {t('members.filters.allStatuses', {
                  defaultValue: 'All statuses',
                })}
              </NativeSelectOption>
              <NativeSelectOption value='active'>
                {t('members.status.active', { defaultValue: 'Active' })}
              </NativeSelectOption>
              <NativeSelectOption value='disabled'>
                {t('members.status.disabled', { defaultValue: 'Disabled' })}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor='member-role' className='sr-only'>
              {t('members.filters.role', { defaultValue: 'Filter by role' })}
            </Label>
            <NativeSelect
              id='member-role'
              className='w-full lg:w-48'
              value={role}
              onChange={(event) => {
                setRole(event.target.value as 'all' | RoleKey);
                setPage(1);
              }}
            >
              <NativeSelectOption value='all'>
                {t('members.filters.allRoles', { defaultValue: 'All roles' })}
              </NativeSelectOption>
              {BUILT_IN_ROLES.map((item) => (
                <NativeSelectOption key={item.key} value={item.key}>
                  {roleLabel(item.key)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
      </FilterPanel>

      {visibleMembers.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t('members.empty.title', { defaultValue: 'No members' })}
          description={t('members.empty.description', {
            defaultValue: 'No Hub members match the current filters.',
          })}
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table className='min-w-[980px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='pl-4'>
                    {t('members.columns.name', { defaultValue: 'Name' })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.email', { defaultValue: 'Email' })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.roles', { defaultValue: 'Roles' })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.applications', {
                      defaultValue: 'Visible applications',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.lastActive', {
                      defaultValue: 'Last active',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.status', { defaultValue: 'Status' })}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('members.columns.actions', { defaultValue: 'Actions' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className='pl-4'>
                      <p className='font-medium'>{member.name}</p>
                      <p className='text-xs text-muted-foreground'>
                        @{member.username}
                      </p>
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <div className='flex max-w-64 flex-wrap gap-1'>
                        {memberRoles(member).map((memberRole) => (
                          <Badge key={memberRole} variant='secondary'>
                            {roleLabel(memberRole)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{visibleApplicationCount(member)}</TableCell>
                    <TableCell>
                      {formatDate(member.lastActiveAt, locale)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={member.status} />
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          aria-label={t('members.actions.editAccessFor', {
                            defaultValue: 'Edit access for {{name}}',
                            name: member.name,
                          }).replace('{{name}}', member.name)}
                          onClick={() => setEditingMember(member)}
                        >
                          {t('members.actions.editAccess', {
                            defaultValue: 'Edit access',
                          })}
                        </Button>
                        <Button
                          size='sm'
                          variant={
                            member.status === 'active'
                              ? 'destructive'
                              : 'outline'
                          }
                          aria-label={interpolateMessage(
                            member.status === 'active'
                              ? t('members.actions.disableFor', {
                                  defaultValue: 'Disable {{name}}',
                                  name: member.name,
                                })
                              : t('members.actions.enableFor', {
                                  defaultValue: 'Enable {{name}}',
                                  name: member.name,
                                }),
                            { name: member.name },
                          )}
                          onClick={() => setStatusMember(member)}
                        >
                          {member.status === 'active'
                            ? t('members.actions.disable', {
                                defaultValue: 'Disable',
                              })
                            : t('members.actions.enable', {
                                defaultValue: 'Enable',
                              })}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <Pagination
            page={safePage}
            pageCount={pageCount}
            total={filteredMembers.length}
            onPageChange={setPage}
          />
        </Card>
      )}

      <MemberAccessDialog
        member={editingMember}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
        onSave={(access) => {
          if (!editingMember) return;
          onMembersChange(
            members.map((member) =>
              member.id === editingMember.id ? { ...member, access } : member,
            ),
          );
          setFeedback(
            t('members.feedback.accessSaved', {
              defaultValue: 'Access saved for {{name}}.',
              name: editingMember.name,
            }),
          );
          setEditingMember(null);
        }}
      />
      <MemberStatusDialog
        member={statusMember}
        onOpenChange={(open) => {
          if (!open) setStatusMember(null);
        }}
        onConfirm={() => {
          if (!statusMember) return;
          onMembersChange(
            members.map((member) =>
              member.id === statusMember.id
                ? {
                    ...member,
                    status: member.status === 'active' ? 'disabled' : 'active',
                  }
                : member,
            ),
          );
          setFeedback(
            t('members.feedback.statusUpdated', {
              defaultValue: 'Status updated for {{name}}.',
              name: statusMember.name,
            }),
          );
          setStatusMember(null);
        }}
      />
    </div>
  );
}

function FilterPanel({ children }: { children: ReactElement[] }): ReactElement {
  return (
    <div className='flex flex-col gap-3 rounded-xl border bg-card/70 p-3 shadow-xs lg:flex-row lg:items-center'>
      {children}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: MemberStatus | InvitationStatus | CredentialStatus;
}): ReactElement {
  const { t } = useTranslation();
  const active = status === 'active' || status === 'accepted';
  const pending = status === 'pending';
  let label: string;
  switch (status) {
    case 'active':
      label = t('members.status.active', { defaultValue: 'Active' });
      break;
    case 'disabled':
      label = t('members.status.disabled', { defaultValue: 'Disabled' });
      break;
    case 'pending':
      label = t('members.status.pending', { defaultValue: 'Pending' });
      break;
    case 'accepted':
      label = t('members.status.accepted', { defaultValue: 'Accepted' });
      break;
    case 'expired':
      label = t('members.status.expired', { defaultValue: 'Expired' });
      break;
    case 'revoked':
      label = t('members.status.revoked', { defaultValue: 'Revoked' });
      break;
  }
  return (
    <Badge
      variant={active ? 'secondary' : pending ? 'outline' : 'destructive'}
      className={active ? 'text-primary' : undefined}
    >
      <span
        className={
          active
            ? 'size-1.5 rounded-full bg-primary'
            : pending
              ? 'size-1.5 rounded-full bg-muted-foreground'
              : 'size-1.5 rounded-full bg-current'
        }
        aria-hidden='true'
      />
      {label}
    </Badge>
  );
}

function MemberAccessDialog({
  member,
  onOpenChange,
  onSave,
}: {
  member: HubMember | null;
  onOpenChange: (open: boolean) => void;
  onSave: (access: MemberAccess) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<MemberAccess | null>(null);
  const selected = draft ?? (member ? cloneAccess(member.access) : null);

  const updateDraft = (access: MemberAccess): void => setDraft(access);
  const setOpen = (open: boolean): void => {
    if (open && member) setDraft(cloneAccess(member.access));
    if (!open) setDraft(null);
    onOpenChange(open);
  };

  return (
    <Dialog open={member !== null} onOpenChange={setOpen}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('members.access.title', {
              defaultValue: member ? `Access for ${member.name}` : 'Access',
              name: member?.name ?? '',
            }).replace('{{name}}', member?.name ?? '')}
          </DialogTitle>
          <DialogDescription>
            {t('members.access.description', {
              defaultValue:
                'Global roles apply across Hub. Application roles apply only to the selected application.',
            })}
          </DialogDescription>
        </DialogHeader>
        {selected ? (
          <div className='space-y-5'>
            <RoleCheckboxGroup
              title={t('members.access.globalRoles', {
                defaultValue: 'Global roles',
              })}
              roles={BUILT_IN_ROLES.filter((role) =>
                role.scopes.includes('global'),
              )}
              selected={selected.globalRoles}
              onChange={(roles) =>
                updateDraft({ ...selected, globalRoles: roles })
              }
              ariaPrefix={t('members.access.globalRole', {
                defaultValue: 'Global role',
              })}
            />
            <div className='space-y-3'>
              <h3 className='text-sm font-semibold'>
                {t('members.access.applicationRoles', {
                  defaultValue: 'Application roles',
                })}
              </h3>
              {HUB_APPLICATIONS.map((application) => (
                <div
                  key={application.id}
                  className='rounded-xl border bg-muted/15 p-3'
                >
                  <RoleCheckboxGroup
                    title={application.name}
                    roles={BUILT_IN_ROLES.filter((role) =>
                      role.scopes.includes('application'),
                    )}
                    selected={selected.applicationRoles[application.id] ?? []}
                    onChange={(roles) =>
                      updateDraft({
                        ...selected,
                        applicationRoles: {
                          ...selected.applicationRoles,
                          [application.id]: roles,
                        },
                      })
                    }
                    ariaPrefix={t('members.access.applicationRole', {
                      defaultValue: '{{name}} role',
                      name: application.name,
                    }).replace('{{name}}', application.name)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const nextAccess = cloneAccess(selected);
              setDraft(null);
              onSave(nextAccess);
            }}
          >
            {t('members.access.save', { defaultValue: 'Save access' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleCheckboxGroup({
  title,
  roles,
  selected,
  onChange,
  ariaPrefix,
}: {
  title: string;
  roles: BuiltInRole[];
  selected: RoleKey[];
  onChange: (roles: RoleKey[]) => void;
  ariaPrefix: string;
}): ReactElement {
  const roleLabel = useRoleLabel();
  return (
    <fieldset className='space-y-2'>
      <legend className='text-sm font-medium'>{title}</legend>
      <div className='flex flex-wrap gap-x-5 gap-y-3'>
        {roles.map((role) => (
          <label key={role.key} className='flex items-center gap-2'>
            <Checkbox
              checked={selected.includes(role.key)}
              aria-label={`${ariaPrefix} ${roleLabel(role.key)}`}
              onCheckedChange={(checked) =>
                onChange(toggleValue(selected, role.key, checked === true))
              }
            />
            <span className='text-sm'>{roleLabel(role.key)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MemberStatusDialog({
  member,
  onOpenChange,
  onConfirm,
}: {
  member: HubMember | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const enabling = member?.status === 'disabled';
  return (
    <AlertDialog open={member !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {enabling
              ? t('members.statusDialog.enableTitle', {
                  defaultValue: 'Enable member',
                })
              : t('members.statusDialog.disableTitle', {
                  defaultValue: 'Disable member',
                })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {enabling
              ? t('members.statusDialog.enableDescription', {
                  defaultValue:
                    'Enable this member and allow them to sign in again?',
                })
              : t('members.statusDialog.disableDescription', {
                  defaultValue:
                    'Disable this member and revoke their active sessions?',
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={enabling ? 'default' : 'destructive'}
            onClick={onConfirm}
          >
            {enabling
              ? t('members.statusDialog.confirmEnable', {
                  defaultValue: 'Confirm enable',
                })
              : t('members.statusDialog.confirmDisable', {
                  defaultValue: 'Confirm disable',
                })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InviteMemberDialog({
  open,
  onOpenChange,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (invitation: HubInvitation) => void;
}): ReactElement {
  const { t } = useTranslation();
  const roleLabel = useRoleLabel();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey>('viewer');
  const [scope, setScope] = useState<'global' | ApplicationId>('global');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const availableRoles = BUILT_IN_ROLES.filter((item) =>
    roleSupportsScope(item, scope),
  );

  const reset = (): void => {
    setEmail('');
    setRole('viewer');
    setScope('global');
    setExpiresInDays(7);
    setError(null);
    setInvitationLink(null);
    setCopied(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!isValidInvitationEmail(email)) {
      setError(
        t('members.invite.validation.email', {
          defaultValue: 'Enter a valid email address.',
        }),
      );
      return;
    }
    const selectedRole = BUILT_IN_ROLES.find((item) => item.key === role);
    if (!selectedRole || !roleSupportsScope(selectedRole, scope)) {
      setError(
        t('members.invite.validation.roleScope', {
          defaultValue: 'Choose a role supported by the selected scope.',
        }),
      );
      return;
    }
    if (expiresInDays < 1 || expiresInDays > 30) {
      setError(
        t('members.invite.validation.expiry', {
          defaultValue: 'Invitation validity must be between 1 and 30 days.',
        }),
      );
      return;
    }
    const now = new Date();
    const expires = new Date(now);
    expires.setUTCDate(expires.getUTCDate() + expiresInDays);
    const token = globalThis.crypto.randomUUID();
    onInvite({
      id: `invite-local-${globalThis.crypto.randomUUID()}`,
      email: email.trim(),
      role,
      scope,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    });
    setInvitationLink(
      `${window.location.origin}/hub/invitations/accept?token=${encodeURIComponent(token)}`,
    );
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg'>
        {invitationLink ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('members.invite.ready.title', {
                  defaultValue: 'Invitation ready',
                })}
              </DialogTitle>
              <DialogDescription>
                {t('members.invite.ready.description', {
                  defaultValue:
                    'Share this one-time link securely. It is simulated locally and is not connected to a backend yet.',
                })}
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-2'>
              <Label htmlFor='invitation-link'>
                {t('members.invite.ready.link', {
                  defaultValue: 'Invitation link',
                })}
              </Label>
              <Input
                id='invitation-link'
                readOnly
                value={invitationLink}
                className='font-mono text-xs'
              />
              <p className='text-xs text-muted-foreground'>
                {t('members.invite.ready.expiry', {
                  defaultValue:
                    'The link follows the invitation expiry selected in the previous step.',
                })}
              </p>
            </div>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  void copyText(invitationLink).then(() => setCopied(true));
                }}
              >
                <Copy aria-hidden='true' />
                {copied
                  ? t('members.invite.ready.copied', {
                      defaultValue: 'Link copied',
                    })
                  : t('members.invite.ready.copy', {
                      defaultValue: 'Copy invitation link',
                    })}
              </Button>
              <Button
                type='button'
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                {t('members.invite.ready.done', { defaultValue: 'Done' })}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className='contents' noValidate>
            <DialogHeader>
              <DialogTitle>
                {t('members.invite.title', { defaultValue: 'Invite member' })}
              </DialogTitle>
              <DialogDescription>
                {t('members.invite.description', {
                  defaultValue:
                    'Create a local invitation and choose the member’s initial access.',
                })}
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4'>
              {error ? (
                <p role='alert' className='text-sm text-destructive'>
                  {error}
                </p>
              ) : null}
              <div className='space-y-2'>
                <Label htmlFor='invite-email'>
                  {t('members.invite.email', { defaultValue: 'Email' })}
                </Label>
                <Input
                  id='invite-email'
                  type='email'
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={
                    error !== null && !isValidInvitationEmail(email)
                  }
                  autoComplete='email'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='invite-role'>
                  {t('members.invite.role', { defaultValue: 'Role' })}
                </Label>
                <NativeSelect
                  id='invite-role'
                  className='w-full'
                  value={role}
                  onChange={(event) => setRole(event.target.value as RoleKey)}
                >
                  {availableRoles.map((item) => (
                    <NativeSelectOption key={item.key} value={item.key}>
                      {roleLabel(item.key)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='invite-scope'>
                  {t('members.invite.scope', { defaultValue: 'Access scope' })}
                </Label>
                <NativeSelect
                  id='invite-scope'
                  className='w-full'
                  value={scope}
                  onChange={(event) => {
                    const nextScope = event.target.value as
                      'global' | ApplicationId;
                    const currentRole = BUILT_IN_ROLES.find(
                      (item) => item.key === role,
                    );
                    setScope(nextScope);
                    if (
                      !currentRole ||
                      !roleSupportsScope(currentRole, nextScope)
                    ) {
                      const nextRole = BUILT_IN_ROLES.find((item) =>
                        roleSupportsScope(item, nextScope),
                      );
                      if (nextRole) setRole(nextRole.key);
                    }
                  }}
                >
                  <NativeSelectOption value='global'>
                    {t('members.invite.allApplications', {
                      defaultValue: 'All applications',
                    })}
                  </NativeSelectOption>
                  {HUB_APPLICATIONS.map((application) => (
                    <NativeSelectOption
                      key={application.id}
                      value={application.id}
                    >
                      {application.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='invite-expiry'>
                  {t('members.invite.expiry', {
                    defaultValue: 'Invitation validity in days',
                  })}
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
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type='submit'>
                {t('members.invite.submit', {
                  defaultValue: 'Send invitation',
                })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvitationList({
  invitations,
  onInvitationsChange,
}: {
  invitations: HubInvitation[];
  onInvitationsChange: (invitations: HubInvitation[]) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const roleLabel = useRoleLabel();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | InvitationStatus>('all');
  const [page, setPage] = useState(1);
  const [pendingRevoke, setPendingRevoke] = useState<HubInvitation | null>(
    null,
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return invitations.filter(
      (invitation) =>
        (query.length === 0 ||
          invitation.email.toLocaleLowerCase().includes(query)) &&
        (status === 'all' || invitation.status === status),
    );
  }, [invitations, search, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const scopeLabel = (scope: 'global' | ApplicationId): string => {
    if (scope === 'global') {
      return t('members.invitations.scope.all', {
        defaultValue: 'All applications',
      });
    }
    return (
      HUB_APPLICATIONS.find((application) => application.id === scope)?.name ??
      scope
    );
  };

  return (
    <div className='space-y-4'>
      {feedback ? <Feedback message={feedback} /> : null}
      <FilterPanel>
        <div className='relative min-w-0 flex-1 lg:max-w-md'>
          <Label htmlFor='invitation-search' className='sr-only'>
            {t('members.invitations.search', {
              defaultValue: 'Search invitations',
            })}
          </Label>
          <Search
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          <Input
            id='invitation-search'
            className='pl-8'
            value={search}
            placeholder={t('members.invitations.searchPlaceholder', {
              defaultValue: 'Search invited email',
            })}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor='invitation-status' className='sr-only'>
            {t('members.invitations.statusFilter', {
              defaultValue: 'Filter by invitation status',
            })}
          </Label>
          <NativeSelect
            id='invitation-status'
            className='w-full lg:w-48'
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'all' | InvitationStatus);
              setPage(1);
            }}
          >
            <NativeSelectOption value='all'>
              {t('members.filters.allStatuses', {
                defaultValue: 'All statuses',
              })}
            </NativeSelectOption>
            <NativeSelectOption value='pending'>
              {t('members.status.pending', { defaultValue: 'Pending' })}
            </NativeSelectOption>
            <NativeSelectOption value='accepted'>
              {t('members.status.accepted', { defaultValue: 'Accepted' })}
            </NativeSelectOption>
            <NativeSelectOption value='expired'>
              {t('members.status.expired', { defaultValue: 'Expired' })}
            </NativeSelectOption>
            <NativeSelectOption value='revoked'>
              {t('members.status.revoked', { defaultValue: 'Revoked' })}
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </FilterPanel>

      {visible.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title={t('members.invitations.empty.title', {
            defaultValue: 'No invitations',
          })}
          description={t('members.invitations.empty.description', {
            defaultValue: 'No invitations match the current filters.',
          })}
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table className='min-w-[820px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='pl-4'>
                    {t('members.columns.email', { defaultValue: 'Email' })}
                  </TableHead>
                  <TableHead>
                    {t('members.invitations.access', {
                      defaultValue: 'Access',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.status', { defaultValue: 'Status' })}
                  </TableHead>
                  <TableHead>
                    {t('members.invitations.expires', {
                      defaultValue: 'Expires',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('members.invitations.created', {
                      defaultValue: 'Created',
                    })}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('members.columns.actions', { defaultValue: 'Actions' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className='pl-4 font-medium'>
                      {invitation.email}
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <Badge variant='outline'>
                          {roleLabel(invitation.role)}
                        </Badge>
                        <span className='text-xs text-muted-foreground'>
                          {scopeLabel(invitation.scope)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invitation.status} />
                    </TableCell>
                    <TableCell>
                      {formatDate(invitation.expiresAt, locale)}
                    </TableCell>
                    <TableCell>
                      {formatDate(invitation.createdAt, locale)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {invitation.status === 'pending' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          aria-label={t('members.invitations.revoke', {
                            defaultValue: 'Revoke invitation for {{email}}',
                            email: invitation.email,
                          }).replace('{{email}}', invitation.email)}
                          onClick={() => setPendingRevoke(invitation)}
                        >
                          {t('members.actions.revoke', {
                            defaultValue: 'Revoke',
                          })}
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
          <Pagination
            page={safePage}
            pageCount={pageCount}
            total={filtered.length}
            onPageChange={setPage}
          />
        </Card>
      )}
      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('members.invitations.revokeTitle', {
                defaultValue: 'Revoke invitation',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('members.invitations.revokeDescription', {
                defaultValue:
                  'Revoke this invitation? Its link will stop working immediately.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                if (!pendingRevoke) return;
                onInvitationsChange(
                  invitations.map((invitation) =>
                    invitation.id === pendingRevoke.id
                      ? { ...invitation, status: 'revoked' }
                      : invitation,
                  ),
                );
                setFeedback(
                  t('members.feedback.invitationRevoked', {
                    defaultValue: 'Invitation revoked for {{email}}.',
                    email: pendingRevoke.email,
                  }),
                );
                setPendingRevoke(null);
              }}
            >
              {t('members.invitations.confirmRevoke', {
                defaultValue: 'Confirm revoke',
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CredentialList({
  credentials,
  onCredentialsChange,
}: {
  credentials: HubAgentCredential[];
  onCredentialsChange: (credentials: HubAgentCredential[]) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | CredentialStatus>('all');
  const [page, setPage] = useState(1);
  const [pendingRevoke, setPendingRevoke] = useState<HubAgentCredential | null>(
    null,
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return credentials.filter(
      (credential) =>
        (query.length === 0 ||
          [credential.name, credential.clientId].some((value) =>
            value.toLocaleLowerCase().includes(query),
          )) &&
        (status === 'all' || credential.status === status),
    );
  }, [credentials, search, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const scopeLabel = (scope: 'global' | ApplicationId): string =>
    scope === 'global'
      ? t('members.credentials.allAuthorized', {
          defaultValue: 'All authorized applications',
        })
      : (HUB_APPLICATIONS.find((application) => application.id === scope)
          ?.name ?? scope);

  return (
    <div className='space-y-4'>
      {feedback ? <Feedback message={feedback} /> : null}
      <FilterPanel>
        <div className='relative min-w-0 flex-1 lg:max-w-md'>
          <Label htmlFor='credential-search' className='sr-only'>
            {t('members.credentials.search', {
              defaultValue: 'Search Agent credentials',
            })}
          </Label>
          <Search
            className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden='true'
          />
          <Input
            id='credential-search'
            className='pl-8'
            value={search}
            placeholder={t('members.credentials.searchPlaceholder', {
              defaultValue: 'Search Agent name or client ID',
            })}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor='credential-status' className='sr-only'>
            {t('members.credentials.statusFilter', {
              defaultValue: 'Filter by credential status',
            })}
          </Label>
          <NativeSelect
            id='credential-status'
            className='w-full lg:w-48'
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'all' | CredentialStatus);
              setPage(1);
            }}
          >
            <NativeSelectOption value='all'>
              {t('members.filters.allStatuses', {
                defaultValue: 'All statuses',
              })}
            </NativeSelectOption>
            <NativeSelectOption value='active'>
              {t('members.status.active', { defaultValue: 'Active' })}
            </NativeSelectOption>
            <NativeSelectOption value='revoked'>
              {t('members.status.revoked', { defaultValue: 'Revoked' })}
            </NativeSelectOption>
            <NativeSelectOption value='expired'>
              {t('members.status.expired', { defaultValue: 'Expired' })}
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </FilterPanel>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Bot />}
          title={t('members.credentials.empty.title', {
            defaultValue: 'No Agent credentials',
          })}
          description={t('members.credentials.empty.description', {
            defaultValue: 'No credentials match the current filters.',
          })}
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='px-0'>
            <Table className='min-w-[900px]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='pl-4'>
                    {t('members.credentials.agent', { defaultValue: 'Agent' })}
                  </TableHead>
                  <TableHead>
                    {t('members.credentials.scopes', {
                      defaultValue: 'Scopes',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('members.credentials.applicationScope', {
                      defaultValue: 'Application scope',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('members.columns.status', { defaultValue: 'Status' })}
                  </TableHead>
                  <TableHead>
                    {t('members.credentials.lastUsed', {
                      defaultValue: 'Last used',
                    })}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('members.columns.actions', { defaultValue: 'Actions' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((credential) => (
                  <TableRow key={credential.id}>
                    <TableCell className='pl-4'>
                      <p className='font-medium'>{credential.name}</p>
                      <p className='font-mono text-xs text-muted-foreground'>
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
                      {scopeLabel(credential.applicationScope)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={credential.status} />
                    </TableCell>
                    <TableCell>
                      {formatDate(credential.lastUsedAt, locale)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {credential.status === 'active' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          aria-label={t('members.credentials.revoke', {
                            defaultValue: 'Revoke credential {{name}}',
                            name: credential.name,
                          }).replace('{{name}}', credential.name)}
                          onClick={() => setPendingRevoke(credential)}
                        >
                          {t('members.actions.revoke', {
                            defaultValue: 'Revoke',
                          })}
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
          <Pagination
            page={safePage}
            pageCount={pageCount}
            total={filtered.length}
            onPageChange={setPage}
          />
        </Card>
      )}
      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('members.credentials.revokeTitle', {
                defaultValue: 'Revoke Agent credential',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('members.credentials.revokeDescription', {
                defaultValue:
                  'Revoke this Agent credential? The Agent will lose Hub access immediately.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                if (!pendingRevoke) return;
                onCredentialsChange(
                  credentials.map((credential) =>
                    credential.id === pendingRevoke.id
                      ? { ...credential, status: 'revoked' }
                      : credential,
                  ),
                );
                setFeedback(
                  t('members.feedback.credentialRevoked', {
                    defaultValue: 'Credential revoked for {{name}}.',
                    name: pendingRevoke.name,
                  }),
                );
                setPendingRevoke(null);
              }}
            >
              {t('members.credentials.confirmRevoke', {
                defaultValue: 'Confirm revoke',
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoleCatalog(): ReactElement {
  const { t } = useTranslation();
  const roleLabel = useRoleLabel();

  const roleDescription = (role: RoleKey): string => {
    switch (role) {
      case 'administrator':
        return t('members.roleCatalog.administratorDescription', {
          defaultValue: 'Full Hub administration and access management.',
        });
      case 'developer':
        return t('members.roleCatalog.developerDescription', {
          defaultValue: 'Build and publish application releases.',
        });
      case 'deployer':
        return t('members.roleCatalog.deployerDescription', {
          defaultValue: 'Deploy releases and control application runtimes.',
        });
      case 'viewer':
        return t('members.roleCatalog.viewerDescription', {
          defaultValue: 'Read-only access',
        });
    }
  };

  const resourceLabel = (resource: string): string => {
    switch (resource) {
      case 'applications':
        return t('members.roleCatalog.resources.applications', {
          defaultValue: 'Applications',
        });
      case 'members':
        return t('members.roleCatalog.resources.members', {
          defaultValue: 'Members and access',
        });
      case 'audit':
        return t('members.roleCatalog.resources.audit', {
          defaultValue: 'Audit log',
        });
      case 'releases':
        return t('members.roleCatalog.resources.releases', {
          defaultValue: 'Releases',
        });
      case 'deployments':
        return t('members.roleCatalog.resources.deployments', {
          defaultValue: 'Deployments',
        });
      case 'runtime':
        return t('members.roleCatalog.resources.runtime', {
          defaultValue: 'Runtime',
        });
      case 'activity':
        return t('members.roleCatalog.resources.activity', {
          defaultValue: 'Activity',
        });
      default:
        return resource;
    }
  };

  const actionLabel = (action: string): string => {
    switch (action) {
      case 'create':
        return t('members.roleCatalog.actions.create', {
          defaultValue: 'Create',
        });
      case 'read':
        return t('members.roleCatalog.actions.read', { defaultValue: 'Read' });
      case 'update':
        return t('members.roleCatalog.actions.update', {
          defaultValue: 'Update',
        });
      case 'invite':
        return t('members.roleCatalog.actions.invite', {
          defaultValue: 'Invite',
        });
      case 'manage':
        return t('members.roleCatalog.actions.manage', {
          defaultValue: 'Manage',
        });
      case 'export':
        return t('members.roleCatalog.actions.export', {
          defaultValue: 'Export',
        });
      case 'publish':
        return t('members.roleCatalog.actions.publish', {
          defaultValue: 'Publish',
        });
      case 'redeploy':
        return t('members.roleCatalog.actions.redeploy', {
          defaultValue: 'Redeploy',
        });
      case 'start':
        return t('members.roleCatalog.actions.start', {
          defaultValue: 'Start',
        });
      case 'stop':
        return t('members.roleCatalog.actions.stop', { defaultValue: 'Stop' });
      case 'restart':
        return t('members.roleCatalog.actions.restart', {
          defaultValue: 'Restart',
        });
      default:
        return action;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('members.roleCatalog.title', {
            defaultValue: 'Built-in role capabilities',
          })}
        </CardTitle>
        <CardDescription>
          {t('members.roleCatalog.description', {
            defaultValue:
              'These capability sets are read-only and provide a predictable access model for every application.',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {BUILT_IN_ROLES.map((role) => (
          <article
            key={role.key}
            className='h-full rounded-xl border bg-muted/15 p-4'
          >
            <div className='flex items-start justify-between gap-3'>
              <div>
                <h3 className='font-semibold'>{roleLabel(role.key)}</h3>
                <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                  {roleDescription(role.key)}
                </p>
              </div>
              <div className='flex flex-wrap justify-end gap-1'>
                {role.scopes.map((scope) => (
                  <Badge key={scope} variant='outline'>
                    {scope === 'global'
                      ? t('members.roleCatalog.scope.global', {
                          defaultValue: 'Global',
                        })
                      : t('members.roleCatalog.scope.application', {
                          defaultValue: 'Application',
                        })}
                  </Badge>
                ))}
              </div>
            </div>
            <div className='mt-4 space-y-3'>
              {role.capabilities.map((capability) => (
                <div key={capability.resource}>
                  <p className='text-xs font-medium'>
                    {resourceLabel(capability.resource)}
                  </p>
                  <p className='mt-0.5 text-xs leading-5 text-muted-foreground'>
                    {capability.actions.map(actionLabel).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-xs text-muted-foreground'>
        {t('members.pagination.total', {
          defaultValue: `${String(total)} total records`,
          total,
        })}
      </p>
      <div className='flex items-center gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('members.pagination.previous', { defaultValue: 'Previous' })}
        </Button>
        <span className='min-w-20 text-center text-xs text-muted-foreground'>
          {t('members.pagination.page', {
            defaultValue: `Page ${String(page)} of ${String(pageCount)}`,
            page,
            pageCount,
          })}
        </span>
        <Button
          size='sm'
          variant='outline'
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          {t('members.pagination.next', { defaultValue: 'Next' })}
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactElement;
  title: string;
  description: string;
}): ReactElement {
  return (
    <Empty className='min-h-64 border bg-card'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function Feedback({ message }: { message: string }): ReactElement {
  return (
    <div
      role='status'
      className='flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-foreground'
    >
      <CircleCheck
        className='size-4 shrink-0 text-primary'
        aria-hidden='true'
      />
      {message}
    </div>
  );
}
