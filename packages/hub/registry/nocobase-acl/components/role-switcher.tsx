import {
  useGetIdentity,
  useNotification,
  useTranslate,
} from "@refinedev/core";
import { Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  switchRole,
  useAclState,
  type AclIdentity,
  type Role,
} from "@nocobase/portal-sdk/acl";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { cn } from "@/lib/utils";
import {
  canSwitchRoles,
  getRoleOptions,
  resolveRoleTitle,
  UNION_ROLE,
} from "./role-options";
import { resolveRoleSwitcherContext } from "./role-switcher-context";

export type RoleSwitcherProps = {
  className?: string;
  triggerClassName?: string;
  label?: ReactNode | false;
  showWhenUnavailable?: boolean;
};

function useRoleSwitcherOptions() {
  const { data: identity, isLoading } = useGetIdentity<AclIdentity>();
  const acl = useAclState();
  const context = resolveRoleSwitcherContext(acl, nocobaseClient.getRole());
  const roles = useMemo(
    () =>
      getRoleOptions({
        roles: identity?.roles ?? [],
        roleMode: context.roleMode,
        allowAnonymous: context.allowAnonymous,
      }),
    [context.allowAnonymous, context.roleMode, identity?.roles]
  );
  const currentRole =
    context.roleMode === "only-use-union"
      ? UNION_ROLE
      : context.currentRole ?? roles[0]?.name;

  return {
    roles,
    currentRole,
    canSwitch: canSwitchRoles(roles, context.roleMode),
    isLoading:
      isLoading || acl.status === "idle" || acl.status === "loading",
  };
}

export function RoleSwitcher({
  className,
  triggerClassName,
  label,
  showWhenUnavailable = false,
}: RoleSwitcherProps) {
  const translate = useTranslate();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string>();
  const { roles, currentRole, canSwitch, isLoading } =
    useRoleSwitcherOptions();

  const handleRoleChange = async (value: string | null) => {
    if (!value || value === currentRole) return;
    setSwitching(true);
    setError(undefined);
    try {
      await switchRole(value);
      window.location.reload();
    } catch {
      setError(
        translate(
          "acl.roleSwitcher.switchFailed",
          "Unable to switch role"
        )
      );
      setSwitching(false);
    }
  };

  if (isLoading) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }
  if (!canSwitch && !showWhenUnavailable) return null;

  if (!canSwitch) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <ShieldCheck className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          {translate("acl.roleSwitcher.currentRole", "Current role")}
        </span>
        <Badge variant="secondary">{getRoleTitle(roles, currentRole)}</Badge>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label === false ? null : (
        <p className="text-xs font-medium text-muted-foreground">
          {label ?? translate("acl.roleSwitcher.switchRole", "Switch role")}
        </p>
      )}
      <Select
        value={currentRole}
        disabled={switching}
        onValueChange={handleRoleChange}
      >
        <SelectTrigger
          className={cn("w-full min-w-52", triggerClassName)}
          aria-label={translate(
            "acl.roleSwitcher.switchRole",
            "Switch role"
          )}
        >
          {switching ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          <SelectValue>{getRoleTitle(roles, currentRole)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {roles.map((role, index) => (
            <RoleOption
              key={role.name}
              role={role}
              showSeparator={index === 1 && roles[0]?.name === UNION_ROLE}
            />
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function RoleSwitcherUserMenuItems() {
  const translate = useTranslate();
  const { open } = useNotification();
  const [switching, setSwitching] = useState(false);
  const { roles, currentRole, canSwitch, isLoading } =
    useRoleSwitcherOptions();

  if (isLoading || !canSwitch) return null;

  const handleRoleChange = async (value: string) => {
    if (!value || value === currentRole || switching) return;
    setSwitching(true);
    try {
      await switchRole(value);
      window.location.reload();
    } catch {
      open?.({
        type: "error",
        message: translate(
          "acl.roleSwitcher.switchFailed",
          "Unable to switch role"
        ),
      });
      setSwitching(false);
    }
  };

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="min-h-9 gap-2 px-2 text-muted-foreground focus:text-foreground">
          {switching ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          <span>
            {translate("acl.roleSwitcher.switchRole", "Switch role")}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-44">
          <DropdownMenuRadioGroup
            value={currentRole}
            onValueChange={(value) => void handleRoleChange(value)}
          >
            {roles.map((role, index) => (
              <RoleMenuOption
                key={role.name}
                role={role}
                disabled={switching}
                showSeparator={
                  index === 1 && roles[0]?.name === UNION_ROLE
                }
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

function RoleMenuOption({
  role,
  disabled,
  showSeparator,
}: {
  role: Role;
  disabled: boolean;
  showSeparator: boolean;
}) {
  return (
    <>
      {showSeparator ? <DropdownMenuSeparator /> : null}
      <DropdownMenuRadioItem value={role.name} disabled={disabled}>
        {resolveRoleTitle(role)}
      </DropdownMenuRadioItem>
    </>
  );
}

function RoleOption({
  role,
  showSeparator,
}: {
  role: Role;
  showSeparator: boolean;
}) {
  return (
    <>
      {showSeparator ? <SelectSeparator /> : null}
      <SelectItem value={role.name}>{resolveRoleTitle(role)}</SelectItem>
    </>
  );
}

function getRoleTitle(roles: Role[], roleName?: string) {
  return resolveRoleTitle(
    roles.find((role) => role.name === roleName) ??
      (roleName ? { name: roleName } : undefined)
  );
}
