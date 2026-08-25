import type { ReactElement } from 'react';

import type { AppSettingsModuleStatus } from './registry.js';

export interface AppSettingsStatusBadgeProps {
  readonly status: AppSettingsModuleStatus;
}

export function AppSettingsStatusBadge({
  status,
}: AppSettingsStatusBadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium ${getStatusClassName(status)}`}
    >
      {status}
    </span>
  );
}

function getStatusClassName(status: AppSettingsModuleStatus): string {
  if (status === '已接入') {
    return 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300';
  }
  if (status === '基础接入中') {
    return 'border-blue-500/25 bg-blue-500/5 text-blue-700 dark:text-blue-300';
  }
  if (status === '模块接入中') {
    return 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300';
  }
  return 'border-border bg-muted/40 text-muted-foreground';
}
