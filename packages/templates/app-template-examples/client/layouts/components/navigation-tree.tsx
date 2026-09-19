import { useTranslation } from '@nocobase/i18n/client';
import {
  routeKey,
  type RouteNavigationItem,
} from '../../routing/route-navigation.js';
import { ChevronRight } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EMPTY_ARRAY } from '@/lib/constants';

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
  const children = item.children ?? EMPTY_ARRAY;
  const Icon = item.route.navigation?.icon;
  const icon = Icon ? <Icon /> : null;

  const selected = containsSelection(item, selectedKey);
  const [disclosure, setDisclosure] = useState({
    key: selectedKey,
    expanded: selected,
  });
  // Reveal the selected route without discarding other groups' disclosure state.
  if (disclosure.key !== selectedKey) {
    setDisclosure({
      key: selectedKey,
      expanded: selected || disclosure.expanded,
    });
  }
  const expanded = disclosure.expanded;

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
      <details className='group' open={expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setDisclosure({ key: selectedKey, expanded: !expanded });
          }}
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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors ${collapsed ? 'md:justify-center md:px-2' : ''} ${isSelected ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
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
