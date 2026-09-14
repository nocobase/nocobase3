import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight, Home } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { useRouteMetadata } from '../routing/route-context.js';

export function Breadcrumbs(): ReactElement {
  const routes = useRouteMetadata();
  const { t } = useTranslation();
  const navigableRoutes = routes.filter(
    (route) => route.navigation && route.path !== '/',
  );
  const hasCurrentRoute = navigableRoutes.length > 0;
  const items = [
    { href: '/', label: t('navigation.home', { defaultValue: 'Home' }) },
    ...navigableRoutes.map((route) => ({
      href: route.path,
      label: t(route.navigation!.title, {
        ns: route.packageName,
        defaultValue: route.navigation!.title,
      }),
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
