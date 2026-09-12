import { useTranslation } from '@nocobase/i18n/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import {
  routeKey,
  useRouteNavigation,
  selectedNavigationId,
  type RouteNavigationItem,
} from '../routing/route-navigation.js';
import { ChevronRight, ShieldCheck, X } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

import { Button } from '@/components/ui/button';

import { AppBrand } from './app-brand.js';

export interface AppSidebarProps {
  readonly routes: readonly AppClientRegisteredRoute[];
  readonly desktopCollapsed: boolean;
  readonly mobileOpen: boolean;
  readonly onCloseMobile: () => void;
}

export function AppSidebar({
  routes,
  desktopCollapsed,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps): ReactElement {
  const { items: menuItems, denied } = useRouteNavigation(routes);
  const selectedKey = selectedNavigationId(
    routes,
    useLocation().pathname,
    denied,
  );
  const { t } = useTranslation();

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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 md:sticky md:top-0 md:bottom-auto md:h-svh md:z-auto md:flex md:translate-x-0 ${desktopCollapsed ? 'md:w-16' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
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
          className={`flex-1 min-h-0 space-y-1 overflow-x-hidden overflow-y-auto py-3 ${desktopCollapsed ? 'px-3 md:px-2' : 'px-3'}`}
        >
          {menuItems.map((item) => (
            <NavigationTree
              collapsed={desktopCollapsed}
              item={item}
              key={routeKey(item.route)}
              onNavigate={onCloseMobile}
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
  readonly item: RouteNavigationItem;
  readonly onNavigate: () => void;
  readonly selectedKey: string | undefined;
}

export function NavigationTree({
  collapsed,
  item,
  onNavigate,
  selectedKey,
}: NavigationTreeProps): ReactElement | null {
  const { t } = useTranslation(item.route.packageName);
  const label = t(item.route.navigation!.title, {
    defaultValue: item.route.navigation!.title,
  });
  const isSelected = routeKey(item.route) === selectedKey;
  const children = item.children ?? [];
  const Icon = item.route.navigation?.icon;
  const icon = Icon ? <Icon /> : null;

  const selected = containsSelection(item, selectedKey);
  const [disclosure, setDisclosure] = useState({
    key: selectedKey,
    expanded: selected,
  });
  const expanded =
    disclosure.key === selectedKey ? disclosure.expanded : selected;

  if (children.length > 0 && item.route.componentLoader) {
    return (
      <div>
        <div className='flex items-center'>
          <div className='min-w-0 flex-1'>
            <NavigationLink
              collapsed={collapsed}
              icon={icon}
              isSelected={isSelected}
              label={label}
              onNavigate={onNavigate}
              route={item.route.path}
            />
          </div>
          <button
            type='button'
            aria-label={label}
            aria-expanded={expanded}
            onClick={() =>
              setDisclosure({ key: selectedKey, expanded: !expanded })
            }
            className={`rounded-lg p-2 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring ${collapsed ? 'md:hidden' : ''}`}
          >
            <ChevronRight className={`size-4 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
        {expanded ? (
          <div
            className={`ml-3 space-y-1 border-l border-sidebar-border pl-2 ${collapsed ? 'md:hidden' : ''}`}
          >
            {children.map((child) => (
              <NavigationTree
                key={routeKey(child.route)}
                item={child}
                collapsed={collapsed}
                onNavigate={onNavigate}
                selectedKey={selectedKey}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (children.length > 0) {
    return (
      <details className='group' open={containsSelection(item, selectedKey)}>
        <summary
          className={`flex cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&::-webkit-details-marker]:hidden ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'}`}
          title={collapsed ? label : undefined}
        >
          <span className='flex min-w-0 items-center gap-3'>
            {icon ? <NavigationIcon>{icon}</NavigationIcon> : null}
            <span
              className={`truncate ${collapsed && icon ? 'md:hidden' : ''}`}
            >
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
              key={routeKey(child.route)}
              onNavigate={onNavigate}
              selectedKey={selectedKey}
            />
          ))}
        </div>
      </details>
    );
  }

  if (!item.route.componentLoader) {
    return null;
  }

  return (
    <NavigationLink
      collapsed={collapsed}
      icon={icon}
      isSelected={isSelected}
      label={label}
      onNavigate={onNavigate}
      route={item.route.path}
    />
  );
}

function containsSelection(
  item: RouteNavigationItem,
  id: string | undefined,
): boolean {
  return (
    routeKey(item.route) === id ||
    item.children.some((child) => containsSelection(child, id))
  );
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
      {icon ? <NavigationIcon>{icon}</NavigationIcon> : null}
      <span className={`truncate ${collapsed && icon ? 'md:hidden' : ''}`}>
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
      : 'Default Template';
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
