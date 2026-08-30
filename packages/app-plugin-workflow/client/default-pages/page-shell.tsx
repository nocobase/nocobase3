import { useTranslation } from '@nocobase/app-i18n/client';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { WORKFLOW_NS } from '../namespace.js';

export interface WorkflowFallbackPageProps {
  readonly children?: ReactNode;
  readonly description: string;
  readonly title: string;
}

export function WorkflowFallbackPage({
  children,
  description,
  title,
}: WorkflowFallbackPageProps): ReactElement {
  // Named explicitly rather than relying on the surrounding scope: this shell is also rendered by the application
  // around its own pages, where the scope in context is the application's rather than this plugin's.
  const { t } = useTranslation(WORKFLOW_NS);

  return (
    <main className='mx-auto w-full max-w-5xl space-y-6 px-6 py-10'>
      <header className='space-y-2'>
        <h1 className='text-2xl font-semibold'>{title}</h1>
        <p className='text-muted-foreground'>{description}</p>
      </header>
      <nav className='flex gap-4 text-sm underline'>
        <Link to='/workflow/workflows'>{t('nav.workflows')}</Link>
        <Link to='/workflow/runs'>{t('nav.runs')}</Link>
      </nav>
      {children}
    </main>
  );
}
