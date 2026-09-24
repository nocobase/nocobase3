import { useTranslation } from '@nocobase/i18n/client';
import {
  routeKey,
  type RouteNavigationItem,
} from '../../routing/route-navigation.js';
import { ChevronRight } from 'lucide-react';
import {
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { EMPTY_ARRAY } from '@/lib/constants';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';

// Match the sidebar's md breakpoint; mobile navigation always shows its labels.
function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia('(min-width: 768px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function subscribeNothing() {
  return () => {};
}
function notDesktop() {
  return false;
}
function isDesktop() {
  return window.matchMedia('(min-width: 768px)').matches;
}

interface NavigationTreeProps {
  readonly collapsed: boolean;
  readonly inPopover?: boolean;
  readonly item: RouteNavigationItem;
  readonly onNavigate: () => void;
  readonly selectedKey: string | undefined;
}

export function NavigationTree({
  collapsed,
  inPopover = false,
  item,
  onNavigate,
  selectedKey,
}: NavigationTreeProps): ReactElement | null {
  const desktop = useSyncExternalStore(
    collapsed ? subscribeDesktop : subscribeNothing,
    collapsed ? isDesktop : notDesktop,
    notDesktop,
  );
  const restoringFocusRef = useRef(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
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
  if (popoverOpen && (!collapsed || !desktop)) setPopoverOpen(false);

  // Collapsed groups need an interactive surface, not a tooltip containing links.
  if (collapsed && desktop && children.length > 0) {
    const navigate = () => {
      setPopoverOpen(false);
      onNavigate();
    };
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          onClick={
            item.route.componentLoader
              ? (event) => {
                  event.preventBaseUIHandler();
                  navigate();
                }
              : undefined
          }
          openOnHover
          delay={0}
          closeDelay={0}
          onFocus={(event) => {
            if (restoringFocusRef.current) {
              restoringFocusRef.current = false;
              return;
            }
            if (event.currentTarget.matches(':focus-visible'))
              setPopoverOpen(true);
          }}
          nativeButton={!item.route.componentLoader}
          role={item.route.componentLoader ? 'link' : undefined}
          render={
            item.route.componentLoader ? (
              <Link to={item.route.path} />
            ) : (
              <button type='button' />
            )
          }
          aria-label={label}
          aria-current={isSelected ? 'page' : undefined}
          className={`flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors ${
            selected
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground'
          }`}
        >
          {icon ? (
            <NavigationIcon>{icon}</NavigationIcon>
          ) : (
            <span className='truncate'>{label}</span>
          )}
        </PopoverTrigger>
        <PopoverContent
          side='right'
          align='start'
          sideOffset={8}
          initialFocus={false}
          // Returning focus after Escape must not reopen the popup.
          finalFocus={(interaction) => {
            restoringFocusRef.current = interaction === 'keyboard';
            return interaction === 'keyboard';
          }}
          className='max-h-(--available-height) w-max min-w-40 max-w-sm overflow-y-auto p-1.5 gap-0.5 border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-lg'
        >
          <div className='px-2 pt-1 pb-0.5'>
            <PopoverTitle className='text-xs font-medium text-muted-foreground whitespace-nowrap'>
              {label}
            </PopoverTitle>
          </div>
          <div className='flex flex-col gap-0.5 pl-2'>
            {children.map((child) => (
              <NavigationTree
                key={routeKey(child.route)}
                item={child}
                collapsed={false}
                inPopover
                onNavigate={navigate}
                selectedKey={selectedKey}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (children.length > 0 && item.route.componentLoader) {
    return (
      <div>
        <div className='flex items-center'>
          <div className='min-w-0 flex-1'>
            <NavigationLink
              collapsed={collapsed && desktop}
              icon={icon}
              inPopover={inPopover}
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
            className={`hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors ${collapsed ? 'md:hidden' : ''} ${inPopover ? 'rounded-md p-1.5' : 'rounded-lg p-2'}`}
          >
            <ChevronRight className={`size-4 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
        {expanded ? (
          <div
            className={`space-y-1 ${collapsed ? 'md:hidden' : ''} ${inPopover ? 'pl-2 space-y-0.5' : 'ml-3 pl-2 border-l border-sidebar-border'}`}
          >
            {children.map((child) => (
              <NavigationTree
                key={routeKey(child.route)}
                item={child}
                collapsed={collapsed}
                inPopover={inPopover}
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
          className={`flex cursor-pointer list-none items-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&::-webkit-details-marker]:hidden ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'} ${inPopover ? 'gap-2 rounded-md px-2 py-1.5' : 'gap-3 rounded-lg px-3 py-2'}`}
        >
          <span
            className={`flex min-w-0 items-center ${inPopover ? 'gap-2' : 'gap-3'}`}
          >
            {icon ? <NavigationIcon>{icon}</NavigationIcon> : null}
            <span
              className={`${inPopover ? 'whitespace-nowrap' : 'truncate'} ${collapsed && icon ? 'md:hidden' : ''}`}
            >
              {label}
            </span>
          </span>
          <ChevronRight
            className={`size-4 shrink-0 transition-transform group-open:rotate-90 ${collapsed ? 'md:hidden' : ''}`}
          />
        </summary>
        <div
          className={`space-y-1 ${collapsed ? 'md:hidden' : ''} ${inPopover ? 'mt-0.5 pl-2 space-y-0.5' : 'mt-1 ml-3 pl-2 border-l border-sidebar-border'}`}
        >
          {children.map((child) => (
            <NavigationTree
              collapsed={collapsed}
              inPopover={inPopover}
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
      collapsed={collapsed && desktop}
      icon={icon}
      inPopover={inPopover}
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
  readonly inPopover?: boolean;
  readonly isSelected: boolean;
  readonly label: string;
  readonly onNavigate: () => void;
  readonly route: string;
}

function NavigationLink({
  collapsed,
  icon,
  inPopover,
  isSelected,
  label,
  onNavigate,
  route,
}: NavigationLinkProps): ReactElement {
  const link = (
    <Link
      aria-current={isSelected ? 'page' : undefined}
      className={`flex items-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors ${
        inPopover
          ? 'gap-2 rounded-md px-2 py-1.5'
          : 'gap-3 rounded-lg px-3 py-2'
      } ${collapsed ? 'md:justify-center md:px-2' : ''} ${
        isSelected
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      }`}
      onClick={onNavigate}
      to={route}
    >
      {icon ? <NavigationIcon>{icon}</NavigationIcon> : null}
      <span
        className={`${inPopover ? 'whitespace-nowrap' : 'truncate'} ${collapsed && icon ? 'md:hidden' : ''}`}
      >
        {label}
      </span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} aria-label={label} delay={0} />
      <TooltipContent role='tooltip' side='right' sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
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
