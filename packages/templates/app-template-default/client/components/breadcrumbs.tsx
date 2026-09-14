import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight, Home } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useRouteMetadata } from '../routing/route-context.js';

export function Breadcrumbs(): ReactElement {
  const routes = useRouteMetadata();
  const { t } = useTranslation();
  const breadcrumbRoutes = routes.filter(
    (route) =>
      route.path !== '/' && (route.navigation || route.componentLoader),
  );
  const hasCurrentRoute = breadcrumbRoutes.length > 0;
  const items = [
    { href: '/', label: t('navigation.home', { defaultValue: 'Home' }) },
    ...breadcrumbRoutes.map((route) => ({
      href: route.path,
      label: route.navigation
        ? t(route.navigation.title, {
            ns: route.packageName,
            defaultValue: route.navigation.title,
          })
        : formatRouteLabel(route.path),
    })),
  ];

  return (
    <nav
      aria-label={t('navigation.breadcrumb', { defaultValue: 'Breadcrumb' })}
    >
      <ol className='flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground'>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          const isHome = index === 0;
          const showHomeAsCurrent = isHome && !hasCurrentRoute;
          return (
            <BreadcrumbItem
              current={current || showHomeAsCurrent}
              href={item.href}
              isHome={isHome}
              key={`${item.href}-${item.label}`}
              label={item.label}
            />
          );
        })}
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
  readonly href: string;
  readonly isHome: boolean;
  readonly label: string;
}): ReactElement {
  return (
    <>
      <li className='inline-flex items-center gap-1'>
        {current ? (
          <span
            aria-current='page'
            className='font-normal text-foreground'
            role='link'
          >
            {isHome ? <Home aria-hidden className='size-4' /> : label}
            {isHome ? <span className='sr-only'>{label}</span> : null}
          </span>
        ) : (
          <Link className='transition-colors hover:text-foreground' to={href}>
            {isHome ? <Home aria-hidden className='size-4' /> : label}
            {isHome ? <span className='sr-only'>{label}</span> : null}
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

function formatRouteLabel(path: string): string {
  const segment =
    path
      .split('/')
      .filter(Boolean)
      .filter((value) => !value.startsWith(':'))
      .at(-1) ?? 'Page';
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (value) => value.toUpperCase());
}
