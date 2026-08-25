import { useMenu, type TreeMenuItem } from '@refinedev/core';
import { ChevronRight, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '@nocobase/app-client/ui';

import { HOME_NAVIGATION_ITEM } from './navigation.js';
import { AppBrand } from './app-brand.js';

export interface AppSidebarProps {
  readonly mobileOpen: boolean;
  readonly onCloseMobile: () => void;
}

export function AppSidebar({
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps): ReactElement {
  const { menuItems, selectedKey } = useMenu();

  return (
    <>
      {mobileOpen ? (
        <button
          aria-label='Close navigation'
          className='fixed inset-0 z-40 bg-black/30 md:hidden'
          onClick={onCloseMobile}
          type='button'
        />
      ) : null}
      <aside
        aria-label='Application navigation'
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card text-card-foreground transition-transform md:static md:z-auto md:flex md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className='flex h-16 items-center justify-between border-b border-border/70 px-4'>
          <AppBrand />
          <Button
            aria-label='Close navigation'
            className='md:hidden'
            onClick={onCloseMobile}
            size='icon'
            variant='ghost'
          >
            <X />
          </Button>
        </div>
        <nav
          aria-label='Application navigation'
          className='flex-1 space-y-1 overflow-y-auto p-3'
        >
          <NavigationLink
            isSelected={
              selectedKey === HOME_NAVIGATION_ITEM.key || selectedKey === '/'
            }
            label={HOME_NAVIGATION_ITEM.label}
            onNavigate={onCloseMobile}
            route={HOME_NAVIGATION_ITEM.route}
          />
          {menuItems.map((item) => (
            <NavigationTree
              item={item}
              key={item.key || item.name}
              onNavigate={onCloseMobile}
              selectedKey={selectedKey}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}

interface NavigationTreeProps {
  readonly item: TreeMenuItem;
  readonly onNavigate: () => void;
  readonly selectedKey: string;
}

function NavigationTree({
  item,
  onNavigate,
  selectedKey,
}: NavigationTreeProps): ReactElement | null {
  const label = item.label ?? item.meta?.label ?? item.name;
  const isSelected = item.key === selectedKey;
  const children = item.children ?? [];

  if (children.length > 0 && !item.route) {
    return (
      <details
        className='group'
        open={children.some((child) => child.key === selectedKey)}
      >
        <summary className='flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-muted [&::-webkit-details-marker]:hidden'>
          <span className='truncate'>{label}</span>
          <ChevronRight className='size-4 transition-transform group-open:rotate-90' />
        </summary>
        <div className='mt-1 ml-3 space-y-1 border-l border-border pl-2'>
          {children.map((child) => (
            <NavigationTree
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
      isSelected={isSelected}
      label={label}
      onNavigate={onNavigate}
      route={item.route}
    />
  );
}

interface NavigationLinkProps {
  readonly isSelected: boolean;
  readonly label: string;
  readonly onNavigate: () => void;
  readonly route: string;
}

function NavigationLink({
  isSelected,
  label,
  onNavigate,
  route,
}: NavigationLinkProps): ReactElement {
  return (
    <Link
      aria-current={isSelected ? 'page' : undefined}
      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${isSelected ? 'bg-primary/10 font-medium text-primary' : 'text-card-foreground hover:bg-muted'}`}
      onClick={onNavigate}
      to={route}
    >
      {label}
    </Link>
  );
}
