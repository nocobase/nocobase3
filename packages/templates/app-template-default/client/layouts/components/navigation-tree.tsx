import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import {
  routeKey,
  type RouteNavigationItem,
} from '../../routing/route-navigation.js';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';

interface NavigationTreeProps {
  readonly item: RouteNavigationItem;
  readonly onNavigate: () => void;
  readonly selectedKey: string | undefined;
}

export function NavigationTree(
  props: NavigationTreeProps,
): ReactElement | null {
  return <NavigationNode {...props} inPopover={false} />;
}

// Both surfaces consume only the already-filtered navigation tree. The popup is
// an expanded list, not another sidebar provider with its own state/shortcut.
function NavigationNode({
  item,
  onNavigate,
  selectedKey,
  inPopover,
}: NavigationTreeProps & { readonly inPopover: boolean }): ReactElement | null {
  const { state, isMobile } = useSidebar();
  const collapsed = !inPopover && !isMobile && state === 'collapsed';
  const { t } = useTranslation(item.route.packageName);
  const label = t(item.route.navigation!.title, {
    defaultValue: item.route.navigation!.title,
  });
  const isSelected = routeKey(item.route) === selectedKey;
  const children = item.children;
  const Icon = item.route.navigation?.icon;
  const selected = containsSelection(item, selectedKey);
  const [disclosure, setDisclosure] = useState({
    key: selectedKey,
    expanded: selected,
  });
  if (disclosure.key !== selectedKey) {
    setDisclosure({
      key: selectedKey,
      expanded: selected || disclosure.expanded,
    });
  }
  const [popoverOpen, setPopoverOpen] = useState(false);
  const restoringFocusRef = useRef(false);
  if (popoverOpen && !collapsed) setPopoverOpen(false);
  const navigate = () => {
    setPopoverOpen(false);
    onNavigate();
  };
  const popupButtonClass = inPopover
    ? 'h-auto min-h-8 items-start [&>span:last-child]:whitespace-normal [&>span:last-child]:break-words'
    : undefined;
  const content = (
    <>
      {Icon ? <Icon /> : null}
      <span>{label}</span>
    </>
  );
  const childNodes = children.map((child) => (
    <NavigationNode
      key={routeKey(child.route)}
      item={child}
      selectedKey={selectedKey}
      onNavigate={navigate}
      inPopover={inPopover || collapsed}
    />
  ));

  if (children.length && collapsed) {
    return (
      <SidebarMenuItem>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            openOnHover
            delay={100}
            closeDelay={150}
            nativeButton={!item.route.componentLoader}
            role={item.route.componentLoader ? 'link' : undefined}
            render={
              <SidebarMenuButton
                isActive={isSelected}
                render={
                  item.route.componentLoader ? (
                    <Link to={item.route.path} />
                  ) : (
                    <button type='button' />
                  )
                }
              />
            }
            aria-label={label}
            aria-current={isSelected ? 'page' : undefined}
            onClick={
              item.route.componentLoader
                ? (event) => {
                    event.preventBaseUIHandler();
                    navigate();
                  }
                : undefined
            }
            onFocus={(event) => {
              if (restoringFocusRef.current) {
                restoringFocusRef.current = false;
                return;
              }
              if (event.currentTarget.matches(':focus-visible'))
                setPopoverOpen(true);
            }}
          >
            {content}
          </PopoverTrigger>
          <PopoverContent
            side='right'
            align='start'
            sideOffset={8}
            initialFocus={false}
            finalFocus={(interaction) => {
              restoringFocusRef.current = interaction === 'keyboard';
              return interaction === 'keyboard';
            }}
            className='max-h-(--available-height) overflow-y-auto bg-sidebar text-sidebar-foreground'
          >
            <PopoverTitle className='px-2 py-1 text-sm'>{label}</PopoverTitle>
            <SidebarMenu>{childNodes}</SidebarMenu>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    );
  }
  if (children.length) {
    return (
      <Collapsible
        open={disclosure.expanded}
        onOpenChange={(expanded) =>
          setDisclosure({ key: selectedKey, expanded })
        }
        render={<SidebarMenuItem />}
      >
        {item.route.componentLoader ? (
          <>
            <SidebarMenuButton
              render={<Link to={item.route.path} />}
              isActive={isSelected}
              className={popupButtonClass}
              aria-current={isSelected ? 'page' : undefined}
              onClick={navigate}
            >
              {content}
            </SidebarMenuButton>
            <CollapsibleTrigger
              aria-label={label}
              render={<SidebarMenuAction />}
            >
              <ChevronRight
                className={disclosure.expanded ? 'rotate-90' : ''}
              />
            </CollapsibleTrigger>
          </>
        ) : (
          <CollapsibleTrigger
            render={<SidebarMenuButton className={popupButtonClass} />}
          >
            {content}
            <ChevronRight
              className={`ml-auto transition-transform ${disclosure.expanded ? 'rotate-90' : ''}`}
            />
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <SidebarMenuSub>{childNodes}</SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    );
  }
  if (!item.route.componentLoader) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={item.route.path} />}
        isActive={isSelected}
        className={popupButtonClass}
        aria-current={isSelected ? 'page' : undefined}
        aria-label={label}
        tooltip={inPopover ? undefined : label}
        onClick={navigate}
      >
        {content}
      </SidebarMenuButton>
    </SidebarMenuItem>
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
