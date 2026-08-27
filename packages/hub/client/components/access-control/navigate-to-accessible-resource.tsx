import { useMenu } from '@refinedev/core';
import { Navigate } from 'react-router';

import { AccessDenied } from './access-denied';

export function NavigateToAccessibleResource() {
  const { menuItems } = useMenu();
  const route = findFirstRoute(menuItems);

  return route ? <Navigate to={route} replace /> : <AccessDenied />;
}

function findFirstRoute(
  items: ReturnType<typeof useMenu>['menuItems'],
): string | undefined {
  for (const item of items) {
    if (item.route) return item.route;
    const childRoute = findFirstRoute(item.children ?? []);
    if (childRoute) return childRoute;
  }
  return undefined;
}
