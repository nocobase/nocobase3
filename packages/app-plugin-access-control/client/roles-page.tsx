import { useAppClient } from '@nocobase/app-client';
import type { AppSettingsModulePageProps } from '@nocobase/app-plugin-settings/client';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import type { AppAccessRoleSummary } from '../types.js';
import { AccessNotice, AccessSettingsShell } from './access-settings-shell.js';
import { createAppAccessControlClient, requestErrorMessage } from './api.js';

export default function AccessRolesPage({
  basePath,
  module,
}: AppSettingsModulePageProps): ReactElement {
  const appClient = useAppClient();
  const api = useMemo(
    () => createAppAccessControlClient(appClient),
    [appClient],
  );
  const [roles, setRoles] = useState<AppAccessRoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .fetchRoles()
      .then(setRoles)
      .catch((requestError: unknown) =>
        setError(requestErrorMessage(requestError)),
      );
  }, [api]);

  return (
    <AccessSettingsShell
      basePath={basePath}
      description='定义当前 App 内的职责角色。用户通过分配角色获得相应的业务能力。'
      module={module}
    >
      {error ? (
        <AccessNotice title='无法读取角色' tone='danger'>
          {error}
        </AccessNotice>
      ) : null}
      <div className='grid gap-4 lg:grid-cols-3'>
        {roles.map((role) => (
          <RoleCard basePath={basePath} key={role.key} role={role} />
        ))}
      </div>
      <AccessNotice title='预览版边界'>
        当前先提供各 App
        预置的职责角色。新增自定义角色、角色继承和组织层级将在后续版本中接入。
      </AccessNotice>
    </AccessSettingsShell>
  );
}

export function AccessPermissionsPage({
  basePath,
  module,
}: AppSettingsModulePageProps): ReactElement {
  const appClient = useAppClient();
  const api = useMemo(
    () => createAppAccessControlClient(appClient),
    [appClient],
  );
  const [roles, setRoles] = useState<AppAccessRoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .fetchRoles()
      .then(setRoles)
      .catch((requestError: unknown) =>
        setError(requestErrorMessage(requestError)),
      );
  }, [api]);

  return (
    <AccessSettingsShell
      basePath={basePath}
      description='按角色配置当前 App 业务资源的查看、新建、编辑、删除权限，以及可用的数据范围。'
      module={module}
    >
      {error ? (
        <AccessNotice title='无法读取权限配置' tone='danger'>
          {error}
        </AccessNotice>
      ) : null}
      <AccessNotice title='服务端强制执行' tone='success'>
        这里保存的是 App 的真实权限配置。业务 API
        必须读取同一份结果，不能只靠隐藏菜单或按钮控制访问。
      </AccessNotice>
      <div className='grid gap-4 lg:grid-cols-3'>
        {roles.map((role) => (
          <RoleCard basePath={basePath} key={role.key} role={role} />
        ))}
      </div>
    </AccessSettingsShell>
  );
}

function RoleCard({
  basePath,
  role,
}: {
  readonly basePath: string;
  readonly role: AppAccessRoleSummary;
}): ReactElement {
  return (
    <article className='flex min-h-60 flex-col rounded-xl border border-border bg-card'>
      <div className='flex-1 p-5'>
        <div className='flex items-start justify-between gap-3'>
          <span className='grid size-10 place-items-center rounded-xl bg-primary/10 text-primary'>
            <ShieldCheck className='size-5' />
          </span>
          <span className='rounded-full border border-border px-2 py-0.5 text-xs'>
            {role.memberCount} 人
          </span>
        </div>
        <h2 className='mt-4 text-lg font-semibold'>{role.title}</h2>
        <p className='mt-2 text-sm leading-6 text-muted-foreground'>
          {role.description}
        </p>
      </div>
      <div className='border-t border-border p-4'>
        <Link
          className='inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted'
          to={`${basePath}/permissions?role=${encodeURIComponent(role.key)}`}
        >
          配置权限 <ArrowRight className='size-4' />
        </Link>
      </div>
    </article>
  );
}
