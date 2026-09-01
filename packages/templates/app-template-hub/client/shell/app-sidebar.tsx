import { useTranslation } from '@nocobase/i18n/client';
import { useCan, useMenu, type TreeMenuItem } from '@refinedev/core';
import { ChevronRight, Home, List, ShieldCheck, X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { AppBrand } from './app-brand.js';
import { HOME_NAVIGATION_ITEM } from './navigation.js';

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
  const { t } = useTranslation();
  const { data: homeAccess } = useCan({ resource: 'home', action: 'access' });

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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card text-card-foreground transition-[width,transform] duration-200 md:static md:z-auto md:flex md:translate-x-0 ${desktopCollapsed ? 'md:w-16' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-border/70 px-5 ${desktopCollapsed ? 'md:justify-center md:px-0' : ''}`}
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
            className='md:hidden'
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
          {homeAccess?.can === true ? (
            <NavigationLink
              collapsed={desktopCollapsed}
              icon={<Home />}
              isSelected={
                selectedKey === HOME_NAVIGATION_ITEM.key || selectedKey === '/'
              }
              label={t('navigation.home', { defaultValue: 'Home' })}
              onNavigate={onCloseMobile}
              route={HOME_NAVIGATION_ITEM.route}
            />
          ) : null}
          {menuItems.map((item) => (
            <NavigationTree
              collapsed={desktopCollapsed}
              item={item}
              key={item.key || item.name}
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
  readonly item: TreeMenuItem;
  readonly onNavigate: () => void;
  readonly selectedKey: string;
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
  collapsed,
  item,
  onNavigate,
  selectedKey,
}: NavigationTreeProps): ReactElement | null {
  const label = useMenuLabel(item);
  const isSelected = item.key === selectedKey;
  const children = item.children ?? [];
  const icon = item.meta?.icon ?? item.icon ?? <List />;

  if (children.length > 0 && !item.route) {
    return (
      <details
        className='group'
        open={children.some((child) => child.key === selectedKey)}
      >
        <summary
          className={`flex cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted [&::-webkit-details-marker]:hidden ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'}`}
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
          className={`mt-1 ml-3 space-y-1 border-l border-border pl-2 ${collapsed ? 'md:hidden' : ''}`}
        >
          {children.map((child) => (
            <NavigationTree
              collapsed={collapsed}
              item={child}
              key={child.key || child.name}
              onNavigate={onNavigate}
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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${collapsed ? 'md:justify-center md:px-2' : ''} ${isSelected ? 'bg-primary/10 font-medium text-primary' : 'text-card-foreground hover:bg-muted'}`}
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
      : 'Default Template';
  const templateVersion =
    typeof __PORTAL_TEMPLATE_VERSION__ === 'string'
      ? __PORTAL_TEMPLATE_VERSION__
      : '0.0.0';
  const templateLabel = `${templateName} v${templateVersion}`;

  return (
    <footer className='shrink-0 border-t border-border/70'>
      <div
        className={`flex min-h-20 items-center gap-3 px-5 py-3 ${collapsed ? 'md:min-h-16 md:justify-center md:px-2' : ''}`}
        title={templateLabel}
      >
        <ShieldCheck className='size-4 shrink-0 text-muted-foreground' />
        <div
          className={`min-w-0 text-xs leading-4 ${collapsed ? 'md:hidden' : ''}`}
        >
          <div className='font-semibold text-card-foreground'>
            AI builds freely.
          </div>
          <div className='text-muted-foreground'>
            <a
              className='font-medium text-card-foreground hover:underline'
              href='https://www.nocobase.com'
              rel='noopener noreferrer'
              target='_blank'
            >
              NocoBase
            </a>{' '}
            keeps it reliable.
          </div>
          <div className='mt-1 font-mono text-[10px] text-muted-foreground/70'>
            {templateLabel}
          </div>
        </div>
      </div>
    </footer>
  );
}
