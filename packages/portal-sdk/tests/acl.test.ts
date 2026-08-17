import { describe, expect, it } from "vitest";

import {
  clearRecordPermissions,
  evaluateAccess,
  filterMenuItemsByAcl,
  findFirstAccessibleRoute,
  getEffectiveRoles,
  getPermissionsForDataSource,
  getRecordActionPermission,
  resolveAclDataSourceKey,
  resolveActionPermission,
  updateRecordPermissions,
} from "../src/acl/index.ts";
import {
  buildRouteResources,
  defineAppRoutes,
} from "../src/routing/index.ts";

const permissions = {
  currentRole: "editor",
  roles: ["editor", "auditor"],
  roleMode: "allow-use-union",
  resources: ["blog_posts"],
  actionAlias: { list: "view", get: "view" },
  actions: {
    "blog_posts:view": { fields: ["id", "title"] },
    "blog_posts:update": { fields: ["title"] },
  },
  strategy: { actions: ["view:all"] },
  snippets: ["pm.*"],
};

describe("Portal ACL", () => {
  it("combines roles with resource, action, and field permissions", () => {
    expect(getEffectiveRoles(permissions)).toEqual(["editor", "auditor"]);
    expect(
      resolveActionPermission({
        permissions,
        resource: "blog_posts",
        action: "list",
      })
    ).toEqual({ fields: ["id", "title"] });
    expect(
      evaluateAccess(permissions, {
        roles: {
          anyOf: ["editor"],
          allOf: ["editor", "auditor"],
          noneOf: ["anonymous"],
        },
        resource: "blog_posts",
        action: "edit",
        field: "title",
      })
    ).toBe(true);
    expect(
      evaluateAccess(permissions, {
        resource: "blog_posts",
        action: "edit",
        field: "status",
      })
    ).toBe(false);
  });

  it("selects permissions for external data sources", () => {
    const externalPermissions = {
      ...permissions,
      allowAll: true,
      dataSources: {
        analytics: {
          allowAll: false,
          resources: ["orders"],
          actionAlias: { list: "read" },
          actions: { "orders:read": {} },
        },
      },
    };
    expect(
      getPermissionsForDataSource(externalPermissions, "analytics")
    ).toMatchObject({
      allowAll: false,
      resources: ["orders"],
      actionAlias: { list: "read" },
    });
    expect(
      evaluateAccess(externalPermissions, {
        resource: "orders",
        action: "list",
        dataSourceKey: "analytics",
      })
    ).toBe(true);
    expect(
      resolveAclDataSourceKey({
        acl: { type: "collection", dataSourceKey: "analytics" },
      })
    ).toBe("analytics");
  });

  it("applies record permissions to actions", () => {
    clearRecordPermissions();
    updateRecordPermissions({
      resource: "blog_posts",
      recordIds: [1, 2],
      allowedActions: { view: [1, 2], update: [1], destroy: [] },
    });
    expect(
      getRecordActionPermission({
        resource: "blog_posts",
        action: "update",
        id: 2,
      })
    ).toBe(false);
    expect(
      evaluateAccess(permissions, {
        resource: "blog_posts",
        action: "edit",
        id: 1,
      })
    ).toBe(true);
    expect(
      evaluateAccess(permissions, {
        resource: "blog_posts",
        action: "edit",
        id: 2,
      })
    ).toBe(false);
    clearRecordPermissions();
  });

  it("keeps accessible children when a parent menu is denied", () => {
    const filtered = filterMenuItemsByAcl(
      [
        {
          key: "restricted-parent",
          name: "restricted-parent",
          route: "/restricted-parent",
          children: [
            {
              key: "public-child",
              name: "public-child",
              route: "/public-child",
              meta: { acl: { type: "authenticated" as const } },
              children: [],
            },
          ],
        },
      ],
      { ...permissions, strategy: { actions: [] } }
    );
    expect(filtered[0].route).toBeUndefined();
    expect(findFirstAccessibleRoute(filtered)).toBe("/public-child");
  });

  it("inherits route roles and rejects duplicate resource actions", () => {
    const [resource] = buildRouteResources(
      defineAppRoutes([
        {
          name: "administration",
          path: "/administration",
          access: { roles: { anyOf: ["admin"] } },
          children: [
            {
              name: "reports",
              path: "reports",
              resource: { meta: { label: "Reports" } },
              access: { roles: { anyOf: ["auditor"] } },
              children: [
                {
                  name: "reports.create",
                  path: "create",
                  resourceAction: "create",
                },
              ],
            },
          ],
        },
      ])
    );
    expect(resource.list).toBe("/administration/reports");
    expect(resource.create).toBe("/administration/reports/create");
    expect(resource.meta?.routeAccess).toEqual([
      { roles: { anyOf: ["admin"] } },
      { roles: { anyOf: ["auditor"] } },
    ]);
    expect(() =>
      buildRouteResources([
        {
          name: "duplicate-actions",
          path: "/duplicate-actions",
          resource: {},
          children: [
            { name: "first-create", path: "create", resourceAction: "create" },
            { name: "second-create", path: "new", resourceAction: "create" },
          ],
        },
      ])
    ).toThrow(/declares multiple create routes/);
  });
});
