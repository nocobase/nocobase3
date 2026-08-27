import { useAppClient } from '@nocobase/app-client';
import type { AppSettingsModulePageProps } from '@nocobase/app-plugin-settings/client';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import type {
  AppAccessPermissionCapability,
  AppAccessPermissionRow,
  AppAccessRolePermissionSettings,
  AppAccessRoleSummary,
} from '../types.js';
import {
  AccessButton,
  AccessNotice,
  AccessSettingsShell,
} from './access-settings-shell.js';
import { createAppAccessControlClient, requestErrorMessage } from './api.js';

export default function AccessPermissionEditor({
  basePath,
  module,
}: AppSettingsModulePageProps): ReactElement {
  const appClient = useAppClient();
  const api = useMemo(
    () => createAppAccessControlClient(appClient),
    [appClient],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const roleKey = searchParams.get('role');
  const [roles, setRoles] = useState<AppAccessRoleSummary[]>([]);
  const [settings, setSettings] =
    useState<AppAccessRolePermissionSettings | null>(null);
  const [permissions, setPermissions] = useState<AppAccessPermissionRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .fetchRoles()
      .then((nextRoles) => {
        if (!active) return;
        setRoles(nextRoles);
        if (!roleKey && nextRoles[0]) {
          setSearchParams({ role: nextRoles[0].key }, { replace: true });
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestErrorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, [api, roleKey, setSearchParams]);
  useEffect(() => {
    if (!roleKey) return undefined;
    let active = true;
    void api
      .fetchRolePermissions(roleKey)
      .then((next) => {
        if (!active) return;
        setSettings(next);
        setPermissions(next.permissions);
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
  }, [api, roleKey]);

  const save = async (): Promise<void> => {
    if (!settings) return;
    setSaving(true);
    try {
      const next = await api.saveRolePermissions(
        settings.role.key,
        permissions,
      );
      setSettings(next);
      setPermissions(next.permissions);
      setError(null);
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = Boolean(settings?.role.system);
  return (
    <AccessSettingsShell
      basePath={basePath}
      action={
        <AccessButton
          disabled={busy || saving || readOnly || !settings}
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存权限'}
        </AccessButton>
      }
      description='按角色配置业务资源和数据范围。不同 App 使用同一套交互，但保存到各自独立的权限数据中。'
      module={module}
    >
      <div className='flex flex-wrap gap-2'>
        {roles.map((role) => (
          <button
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              role.key === roleKey
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted'
            }`}
            key={role.key}
            onClick={() => setSearchParams({ role: role.key })}
            type='button'
          >
            {role.title}
          </button>
        ))}
      </div>
      {error ? (
        <AccessNotice title='无法读取或保存权限' tone='danger'>
          {error}
        </AccessNotice>
      ) : null}
      {readOnly ? (
        <AccessNotice title='系统角色'>
          管理员拥有完整权限，预览版不允许修改，避免把 App
          锁在没有管理员的状态。
        </AccessNotice>
      ) : null}
      {settings ? (
        <section className='overflow-x-auto rounded-xl border border-border bg-card'>
          <div className='border-b border-border p-5'>
            <div className='flex items-center gap-2'>
              <ShieldCheck className='size-5 text-primary' />
              <h2 className='font-semibold'>{settings.role.title}</h2>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {settings.role.description}
            </p>
          </div>
          <table className='w-full min-w-[760px] text-sm'>
            <thead className='bg-muted/40 text-left text-muted-foreground'>
              <tr>
                <th className='px-4 py-3 font-medium'>业务资源</th>
                <th className='px-4 py-3 font-medium'>读取</th>
                <th className='px-4 py-3 font-medium'>新建</th>
                <th className='px-4 py-3 font-medium'>编辑</th>
                <th className='px-4 py-3 font-medium'>删除</th>
                <th className='px-4 py-3 font-medium'>数据范围</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {permissions.map((permission) => (
                <PermissionRow
                  disabled={readOnly}
                  key={permission.resource}
                  onChange={(next) =>
                    setPermissions((current) =>
                      current.map((item) =>
                        item.resource === next.resource ? next : item,
                      ),
                    )
                  }
                  permission={permission}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className='rounded-xl border border-border p-8 text-center text-sm text-muted-foreground'>
          {busy ? '正在读取权限…' : '请选择角色'}
        </p>
      )}
    </AccessSettingsShell>
  );
}

function PermissionRow({
  permission,
  disabled,
  onChange,
}: {
  readonly permission: AppAccessPermissionRow;
  readonly disabled: boolean;
  readonly onChange: (permission: AppAccessPermissionRow) => void;
}): ReactElement {
  const toggle = (capability: AppAccessPermissionCapability): void => {
    onChange({
      ...permission,
      capabilities: permission.capabilities.includes(capability)
        ? permission.capabilities.filter((item) => item !== capability)
        : [...permission.capabilities, capability],
    });
  };
  return (
    <tr>
      <td className='px-4 py-3 font-medium'>{permission.resourceTitle}</td>
      {(['read', 'create', 'update', 'destroy'] as const).map((capability) => {
        const allowed = permission.capabilities.includes(capability);
        return (
          <td className='px-4 py-3' key={capability}>
            <button
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                allowed
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background'
              } disabled:opacity-50`}
              disabled={disabled}
              onClick={() => toggle(capability)}
              type='button'
            >
              {allowed ? '允许' : '禁止'}
            </button>
          </td>
        );
      })}
      <td className='px-4 py-3'>
        {permission.supportsOwnScope ? (
          <div className='flex gap-1'>
            {(['all', 'own'] as const).map((scope) => (
              <button
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  permission.scope === scope
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background'
                } disabled:opacity-50`}
                disabled={disabled}
                key={scope}
                onClick={() => onChange({ ...permission, scope })}
                type='button'
              >
                {scope === 'all' ? '全部' : '本人'}
              </button>
            ))}
          </div>
        ) : (
          <span className='text-muted-foreground'>全部</span>
        )}
      </td>
    </tr>
  );
}
