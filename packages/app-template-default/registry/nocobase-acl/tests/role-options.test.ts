import { describe, expect, it } from "vitest";

import {
  canSwitchRoles,
  getRoleOptions,
  resolveRoleTitle,
} from "../components/role-options";

describe("ACL role options", () => {
  it("builds selectable role options for union and anonymous modes", () => {
    expect(
      getRoleOptions({
        roles: [
          { name: "admin", title: "Administrator" },
          { name: "member", title: "Member" },
        ],
        roleMode: "allow-use-union",
        allowAnonymous: true,
      })
    ).toEqual([
      { name: "__union__", title: "Full permissions" },
      { name: "admin", title: "Administrator" },
      { name: "member", title: "Member" },
      { name: "anonymous", title: "Anonymous" },
    ]);
    expect(resolveRoleTitle({ name: "admin", title: '{{t("Admin")}}' })).toBe(
      "Admin"
    );
  });

  it("only exposes switching when the role mode and options allow it", () => {
    const roles = [{ name: "admin" }, { name: "member" }];

    expect(canSwitchRoles(roles, "allow-use-union")).toBe(true);
    expect(canSwitchRoles(roles, "only-use-union")).toBe(false);
    expect(canSwitchRoles([{ name: "admin" }])).toBe(false);
  });
});
