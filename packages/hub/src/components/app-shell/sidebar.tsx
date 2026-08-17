"use client";

import React from "react";
import { filterMenuItemsByAcl, useAclState } from "@nocobase/portal-sdk/acl";
import {
  useMenu,
  useLink,
  useTranslate,
  useUserFriendlyName,
  type TreeMenuItem,
} from "@refinedev/core";
import {
  SidebarRail as ShadcnSidebarRail,
  Sidebar as ShadcnSidebar,
  SidebarContent as ShadcnSidebarContent,
  SidebarFooter as ShadcnSidebarFooter,
  SidebarHeader as ShadcnSidebarHeader,
  useSidebar as useShadcnSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronRight, ListIcon, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/app-shell/brand";
import { getResourceLabel } from "@/components/resources/resource-label";

export function Sidebar() {
  const { menuItems, selectedKey } = useMenu();
  const acl = useAclState();
  const allowedMenuItems = React.useMemo(
    () =>
      acl.status === "ready"
        ? filterMenuItemsByAcl(menuItems, acl.permissions)
        : [],
    [acl, menuItems]
  );

  return (
    <SidebarNavigation menuItems={allowedMenuItems} selectedKey={selectedKey} />
  );
}

export function SidebarNavigation({
  menuItems,
  selectedKey,
}: {
  menuItems: TreeMenuItem[];
  selectedKey?: string;
}) {
  const { open } = useShadcnSidebar();

  return (
    <ShadcnSidebar
      collapsible="icon"
      className={cn("border-r border-sidebar-border/70")}
    >
      <ShadcnSidebarRail />
      <SidebarHeader />
      <ShadcnSidebarContent
        className={cn(
          "transition-discrete",
          "duration-200",
          "flex",
          "flex-col",
          "gap-1.5",
          "py-3",
          {
            "px-3": open,
            "px-1": !open,
          }
        )}
      >
        {menuItems.map((item: TreeMenuItem) => (
          <SidebarItem
            key={item.key || item.name}
            item={item}
            selectedKey={selectedKey}
          />
        ))}
      </ShadcnSidebarContent>
      <SidebarFooter />
    </ShadcnSidebar>
  );
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
    <div className={cn("mt-2 border-t", "border-sidebar-border/70", "pt-4")}>
      <span
        className={cn(
          "ml-3",
          "block",
          "text-xs",
          "font-semibold",
          "uppercase",
          "text-muted-foreground",
          "transition-all",
          "duration-200",
          {
            "h-8": open,
            "h-0": !open,
            "opacity-0": !open,
            "opacity-100": open,
            "pointer-events-none": !open,
            "pointer-events-auto": open,
          }
        )}
      >
        {displayName}
      </span>
      {children && children.length > 0 && (
        <div className={cn("flex", "flex-col")}>
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
        "h-4",
        "w-4",
        "shrink-0",
        "text-muted-foreground",
        "transition-transform",
        "duration-200",
        "group-data-[state=open]:rotate-90"
      )}
    />
  );

  return (
    <Collapsible
      key={`collapsible-${name}`}
      defaultOpen={isSelected}
      className={cn("w-full", "group")}
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
      <CollapsibleContent className={cn("ml-6", "flex", "flex-col", "gap-2")}>
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
      <DropdownMenuContent side="right" align="start">
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
          to={item.route || ""}
          className={cn("flex w-full items-center gap-2", {
            "bg-accent text-accent-foreground": isSelected,
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
        "h-16",
        "p-0",
        "border-b",
        "border-sidebar-border/70",
        "flex-row",
        "items-center",
        "overflow-hidden",
        open ? "px-5" : "justify-center px-0"
      )}
    >
      <Brand
        showText={open}
        logoClassName={cn(
          "transition-transform duration-200",
          !open && "size-9"
        )}
      />
    </ShadcnSidebarHeader>
  );
}

function SidebarFooter() {
  const { open } = useShadcnSidebar();
  const translate = useTranslate();

  return (
    <ShadcnSidebarFooter className="border-t border-sidebar-border/70 p-0">
      <div
        title={`${__PORTAL_TEMPLATE_NAME__} v${__PORTAL_TEMPLATE_VERSION__}`}
        className={cn(
          "flex min-h-16 items-center",
          open ? "gap-3 px-5 py-3" : "justify-center px-2"
        )}
      >
        <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
        {open && (
          <div className="min-w-0 text-xs leading-4">
            <div className="font-semibold text-sidebar-foreground">
              {translate("shell.footer.freedom", "AI builds freely.")}
            </div>
            <div className="text-muted-foreground">
              <a
                href="https://nocobase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sidebar-foreground hover:underline"
              >
                NocoBase
              </a>{" "}
              {translate(
                "shell.footer.reliabilitySuffix",
                "keeps it reliable."
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
              {__PORTAL_TEMPLATE_NAME__} v{__PORTAL_TEMPLATE_VERSION__}
            </div>
          </div>
        )}
      </div>
    </ShadcnSidebarFooter>
  );
}

function useMenuItemLabel(item: TreeMenuItem) {
  const translate = useTranslate();
  const getUserFriendlyName = useUserFriendlyName();

  return getResourceLabel(
    item,
    "plural",
    translate,
    getUserFriendlyName,
    item.name
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
      className={cn("w-4", {
        "text-muted-foreground": !isSelected,
        "text-primary": isSelected,
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
        className={cn("tracking-[-0.00875rem] text-foreground", {
          "flex-1": rightIcon,
          "text-left": rightIcon,
          "line-clamp-1": !rightIcon,
          truncate: !rightIcon,
          "font-normal": !isSelected,
          "font-medium": isSelected,
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
            className={cn("flex w-full items-center gap-2")}
          />
        ) : undefined
      }
      variant="ghost"
      size="default"
      className={cn(
        "flex h-10 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm transition-colors",
        {
          "bg-primary/10 text-primary hover:!bg-primary/15": isSelected,
          "hover:bg-sidebar-accent/80": !isSelected,
        },
        className
      )}
      onClick={onClick}
      {...props}
    >
      {buttonContent}
    </Button>
  );
}

Sidebar.displayName = "Sidebar";
