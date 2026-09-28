import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link, type To, useLocation } from 'react-router';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BackButtonProps {
  /**
   * Where it leads. Defaults to the parent route with the current query string, as closing a route overlay does, so
   * the list a child page covers keeps its search and filters.
   */
  readonly to?: To;
  /** The label, "Back" by default. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The way back from a page that sits below another one: a covering child page, a record's own page, a form too long
 * for a dialog.
 *
 * It stands on its own, above the page's heading where breadcrumbs would otherwise be, and needs no `PageHeader`.
 * Going back is navigation, so it is a link wearing the ghost button's styles; the negative margin lines its arrow up
 * with the content below, and `flex w-fit` keeps it a block of its own width wherever it is placed. It replaces the
 * history entry, as closing a route overlay does, so the browser's Back does not return to the page just left, such
 * as a form that would reopen empty.
 */
export function BackButton({
  children,
  className,
  to,
}: BackButtonProps = {}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <Link
      replace
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'flex w-fit -ml-1.5 text-muted-foreground',
        className,
      )}
      to={to ?? { pathname: '..', search: location.search }}
    >
      <ArrowLeftIcon data-icon='inline-start' />
      {children ?? t('navigation.back', { defaultValue: 'Back' })}
    </Link>
  );
}
