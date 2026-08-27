export type ReleaseControlErrorKind =
  'authentication' | 'authorization' | 'app-host' | 'control-plane';

export interface ReleaseControlErrorPresentation {
  kind: ReleaseControlErrorKind;
  title: string;
  description: string;
}

export function presentReleaseControlError(
  message: string,
  code?: string | null,
  status?: number | null,
): ReleaseControlErrorPresentation {
  if (code === 'RELEASE_AUTH_REQUIRED' || status === 401) {
    return {
      kind: 'authentication',
      title: '登录状态需要刷新',
      description: `${message}。请重新登录 Hub 后再查看 App 和部署状态。`,
    };
  }
  if (code === 'RELEASE_FORBIDDEN' || status === 403) {
    return {
      kind: 'authorization',
      title: '当前账号没有部署管理权限',
      description: `${message}。App Host 可能正常运行，但该账号不能读取或操作部署控制面。`,
    };
  }
  if (code === 'APP_HOST_UNAVAILABLE' || code === 'APP_HOST_REQUEST_FAILED') {
    return {
      kind: 'app-host',
      title: 'App Host 尚未连接',
      description: `${message}。Hub 身份与设置仍可使用；恢复 App Host 后即可读取 App 和发布状态。`,
    };
  }
  return {
    kind: 'control-plane',
    title: '部署控制面暂时不可用',
    description: `${message}。请检查 Hub 部署服务和 App Host 状态。`,
  };
}
