import { useGetIdentity, useTranslate } from "@refinedev/core";
import { ShieldX } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useAclState, type AclIdentity } from "@nocobase/portal-sdk/acl";

import {
  getRoleOptions,
  resolveRoleTitle,
  RoleSwitcher,
  UNION_ROLE,
} from "@/extensions/nocobase-acl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasMultipleUserRoles } from "./portal-access-denied-roles";

type PortalAccessDeniedViewProps = {
  title: string;
  description: string;
  currentRoleTitle?: string;
  roleSwitcher?: ReactNode;
};

export function PortalAccessDeniedView({
  title,
  description,
  currentRoleTitle,
  roleSwitcher,
}: PortalAccessDeniedViewProps) {
  const translate = useTranslate();
  const switchRoleTitle = translate(
    "acl.roleSwitcher.switchRole",
    "Switch role"
  );

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
          <ShieldX className="size-8 text-muted-foreground" />
        </div>
        <p className="mt-5 text-4xl font-semibold tracking-tight text-muted-foreground">
          403
        </p>
        <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-muted-foreground">
          {description}
        </p>

        {roleSwitcher && currentRoleTitle ? (
          <Card
            aria-label={switchRoleTitle}
            className="mx-auto mt-8 max-w-xl text-left"
            role="region"
          >
            <CardHeader className="border-b pb-4 max-sm:grid-cols-1">
              <CardTitle className="font-normal">{switchRoleTitle}</CardTitle>
              <CardAction className="flex items-center gap-2 max-sm:col-start-1 max-sm:row-start-2 max-sm:justify-self-start">
                <span className="text-sm text-muted-foreground">
                  {translate(
                    "acl.roleSwitcher.currentRole",
                    "Current role"
                  )}
                </span>
                <Badge className="font-normal" variant="secondary">
                  {currentRoleTitle}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                {translate("acl.roleSwitcher.selectRole", "Select role")}
              </p>
              {roleSwitcher}
              <p className="text-sm leading-6 text-muted-foreground">
                {translate(
                  "acl.roleSwitcher.recheckPortalAccess",
                  "Portal access will be checked again after switching."
                )}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

export function PortalAccessDenied({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { data: identity, isLoading } = useGetIdentity<AclIdentity>();
  const acl = useAclState();
  const denied = acl.status === "error" ? acl.portalAccessDenied : undefined;
  const roles = useMemo(
    () =>
      getRoleOptions({
        roles: identity?.roles ?? [],
        roleMode: denied?.roleMode,
        allowAnonymous: denied?.allowAnonymous,
      }),
    [denied?.allowAnonymous, denied?.roleMode, identity?.roles]
  );
  const currentRole =
    denied?.roleMode === "only-use-union"
      ? UNION_ROLE
      : denied?.role?.trim() || roles[0]?.name;
  const currentRoleTitle = currentRole
    ? resolveRoleTitle(
        roles.find((role) => role.name === currentRole) ?? {
          name: currentRole,
        }
      )
    : undefined;
  const canSwitch =
    !isLoading &&
    hasMultipleUserRoles(identity?.roles ?? []) &&
    roles.length > 1 &&
    denied?.roleMode !== "only-use-union";

  return (
    <PortalAccessDeniedView
      title={title}
      description={description}
      currentRoleTitle={canSwitch ? currentRoleTitle : undefined}
      roleSwitcher={
        canSwitch ? (
          <RoleSwitcher
            className="w-full"
            label={false}
            triggerClassName="h-10! w-full min-w-0"
          />
        ) : undefined
      }
    />
  );
}
