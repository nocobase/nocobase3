import type { ReactElement } from 'react';

import { Badge } from './ui/badge.js';

export interface StatusBadgeProps {
  readonly label: string;
  readonly status: string;
}

/** A state chip whose tone follows the lifecycle status it reports. */
export function StatusBadge({ label, status }: StatusBadgeProps): ReactElement {
  return <Badge className={statusTone(status)}>{label}</Badge>;
}

/** Settled states read as success, in-flight ones as progress, and withdrawn ones as a warning. */
function statusTone(status: string): string {
  if (status === 'active' || status === 'succeeded')
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'failed' || status === 'targetIssue')
    return 'bg-destructive/10 text-destructive';
  if (status === 'running' || status === 'waiting')
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
  if (status === 'inactive' || status === 'triggered' || status === 'timed_out')
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
}
