import type { ReactNode } from 'react';

import { Breadcrumbs } from './breadcrumbs.js';

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  /**
   * Whether to show the trail leading to this page. It is on by default and costs nothing on a page that does not
   * warrant one: the breadcrumb decides for itself, and renders nothing until the page sits under a parent.
   *
   * The header owns the trail because the two always appear together, which is what keeps the gap between them the
   * same on every page. The page keeps the decisions that are actually its own — its container and its width — and
   * a page that wants the trail somewhere else passes `false` and places `<Breadcrumbs />` itself.
   */
  readonly breadcrumbs?: boolean;
}

export function PageHeader({
  actions,
  breadcrumbs = true,
  description,
  title,
}: PageHeaderProps) {
  return (
    <header className='space-y-4'>
      {breadcrumbs ? <Breadcrumbs /> : null}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='font-heading text-3xl font-semibold tracking-[-0.035em]'>
            {title}
          </h1>
          {description ? (
            <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className='flex shrink-0 items-center gap-2'>{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

PageHeader.displayName = 'PageHeader';
