import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight, Home } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useRouteTrail } from '../routing/route-context.js';

export interface BreadcrumbsProps {
  readonly className?: string;
  /**
   * Whether the trail starts at the application root. A surface such as the settings centre is its own navigation
   * space and already offers a way back to the application, so a Home crumb there points out of the trail rather
   * than up it.
   */
  readonly home?: boolean;
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
 * a parent the user can return to. On a top-level page the sidebar already says where the user is, so a `Home /
 * Articles` trail only repeats the sidebar and the heading below it.
 */
export function Breadcrumbs({
  className,
  home = true,
}: BreadcrumbsProps = {}): ReactElement | null {
  const trail = useRouteTrail();
  const { t } = useTranslation();
  const levels = trail.filter(
    (entry) => entry.pathname !== '/' && entry.title !== undefined,
  );

  if (levels.length < 2) return null;

  const items = [
    ...(home
      ? [{ href: '/', label: t('navigation.home', { defaultValue: 'Home' }) }]
      : []),
    ...levels.map((entry) => ({
      href: entry.route.componentLoader ? entry.pathname : undefined,
      label: t(entry.title!, {
        ns: entry.route.packageName,
        defaultValue: entry.title!,
      }),
    })),
  ];

  return (
    <nav
      aria-label={t('navigation.breadcrumb', { defaultValue: 'Breadcrumb' })}
      className={className}
    >
      <ol className='flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground'>
        {items.map((item, index) => (
          <BreadcrumbItem
            current={index === items.length - 1}
            href={item.href}
            isHome={home && index === 0}
            key={`${item.href ?? index}-${item.label}`}
            label={item.label}
          />
        ))}
      </ol>
    </nav>
  );
}

function BreadcrumbItem({
  current,
  href,
  isHome,
  label,
}: {
  readonly current: boolean;
  readonly href: string | undefined;
  readonly isHome: boolean;
  readonly label: string;
}): ReactElement {
  const content = isHome ? (
    <>
      <Home aria-hidden className='size-4' />
      <span className='sr-only'>{label}</span>
    </>
  ) : (
    label
  );

  return (
    <>
      <li className='inline-flex items-center gap-1'>
        {current || !href ? (
          <span
            {...(current ? { 'aria-current': 'page' as const } : {})}
            className={current ? 'font-normal text-foreground' : undefined}
          >
            {content}
          </span>
        ) : (
          <Link className='transition-colors hover:text-foreground' to={href}>
            {content}
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
