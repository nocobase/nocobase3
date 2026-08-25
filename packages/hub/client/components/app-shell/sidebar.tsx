'use client';

import React from 'react';
import { useLocation } from 'react-router';
import {
  useMenu,
  useLink,
  useTranslate,
  useUserFriendlyName,
  type TreeMenuItem,
} from '@refinedev/core';
import {
  SidebarRail as ShadcnSidebarRail,
  Sidebar as ShadcnSidebar,
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader as ShadcnSidebarHeader,
  useSidebar as useShadcnSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ChevronRight,
  Gauge,
  ListIcon,
  Rocket,
  ServerCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Brand } from '@/components/app-shell/brand';
import { getResourceLabel } from '@/components/resources/resource-label';
import { displayAppName } from '@/features/apps/presentation';

export function Sidebar() {
  const { menuItems, selectedKey } = useMenu();
  const location = useLocation();
  const appId = getAppIdFromPath(location.pathname);

  return (
    <SidebarNavigation
      menuItems={menuItems}
      selectedKey={selectedKey}
      appScope={appId ? { appId, pathname: location.pathname } : undefined}
    />
  );
}

export function SidebarNavigation({
  menuItems,
  selectedKey,
  appScope,
}: {
  menuItems: TreeMenuItem[];
  selectedKey?: string;
  appScope?: { appId: string; pathname: string };
}) {
  const { open } = useShadcnSidebar();

  return (
    <ShadcnSidebar
      collapsible='icon'
      className={cn('border-r border-sidebar-border/70')}
    >
      <ShadcnSidebarRail />
      <SidebarHeader />
      <ShadcnSidebarContent
        className={cn(
          'transition-discrete',
          'duration-200',
          'flex',
          'flex-col',
          'gap-1.5',
          'py-3',
          {
            'px-3': open,
            'px-1': !open,
          },
        )}
      >
        {appScope ? (
          <AppScopeMenu {...appScope} />
        ) : (
          menuItems.map((item: TreeMenuItem) => (
            <SidebarItem
              key={item.key || item.name}
              item={item}
              selectedKey={selectedKey}
            />
          ))
        )}
      </ShadcnSidebarContent>
    </ShadcnSidebar>
  );
}

function AppScopeMenu({
  appId,
  pathname,
}: {
  appId: string;
  pathname: string;
}) {
  const Link = useLink();
  const { open } = useShadcnSidebar();
  const encodedAppId = encodeURIComponent(appId);
  const root = `/apps/${encodedAppId}`;
  const items = [
    { label: '概览', to: root, icon: Gauge, exact: true },
    { label: '版本与发布', to: `${root}/deployments`, icon: Rocket },
    { label: '运行资源', to: `${root}/resources`, icon: ServerCog },
  ];

  return (
    <div className='flex flex-col gap-2'>
      <Button
        render={<Link to='/apps' />}
        nativeButton={false}
        variant='ghost'
        className='h-9 justify-start gap-2 px-3 text-muted-foreground'
      >
        <ArrowLeft />
        {open ? <span>返回应用</span> : null}
      </Button>
      {open ? (
        <div className='mx-1 mb-2 rounded-xl border bg-sidebar-accent/45 p-3'>
          <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
            应用
          </div>
          <div className='mt-1 truncate text-sm font-semibold'>
            {displayAppName(appId)}
          </div>
          <div className='mt-0.5 truncate font-mono text-[10px] text-muted-foreground'>
            {appId}
          </div>
        </div>
      ) : null}
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.to
          : pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Button
            key={item.to}
            render={<Link to={item.to} />}
            nativeButton={false}
            variant='ghost'
            className={cn(
              'h-10 justify-start gap-3 rounded-lg px-3',
              active
                ? 'bg-primary/10 text-primary hover:!bg-primary/15'
                : 'hover:bg-sidebar-accent/80',
            )}
          >
            <Icon className='size-4 shrink-0' />
            {open ? <span>{item.label}</span> : null}
          </Button>
        );
      })}
    </div>
  );
}

function getAppIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/apps\/([^/]+)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

type MenuItemProps = {
  item: TreeMenuItem;
  selectedKey?: string;
};

function SidebarItem({ item, selectedKey }: MenuItemProps) {
  const { open } = useShadcnSidebar();

  if (item.meta?.group) {
    return <SidebarItemGroup item={item} selectedKey={selectedKey} />;
  }

  if (item.children && item.children.length > 0) {
    if (open) {
      return <SidebarItemCollapsible item={item} selectedKey={selectedKey} />;
    }
    return <SidebarItemDropdown item={item} selectedKey={selectedKey} />;
  }

  return <SidebarItemLink item={item} selectedKey={selectedKey} />;
}

function SidebarItemGroup({ item, selectedKey }: MenuItemProps) {
  const { children } = item;
  const { open } = useShadcnSidebar();
  const displayName = useMenuItemLabel(item);

  return (
    <div className={cn('mt-2 border-t', 'border-sidebar-border/70', 'pt-4')}>
      <span
        className={cn(
          'ml-3',
          'block',
          'text-xs',
          'font-semibold',
          'uppercase',
          'text-muted-foreground',
          'transition-all',
          'duration-200',
          {
            'h-8': open,
            'h-0': !open,
            'opacity-0': !open,
            'opacity-100': open,
            'pointer-events-none': !open,
            'pointer-events-auto': open,
          },
        )}
      >
        {displayName}
      </span>
      {children && children.length > 0 && (
        <div className={cn('flex', 'flex-col')}>
          {children.map((child: TreeMenuItem) => (
            <SidebarItem
              key={child.key || child.name}
              item={child}
              selectedKey={selectedKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarItemCollapsible({ item, selectedKey }: MenuItemProps) {
  const { name, children } = item;
  const isSelected = isTreeItemSelected(item, selectedKey);

  const chevronIcon = (
    <ChevronRight
      className={cn(
        'h-4',
        'w-4',
        'shrink-0',
        'text-muted-foreground',
        'transition-transform',
        'duration-200',
        'group-data-[state=open]:rotate-90',
      )}
    />
  );

  return (
    <Collapsible
      key={`collapsible-${name}`}
      defaultOpen={isSelected}
      className={cn('w-full', 'group')}
    >
      <CollapsibleTrigger
        render={
          <SidebarButton
            item={item}
            rightIcon={chevronIcon}
            isSelected={isSelected}
          />
        }
      />
      <CollapsibleContent className={cn('ml-6', 'flex', 'flex-col', 'gap-2')}>
        {children?.map((child: TreeMenuItem) => (
          <SidebarItem
            key={child.key || child.name}
            item={child}
            selectedKey={selectedKey}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SidebarItemDropdown({ item, selectedKey }: MenuItemProps) {
  const { children } = item;
  const Link = useLink();
  const isSelected = isTreeItemSelected(item, selectedKey);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarButton item={item} isSelected={isSelected} />}
      />
      <DropdownMenuContent side='right' align='start'>
        {children?.map((child: TreeMenuItem) => (
          <SidebarDropdownItem
            key={child.key || child.name}
            item={child}
            selectedKey={selectedKey}
            Link={Link}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarDropdownItem({
  item,
  selectedKey,
  Link,
}: MenuItemProps & { Link: ReturnType<typeof useLink> }) {
  const isSelected = isTreeItemSelected(item, selectedKey);
  const displayName = useMenuItemLabel(item);

  return (
    <DropdownMenuItem
      render={
        <Link
          to={item.route || ''}
          className={cn('flex w-full items-center gap-2', {
            'bg-accent text-accent-foreground': isSelected,
          })}
        />
      }
    >
      <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
      <span>{displayName}</span>
    </DropdownMenuItem>
  );
}

function SidebarItemLink({ item, selectedKey }: MenuItemProps) {
  const isSelected = isTreeItemSelected(item, selectedKey);

  return <SidebarButton item={item} isSelected={isSelected} asLink={true} />;
}

function SidebarHeader() {
  const { open } = useShadcnSidebar();

  return (
    <ShadcnSidebarHeader
      className={cn(
        'h-16',
        'p-0',
        'border-b',
        'border-sidebar-border/70',
        'flex-row',
        'items-center',
        'overflow-hidden',
        open ? 'px-5' : 'justify-center px-0',
      )}
    >
      <Brand
        showText={open}
        logoClassName={cn(
          'transition-transform duration-200',
          !open && 'size-9',
        )}
      />
    </ShadcnSidebarHeader>
  );
}

function useMenuItemLabel(item: TreeMenuItem) {
  const translate = useTranslate();
  const getUserFriendlyName = useUserFriendlyName();

  return getResourceLabel(
    item,
    'plural',
    translate,
    getUserFriendlyName,
    item.name,
  );
}

function isTreeItemSelected(item: TreeMenuItem, selectedKey?: string) {
  return (
    item.key === selectedKey || Boolean(selectedKey?.startsWith(`${item.key}/`))
  );
}

type IconProps = {
  icon: React.ReactNode;
  isSelected?: boolean;
};

function ItemIcon({ icon, isSelected }: IconProps) {
  return (
    <div
      className={cn('w-4', {
        'text-muted-foreground': !isSelected,
        'text-primary': isSelected,
      })}
    >
      {icon ?? <ListIcon />}
    </div>
  );
}

type SidebarButtonProps = React.ComponentProps<typeof Button> & {
  item: TreeMenuItem;
  isSelected?: boolean;
  rightIcon?: React.ReactNode;
  asLink?: boolean;
  onClick?: () => void;
};

function SidebarButton({
  item,
  isSelected = false,
  rightIcon,
  asLink = false,
  className,
  onClick,
  ...props
}: SidebarButtonProps) {
  const Link = useLink();
  const displayName = useMenuItemLabel(item);

  const buttonContent = (
    <>
      <ItemIcon icon={item.meta?.icon ?? item.icon} isSelected={isSelected} />
      <span
        className={cn('tracking-[-0.00875rem] text-foreground', {
          'flex-1': rightIcon,
          'text-left': rightIcon,
          'line-clamp-1': !rightIcon,
          truncate: !rightIcon,
          'font-normal': !isSelected,
          'font-medium': isSelected,
        })}
      >
        {displayName}
      </span>
      {rightIcon}
    </>
  );

  return (
    <Button
      render={
        asLink && item.route ? (
          <Link
            to={item.route}
            className={cn('flex w-full items-center gap-2')}
          />
        ) : undefined
      }
      nativeButton={!asLink || !item.route}
      variant='ghost'
      size='default'
      className={cn(
        'flex h-10 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm transition-colors',
        {
          'bg-primary/10 text-primary hover:!bg-primary/15': isSelected,
          'hover:bg-sidebar-accent/80': !isSelected,
        },
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {buttonContent}
    </Button>
  );
}

Sidebar.displayName = 'Sidebar';
