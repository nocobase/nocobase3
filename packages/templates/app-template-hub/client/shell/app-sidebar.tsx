import { useTranslation } from '@nocobase/i18n/client';
import { useCan, useMenu, type TreeMenuItem } from '@refinedev/core';
import { ChevronRight, List, ShieldCheck, X } from 'lucide-react';
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

import { Button } from '@/components/ui/button';

import { AppBrand } from './app-brand.js';

export interface AppSidebarProps {
  readonly desktopCollapsed: boolean;
  readonly mobileOpen: boolean;
  readonly onCloseMobile: () => void;
}

export function AppSidebar({
  desktopCollapsed,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps): ReactElement {
  const { menuItems, selectedKey } = useMenu();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const orderedMenuItems = useMemo(
    () => orderNavigationItems(menuItems),
    [menuItems],
  );

  return (
    <>
      {mobileOpen ? (
        <button
          aria-label={t('navigation.close', {
            defaultValue: 'Close navigation',
          })}
          className='fixed inset-0 z-40 bg-black/30 md:hidden'
          onClick={onCloseMobile}
          type='button'
        />
      ) : null}
      <aside
        aria-label={t('navigation.label', {
          defaultValue: 'Application navigation',
        })}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 md:static md:z-auto md:flex md:translate-x-0 ${desktopCollapsed ? 'md:w-16' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-sidebar-border/70 px-5 ${desktopCollapsed ? 'md:justify-center md:px-0' : ''}`}
        >
          <div className='md:hidden'>
            <AppBrand />
          </div>
          <div className='hidden md:block'>
            <AppBrand compact={desktopCollapsed} />
          </div>
          <Button
            aria-label={t('navigation.close', {
              defaultValue: 'Close navigation',
            })}
            className='md:hidden hover:bg-sidebar-accent dark:hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring'
            onClick={onCloseMobile}
            size='icon'
            variant='ghost'
          >
            <X />
          </Button>
        </div>
        <nav
          aria-label={t('navigation.label', {
            defaultValue: 'Application navigation',
          })}
          className={`flex-1 space-y-1 overflow-x-hidden overflow-y-auto py-3 ${desktopCollapsed ? 'px-3 md:px-2' : 'px-3'}`}
        >
          {orderedMenuItems.map((item) => (
            <NavigationTree
              collapsed={desktopCollapsed}
              item={item}
              key={item.key || item.name}
              onNavigate={onCloseMobile}
              pathname={pathname}
              selectedKey={selectedKey}
            />
          ))}
        </nav>
        <SidebarFooter collapsed={desktopCollapsed} />
      </aside>
    </>
  );
}

interface NavigationTreeProps {
  readonly collapsed: boolean;
  readonly item: TreeMenuItem;
  readonly onNavigate: () => void;
  readonly pathname: string;
  readonly selectedKey: string;
}

interface NavigationAccess {
  readonly resource: string;
  readonly action: string;
}

/**
 * The label a menu entry shows.
 *
 * A resource registers its label at bootstrap, before any language is known, so a plugin passes a translation key and
 * its namespace instead of a finished string. An entry without a namespace is already literal text.
 */
function useMenuLabel(item: TreeMenuItem): string {
  const { t } = useTranslation();
  const meta = item.meta as { label?: string; i18nNs?: string } | undefined;
  const label = item.label ?? meta?.label ?? item.name;

  return meta?.i18nNs ? t(label, { ns: meta.i18nNs }) : label;
}

function NavigationTree({
  item,
  ...props
}: NavigationTreeProps): ReactElement | null {
  const access = navigationAccess(item);
  return access ? (
    <GuardedNavigationTree access={access} item={item} {...props} />
  ) : (
    <NavigationTreeContent item={item} {...props} />
  );
}

function GuardedNavigationTree({
  access,
  ...props
}: NavigationTreeProps & {
  readonly access: NavigationAccess;
}): ReactElement | null {
  const { data, isLoading } = useCan({
    resource: access.resource,
    action: access.action,
    queryOptions: {
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });

  if (isLoading || data?.can !== true) return null;
  return <NavigationTreeContent {...props} />;
}

function NavigationTreeContent({
  collapsed,
  item,
  onNavigate,
  pathname,
  selectedKey,
}: NavigationTreeProps): ReactElement | null {
  const label = useMenuLabel(item);
  const isSelected = isNavigationItemSelected(item, selectedKey, pathname);
  const children = item.children ?? [];
  const icon = item.meta?.icon ?? item.icon ?? <List />;

  if (children.length > 0 && !item.route) {
    return (
      <details
        className='group'
        open={children.some((child) => child.key === selectedKey)}
      >
        <summary
          className={`flex cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&::-webkit-details-marker]:hidden ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'}`}
          title={collapsed ? label : undefined}
        >
          <span className='flex min-w-0 items-center gap-3'>
            <NavigationIcon>{icon}</NavigationIcon>
            <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>
              {label}
            </span>
          </span>
          <ChevronRight
            className={`size-4 shrink-0 transition-transform group-open:rotate-90 ${collapsed ? 'md:hidden' : ''}`}
          />
        </summary>
        <div
          className={`mt-1 ml-3 space-y-1 border-l border-sidebar-border pl-2 ${collapsed ? 'md:hidden' : ''}`}
        >
          {children.map((child) => (
            <NavigationTree
              collapsed={collapsed}
              item={child}
              key={child.key || child.name}
              onNavigate={onNavigate}
              pathname={pathname}
              selectedKey={selectedKey}
            />
          ))}
        </div>
      </details>
    );
  }

  if (!item.route) {
    return null;
  }

  return (
    <NavigationLink
      collapsed={collapsed}
      icon={icon}
      isSelected={isSelected}
      label={label}
      onNavigate={onNavigate}
      route={item.route}
    />
  );
}

function isNavigationItemSelected(
  item: TreeMenuItem,
  selectedKey: string,
  pathname: string,
): boolean {
  if (item.key === selectedKey) return true;
  if (!item.route) return false;
  const route = item.route.replace(/\/$/u, '') || '/';
  const current = pathname.replace(/\/$/u, '') || '/';
  return (
    current === route || (route !== '/' && current.startsWith(`${route}/`))
  );
}

function navigationAccess(item: TreeMenuItem): NavigationAccess | undefined {
  const access = item.meta?.access as Partial<NavigationAccess> | undefined;
  return typeof access?.resource === 'string' &&
    typeof access.action === 'string'
    ? { resource: access.resource, action: access.action }
    : undefined;
}

function orderNavigationItems(items: readonly TreeMenuItem[]): TreeMenuItem[] {
  return [...items]
    .sort((left, right) => navigationOrder(left) - navigationOrder(right))
    .map((item) => ({
      ...item,
      children: orderNavigationItems(item.children ?? []),
    }));
}

function navigationOrder(item: TreeMenuItem): number {
  const meta = item.meta as { order?: unknown } | undefined;
  const order = meta?.order;
  return typeof order === 'number' && Number.isFinite(order)
    ? order
    : Number.MAX_SAFE_INTEGER;
}

interface NavigationLinkProps {
  readonly collapsed: boolean;
  readonly icon: ReactNode;
  readonly isSelected: boolean;
  readonly label: string;
  readonly onNavigate: () => void;
  readonly route: string;
}

function NavigationLink({
  collapsed,
  icon,
  isSelected,
  label,
  onNavigate,
  route,
}: NavigationLinkProps): ReactElement {
  return (
    <Link
      aria-current={isSelected ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors ${collapsed ? 'md:justify-center md:px-2' : ''} ${isSelected ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      to={route}
    >
      <NavigationIcon>{icon}</NavigationIcon>
      <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>
        {label}
      </span>
    </Link>
  );
}

function NavigationIcon({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className='flex size-4 shrink-0 items-center justify-center [&_svg]:size-4'>
      {children}
    </span>
  );
}

function SidebarFooter({
  collapsed,
}: {
  readonly collapsed: boolean;
}): ReactElement {
  const templateName =
    typeof __PORTAL_TEMPLATE_NAME__ === 'string'
      ? __PORTAL_TEMPLATE_NAME__
      : 'NocoBase Hub';
  const templateVersion =
    typeof __PORTAL_TEMPLATE_VERSION__ === 'string'
      ? __PORTAL_TEMPLATE_VERSION__
      : '0.0.0';
  const templateLabel = `${templateName} v${templateVersion}`;

  return (
    <footer className='shrink-0 border-t border-sidebar-border/70'>
      <div
        className={`flex min-h-20 items-center gap-3 px-5 py-3 ${collapsed ? 'md:min-h-16 md:justify-center md:px-2' : ''}`}
        title={templateLabel}
      >
        <ShieldCheck className='size-4 shrink-0 text-sidebar-foreground/80' />
        <div
          className={`min-w-0 text-xs leading-4 ${collapsed ? 'md:hidden' : ''}`}
        >
          <div className='font-semibold text-sidebar-foreground'>
            AI builds freely.
          </div>
          <div className='text-sidebar-foreground/80'>
            <a
              className='rounded-sm font-medium text-sidebar-foreground hover:underline outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
              href='https://www.nocobase.com'
              rel='noopener noreferrer'
              target='_blank'
            >
              NocoBase
            </a>{' '}
            keeps it reliable.
          </div>
          <div className='mt-1 font-mono text-xs text-sidebar-foreground/70'>
            {templateLabel}
          </div>
        </div>
      </div>
    </footer>
  );
}
