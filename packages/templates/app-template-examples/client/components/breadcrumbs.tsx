import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useRouteTrail } from '../routing/route-context.js';

export interface BreadcrumbsProps {
  readonly className?: string;
}

/**
 * The trail of destinations leading to the current page.
 *
 * What it shows is the sequence of places the user can return to, which is not the same as the sequence of URL
 * segments. A route earns a level by having a title: a page states one, while structure that happens to own a path
 * segment — a tab, an overlay, a layer that exists only to share a layout — states none and is skipped. A level
 * links somewhere only when a page sits behind it, so a menu group reads as plain text rather than a dead link.
 *
 * Nothing renders until there are at least two levels to show — that is, until the current page actually sits under
 * a parent the user can return to. A single level would only repeat the heading below it.
 */
export function Breadcrumbs({
  className,
}: BreadcrumbsProps = {}): ReactElement | null {
  const trail = useRouteTrail();
  const { t } = useTranslation();
  // Projecting here rather than filtering keeps the title's narrowing, so nothing below asserts it is present.
  const levels = trail.flatMap((entry) =>
    entry.route.title === undefined
      ? []
      : [
          {
            href: entry.route.componentLoader ? entry.pathname : undefined,
            key: entry.pathname,
            label: t(entry.route.title, {
              ns: entry.route.packageName,
              defaultValue: entry.route.title,
            }),
          },
        ],
  );

  if (levels.length < 2) return null;

  return (
    <nav
      aria-label={t('navigation.breadcrumb', { defaultValue: 'Breadcrumb' })}
      className={className}
    >
      <ol className='flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground'>
        {levels.map((level, index) => (
          <BreadcrumbItem
            current={index === levels.length - 1}
            href={level.href}
            key={level.key}
            label={level.label}
          />
        ))}
      </ol>
    </nav>
  );
}

function BreadcrumbItem({
  current,
  href,
  label,
}: {
  readonly current: boolean;
  readonly href: string | undefined;
  readonly label: string;
}): ReactElement {
  return (
    <>
      <li className='inline-flex items-center gap-1'>
        {current || !href ? (
          <span
            {...(current ? { 'aria-current': 'page' as const } : {})}
            className={current ? 'font-normal text-foreground' : undefined}
          >
            {label}
          </span>
        ) : (
          <Link className='transition-colors hover:text-foreground' to={href}>
            {label}
          </Link>
        )}
      </li>
      {!current ? (
        <li aria-hidden className='[&>svg]:size-3.5' role='presentation'>
          <ChevronRight />
        </li>
      ) : null}
    </>
  );
}

Breadcrumbs.displayName = 'Breadcrumbs';
