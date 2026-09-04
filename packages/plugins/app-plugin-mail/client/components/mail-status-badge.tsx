import type { ReactElement } from 'react';

export type MailStatusTone =
  'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface MailStatusBadgeProps {
  readonly label: string;
  readonly tone?: MailStatusTone;
}

const toneClasses: Readonly<Record<MailStatusTone, string>> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700',
};

export function MailStatusBadge({
  label,
  tone = 'neutral',
}: MailStatusBadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
