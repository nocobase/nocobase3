import { useAppClient } from '@nocobase/app-client';
import type { AppSettingsModulePageProps } from '@nocobase/app-plugin-settings/client';
import { Plus, RefreshCw, UserRoundCheck, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import type {
  AppAccessMemberCreate,
  AppAccessMemberStatus,
  AppAccessMemberSummary,
  AppAccessRoleSummary,
} from '../types.js';
import {
  AccessButton,
  AccessNotice,
  AccessSettingsShell,
} from './access-settings-shell.js';
import { createAppAccessControlClient, requestErrorMessage } from './api.js';

export default function AccessMembersPage({
  basePath,
  module,
}: AppSettingsModulePageProps): ReactElement {
  const appClient = useAppClient();
  const api = useMemo(
    () => createAppAccessControlClient(appClient),
    [appClient],
  );
  const [members, setMembers] = useState<AppAccessMemberSummary[]>([]);
  const [roles, setRoles] = useState<AppAccessRoleSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const [nextMembers, nextRoles] = await Promise.all([
        api.fetchMembers(),
        api.fetchRoles(),
      ]);
      setMembers(nextMembers);
      setRoles(nextRoles);
      setError(null);
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    let active = true;
    void Promise.all([api.fetchMembers(), api.fetchRoles()])
      .then(([nextMembers, nextRoles]) => {
        if (!active) return;
        setMembers(nextMembers);
        setRoles(nextRoles);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <AccessSettingsShell
      basePath={basePath}
      action={
        <div className='flex gap-2'>
          <AccessButton
            disabled={busy}
            onClick={() => void refresh()}
            variant='outline'
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
            刷新
          </AccessButton>
          <AccessButton onClick={() => setDialogOpen(true)}>
            <Plus className='size-4' /> 新增成员
          </AccessButton>
        </div>
      }
      description='管理当前 App 的登录账号、启用状态和角色分配。成员停用后，服务端会立即拒绝其 App 请求。'
      module={module}
    >
      {error ? (
        <AccessNotice title='无法读取成员' tone='danger'>
          {error}
        </AccessNotice>
      ) : null}

      <div className='grid gap-3 sm:grid-cols-3'>
        <Summary label='App 成员' value={members.length} />
        <Summary
          label='启用账号'
          value={members.filter((member) => member.status === 'active').length}
        />
        <Summary label='角色' value={roles.length} />
      </div>

      <div className='overflow-x-auto rounded-xl border border-border bg-card'>
        <table className='w-full min-w-[820px] text-sm'>
          <thead className='bg-muted/40 text-left text-muted-foreground'>
            <tr>
              <th className='px-4 py-3 font-medium'>成员</th>
              <th className='px-4 py-3 font-medium'>登录名</th>
              <th className='px-4 py-3 font-medium'>角色</th>
              <th className='px-4 py-3 font-medium'>账号状态</th>
              <th className='px-4 py-3 text-right font-medium'>操作</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {members.map((member) => (
              <MemberRow
                api={api}
                key={member.id}
                member={member}
                onSaved={setMembers}
                roles={roles}
              />
            ))}
          </tbody>
        </table>
        {!busy && members.length === 0 ? (
          <p className='p-8 text-center text-sm text-muted-foreground'>
            暂无 App 成员
          </p>
        ) : null}
        {busy && members.length === 0 ? (
          <p className='p-8 text-center text-sm text-muted-foreground'>
            正在读取成员…
          </p>
        ) : null}
      </div>

      {dialogOpen ? (
        <CreateMemberDialog
          api={api}
          onClose={() => setDialogOpen(false)}
          onCreated={setMembers}
          roles={roles}
        />
      ) : null}
    </AccessSettingsShell>
  );
}

function MemberRow({
  api,
  member,
  roles,
  onSaved,
}: {
  readonly api: ReturnType<typeof createAppAccessControlClient>;
  readonly member: AppAccessMemberSummary;
  readonly roles: readonly AppAccessRoleSummary[];
  readonly onSaved: (members: AppAccessMemberSummary[]) => void;
}): ReactElement {
  const [roleKey, setRoleKey] = useState(member.roleKey);
  const [status, setStatus] = useState<AppAccessMemberStatus>(member.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = roleKey !== member.roleKey || status !== member.status;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      onSaved(await api.updateMember(member.id, { roleKey, status }));
      setError(null);
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td className='px-4 py-3'>
        <div className='flex items-center gap-3'>
          <span className='grid size-9 place-items-center rounded-full bg-primary/10 text-primary'>
            <UserRoundCheck className='size-4' />
          </span>
          <div>
            <p className='font-medium'>{member.name}</p>
            <p className='text-xs text-muted-foreground'>{member.email}</p>
            {error ? <p className='text-xs text-destructive'>{error}</p> : null}
          </div>
        </div>
      </td>
      <td className='px-4 py-3'>{member.username ?? '—'}</td>
      <td className='px-4 py-3'>
        <select
          className='h-9 w-40 rounded-lg border border-border bg-background px-3'
          onChange={(event) => setRoleKey(event.target.value)}
          value={roleKey}
        >
          {roles.map((role) => (
            <option key={role.key} value={role.key}>
              {role.title}
            </option>
          ))}
        </select>
      </td>
      <td className='px-4 py-3'>
        <label className='inline-flex items-center gap-2'>
          <input
            checked={status === 'active'}
            className='size-4 accent-primary'
            onChange={(event) =>
              setStatus(event.target.checked ? 'active' : 'disabled')
            }
            type='checkbox'
          />
          {status === 'active' ? '已启用' : '已停用'}
        </label>
      </td>
      <td className='px-4 py-3 text-right'>
        <AccessButton
          disabled={!changed || saving}
          onClick={() => void save()}
          variant={changed ? 'default' : 'outline'}
        >
          {saving ? '保存中…' : '保存'}
        </AccessButton>
      </td>
    </tr>
  );
}

function CreateMemberDialog({
  api,
  roles,
  onClose,
  onCreated,
}: {
  readonly api: ReturnType<typeof createAppAccessControlClient>;
  readonly roles: readonly AppAccessRoleSummary[];
  readonly onClose: () => void;
  readonly onCreated: (members: AppAccessMemberSummary[]) => void;
}): ReactElement {
  const initialRole =
    roles.find((role) => !role.system)?.key ?? roles[0]?.key ?? '';
  const [form, setForm] = useState<AppAccessMemberCreate>({
    name: '',
    username: '',
    email: '',
    password: '',
    roleKey: initialRole,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      onCreated(await api.createMember(form));
      onClose();
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      aria-modal='true'
      className='fixed inset-0 z-50 grid place-items-center bg-black/45 p-4'
      role='dialog'
    >
      <div className='w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h2 className='text-xl font-semibold'>新增 App 成员</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              创建真实登录账号，并立即分配当前 App 的角色。
            </p>
          </div>
          <AccessButton onClick={onClose} variant='quiet'>
            <X className='size-4' />
          </AccessButton>
        </div>
        <div className='mt-5 grid gap-4 sm:grid-cols-2'>
          <TextField
            label='姓名'
            onChange={(value) => setForm({ ...form, name: value })}
            value={form.name}
          />
          <TextField
            label='用户名'
            onChange={(value) => setForm({ ...form, username: value })}
            value={form.username}
          />
          <TextField
            label='邮箱'
            onChange={(value) => setForm({ ...form, email: value })}
            type='email'
            value={form.email}
          />
          <TextField
            label='初始密码'
            onChange={(value) => setForm({ ...form, password: value })}
            type='password'
            value={form.password}
          />
          <label className='space-y-2 sm:col-span-2'>
            <span className='text-sm font-medium'>角色</span>
            <select
              className='h-10 w-full rounded-lg border border-border bg-background px-3 text-sm'
              onChange={(event) =>
                setForm({ ...form, roleKey: event.target.value })
              }
              value={form.roleKey}
            >
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className='mt-4 text-sm text-destructive'>{error}</p>
        ) : null}
        <div className='mt-6 flex justify-end gap-2'>
          <AccessButton onClick={onClose} variant='outline'>
            取消
          </AccessButton>
          <AccessButton disabled={saving} onClick={() => void submit()}>
            {saving ? '创建中…' : '创建成员'}
          </AccessButton>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  onChange,
  type = 'text',
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'email' | 'password' | 'text';
  readonly value: string;
}): ReactElement {
  return (
    <label className='space-y-2'>
      <span className='text-sm font-medium'>{label}</span>
      <input
        className='h-10 w-full rounded-lg border border-border bg-background px-3 text-sm'
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function Summary({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-card p-4'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <div className='mt-2 flex items-center justify-between'>
        <p className='text-2xl font-semibold'>{value}</p>
        <span className='rounded-full border border-border px-2 py-0.5 text-xs'>
          实时
        </span>
      </div>
    </div>
  );
}
