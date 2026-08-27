import {
  AppSettingsStatusBadge,
  type AppSettingsRegisteredModule,
} from '@nocobase/app-plugin-settings/client';
import { ArrowLeft } from 'lucide-react';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

export interface AccessSettingsShellProps {
  readonly module: AppSettingsRegisteredModule;
  readonly basePath: string;
  readonly description: string;
  readonly action?: ReactNode;
}

export function AccessSettingsShell({
  basePath,
  module,
  description,
  action,
  children,
}: PropsWithChildren<AccessSettingsShellProps>): ReactElement {
  return (
    <div className='space-y-6'>
      <div>
        <Link
          className='mb-2 -ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-muted'
          to={basePath}
        >
          <ArrowLeft className='size-4' /> 返回设置中心
        </Link>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='text-3xl font-semibold tracking-tight'>
                {module.title}
              </h1>
              <AppSettingsStatusBadge status={module.status} />
            </div>
            <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
              {description}
            </p>
          </div>
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

export function AccessNotice({
  title,
  children,
  tone = 'default',
}: PropsWithChildren<{
  readonly title: string;
  readonly tone?: 'default' | 'danger' | 'success';
}>): ReactElement {
  const toneClass =
    tone === 'danger'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
        : 'border-border bg-muted/20';
  return (
    <div className={`rounded-xl border p-4 text-sm ${toneClass}`}>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 leading-6 opacity-80'>{children}</p>
    </div>
  );
}

export function AccessButton({
  children,
  disabled,
  onClick,
  type = 'button',
  variant = 'default',
}: PropsWithChildren<{
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly type?: 'button' | 'submit';
  readonly variant?: 'default' | 'outline' | 'quiet';
}>): ReactElement {
  const variantClass =
    variant === 'default'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : variant === 'outline'
        ? 'border border-border bg-background hover:bg-muted'
        : 'hover:bg-muted';
  return (
    <button
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClass}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}
