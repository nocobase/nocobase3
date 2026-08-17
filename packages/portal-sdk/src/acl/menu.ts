import type { TreeMenuItem } from "@refinedev/core";

import { evaluateAccess, matchesRoleConstraint } from "./evaluator.ts";
import type { AclPermissionSet, RouteAccessConstraint } from "./types.ts";

const matchesRouteAccess = (
  item: TreeMenuItem,
  permissions: AclPermissionSet
) => {
  const access = item.meta?.routeAccess as RouteAccessConstraint[] | undefined;
  return (
    !access?.length ||
    access.every((constraint) =>
      matchesRoleConstraint(permissions, constraint.roles)
    )
  );
};

export const filterMenuItemsByAcl = (
  items: TreeMenuItem[],
  permissions: AclPermissionSet
): TreeMenuItem[] =>
  items.flatMap((item) => {
    const children = filterMenuItemsByAcl(item.children ?? [], permissions);
    const isContainer = Boolean(item.meta?.group || item.children?.length);
    const canAccessItem = item.route
      ? matchesRouteAccess(item, permissions) &&
        evaluateAccess(permissions, {
          resource: item.name,
          action: "list",
          resourceItem: item,
        })
      : true;

    if (isContainer && !children.length && !item.route) return [];
    if (!canAccessItem && !children.length) return [];
    return [
      {
        ...item,
        route: canAccessItem ? item.route : undefined,
        children,
      },
    ];
  });

export const findFirstAccessibleRoute = (
  items: TreeMenuItem[]
): string | undefined => {
  for (const item of items) {
    if (item.route) return item.route;
    const childRoute = findFirstAccessibleRoute(item.children ?? []);
    if (childRoute) return childRoute;
  }
  return undefined;
};
