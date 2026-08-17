import { render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AclStoreProvider,
  type AclState,
  type AclStore,
} from "@nocobase/portal-sdk/acl";

import { AclGate } from "@/components/access-control/acl-gate";
import { PortalAccessDeniedView } from "@/components/access-control/portal-access-denied";
import { hasMultipleUserRoles } from "@/components/access-control/portal-access-denied-roles";
import { resolveRoleSwitcherContext } from "@/extensions/nocobase-acl/components/role-switcher-context";
import { starter as zhCN } from "@/locales/zh-CN";

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({ data: undefined, isLoading: false }),
  useTranslate: () => (_key: string, fallback: string) => fallback,
}));

const deniedData = {
  portalName: "sales",
  role: "admin",
  roles: ["admin"],
  roleMode: "allow-use-union" as const,
  allowAnonymous: true,
};

const renderAclError = (message: string) => {
  const errorState: AclState = {
    status: "error",
    error: new Error(message),
  };
  const store: AclStore = {
    getState: () => errorState,
    subscribe: () => () => undefined,
    load: async () => errorState,
    retry: async () => errorState,
    clear: () => undefined,
    recordPermissions: {
      getState: () => ({}),
      subscribe: () => () => undefined,
      getPermission: () => undefined,
    },
  };

  return render(
    <AclStoreProvider store={store}>
      <AclGate>Allowed</AclGate>
    </AclStoreProvider>
  );
};

describe("AclGate", () => {
  it("shows a translated fallback for a generic permission error", () => {
    renderAclError("Unable to load permissions");

    expect(
      screen.getByRole("heading", { name: "Unable to load permissions" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Permissions for the current role could not be loaded.")
    ).toBeInTheDocument();
  });

  it("shows useful permission error details", () => {
    renderAclError("Gateway timed out");

    expect(screen.getByText("Gateway timed out")).toBeInTheDocument();
  });
});

describe("PortalAccessDeniedView", () => {
  const renderView = (roleSwitcher?: ReactNode) =>
    render(
      <PortalAccessDeniedView
        title="You do not have access to this Portal"
        description="Your current role cannot access this Portal. Select another role to try again."
        currentRoleTitle={roleSwitcher ? "Administrator" : undefined}
        roleSwitcher={roleSwitcher}
      />
    );

  it("presents the current role and role switcher accessibly", () => {
    renderView(createElement("button", { type: "button" }, "Administrator"));

    expect(screen.getByText("403")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Switch role" })
    ).toBeInTheDocument();
    expect(screen.getByText("Current role")).toBeInTheDocument();
    expect(screen.getAllByText("Administrator")).toHaveLength(2);
    expect(screen.getByText("Select role")).toBeInTheDocument();
    expect(
      screen.getByText("Portal access will be checked again after switching.")
    ).toBeInTheDocument();
  });

  it("omits the role region when switching is unavailable", () => {
    renderView();

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("Portal access helpers", () => {
  it("resolves role switcher context from ready and denied ACL states", () => {
    expect(
      resolveRoleSwitcherContext(
        {
          status: "error",
          error: new Error("Denied"),
          portalAccessDenied: deniedData,
        },
        "member"
      )
    ).toEqual({
      currentRole: "admin",
      roleMode: "allow-use-union",
      allowAnonymous: true,
    });
    expect(
      resolveRoleSwitcherContext(
        { status: "error", error: new Error("Network error") },
        "admin"
      )
    ).toEqual({ currentRole: "admin" });
    expect(
      resolveRoleSwitcherContext(
        {
          status: "error",
          error: new Error("Denied"),
          portalAccessDenied: { ...deniedData, role: "" },
        },
        "member"
      )
    ).toEqual({
      currentRole: "member",
      roleMode: "allow-use-union",
      allowAnonymous: true,
    });
    expect(
      resolveRoleSwitcherContext(
        {
          status: "ready",
          permissions: {
            currentRole: "member",
            roles: ["member"],
            roleMode: "default",
            allowAnonymous: false,
          },
        },
        "admin"
      )
    ).toEqual({
      currentRole: "member",
      roleMode: "default",
      allowAnonymous: false,
    });
  });

  it("detects whether a user has multiple switchable roles", () => {
    expect(hasMultipleUserRoles([{ name: "admin" }])).toBe(false);
    expect(
      hasMultipleUserRoles([{ name: "__union__" }, { name: "admin" }])
    ).toBe(false);
    expect(
      hasMultipleUserRoles([{ name: "admin" }, { name: "member" }])
    ).toBe(true);
  });

  it("keeps the Chinese Portal access translations", () => {
    expect(zhCN["acl.portalAccessDenied.title"]).toBe("无权访问此门户");
    expect(zhCN["acl.portalAccessDenied.description"]).toBe(
      "当前角色没有访问权限，请切换角色后重试。"
    );
    expect(zhCN["acl.roleSwitcher.selectRole"]).toBe("选择角色");
    expect(zhCN["acl.roleSwitcher.recheckPortalAccess"]).toBe(
      "切换后将重新检查门户访问权限"
    );
  });
});
