import type { ResourceProps, TreeMenuItem } from "@refinedev/core";
import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import {
  defineAppRoutes,
  renderAppRoutes,
} from "@nocobase/portal-sdk/routing";
import { KeyRound, PanelsTopLeft } from "lucide-react";
import type { ReactElement } from "react";
import { Navigate, Outlet, Route, useLocation } from "react-router";

import { Header } from "@/components/app-shell/header";
import { PageErrorBoundary } from "@/components/app-shell/page-error-boundary";
import { SidebarNavigation } from "@/components/app-shell/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { RouteAccessGuard } from "./route-access-guard";

const coreDevelopmentResources: ResourceProps[] = [
  {
    name: "auth-components",
    meta: {
      label: "Authentication",
      icon: <KeyRound />,
      description: "NocoBase authentication UI and integration patterns.",
    },
  },
  {
    name: "auth-patterns",
    list: "auth",
    meta: {
      parent: "auth-components",
      label: "Login composition",
      icon: <PanelsTopLeft />,
      description:
        "Dynamic login and application-owned customization patterns.",
    },
  },
];

const coreDevelopmentRoutes = defineAppRoutes([
  {
    name: "development.auth",
    path: "auth",
    lazy: () =>
      import("@/components/auth/demo").then((module) => ({
        default: module.AuthDemoPage,
      })),
  },
]);

const toDevelopmentPath = (path: string) =>
  `/dev/${path.replace(/^\/+/, "")}`.replace(/\/+$/, "");

function collectDevelopmentMenu(extensions: AppExtension[]) {
  const resources = [
    ...coreDevelopmentResources,
    ...extensions.flatMap((extension) => extension.dev?.resources ?? []),
  ];
  const childrenByParent = new Map<string, ResourceProps[]>();
  const roots: ResourceProps[] = [];

  for (const resource of resources) {
    const parent = resource.meta?.parent;
    if (typeof parent === "string") {
      const children = childrenByParent.get(parent) ?? [];
      children.push(resource);
      childrenByParent.set(parent, children);
    } else {
      roots.push(resource);
    }
  }

  const toMenuItem = (
    resource: ResourceProps,
    parentKey?: string
  ): TreeMenuItem => {
    const key = parentKey ? `${parentKey}/${resource.name}` : resource.name;
    const children = childrenByParent
      .get(resource.name)
      ?.map((child) => toMenuItem(child, key));

    return {
      name: resource.name,
      key,
      route:
        typeof resource.list === "string"
          ? toDevelopmentPath(resource.list)
          : undefined,
      meta: resource.meta,
      children: children ?? [],
    };
  };

  return roots.map((resource) => toMenuItem(resource));
}

function findFirstRoute(items: TreeMenuItem[]): string | undefined {
  for (const item of items) {
    if (item.route) return item.route;
    const childRoute = item.children && findFirstRoute(item.children);
    if (childRoute) return childRoute;
  }
}

function findSelectedKey(items: TreeMenuItem[], pathname: string) {
  const matches: TreeMenuItem[] = [];

  const visit = (menuItems: TreeMenuItem[]) => {
    for (const item of menuItems) {
      if (
        item.route &&
        (pathname === item.route || pathname.startsWith(`${item.route}/`))
      ) {
        matches.push(item);
      }
      if (item.children) visit(item.children);
    }
  };

  visit(items);
  return matches.sort(
    (left, right) => (right.route?.length ?? 0) - (left.route?.length ?? 0)
  )[0]?.key;
}

export function createDevelopmentRoute(
  extensions: AppExtension[]
): ReactElement {
  const menuItems = collectDevelopmentMenu(extensions);
  const firstRoute = findFirstRoute(menuItems) ?? "/";
  const routes = renderAppRoutes(
    [
      ...coreDevelopmentRoutes,
      ...extensions.flatMap((extension) => extension.dev?.routes ?? []),
    ],
    {
      AccessGuard: RouteAccessGuard,
    }
  );

  return (
    <Route
      key="registry-development"
      path="/dev"
      element={<DevelopmentLayout menuItems={menuItems} />}
    >
      <Route index element={<Navigate to={firstRoute} replace />} />
      {routes}
    </Route>
  );
}

function DevelopmentLayout({ menuItems }: { menuItems: TreeMenuItem[] }) {
  const { pathname } = useLocation();

  return (
    <SidebarProvider>
      <SidebarNavigation
        menuItems={menuItems}
        selectedKey={findSelectedKey(menuItems, pathname)}
      />
      <SidebarInset className="bg-muted/25">
        <Header />
        <main
          className={cn(
            "@container/main mx-auto flex w-full max-w-[1600px] flex-1 flex-col",
            "relative px-4 py-5 md:p-6 lg:px-8 lg:py-7"
          )}
        >
          <PageErrorBoundary>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
