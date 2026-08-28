import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

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
  return (
    <main className='mx-auto w-full max-w-5xl space-y-6 px-6 py-10'>
      <header className='space-y-2'>
        <h1 className='text-2xl font-semibold'>{title}</h1>
        <p className='text-muted-foreground'>{description}</p>
      </header>
      <nav className='flex gap-4 text-sm underline'>
        <Link to='/workflow/workflows'>Workflows</Link>
        <Link to='/workflow/runs'>Execution records</Link>
      </nav>
      {children}
    </main>
  );
}
