import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { Layers3 } from "lucide-react";

const routeSurfacesExtension: AppExtension = {
  id: "nocobase-route-surfaces",
  dev: {
    resources: [
      {
        name: "route-surfaces",
        list: "route-surfaces",
        meta: {
          label: "Route surfaces",
          icon: <Layers3 />,
          description:
            "URL-backed drawer, dialog, page, and nested route patterns.",
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.route-surfaces.overlays",
        path: "route-surfaces",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.RouteSurfacesDemoHome,
          })),
        children: [
          {
            name: "development.route-surfaces.drawer",
            path: "drawer",
            lazy: () =>
              import("./demo").then((module) => ({
                default: module.DemoDrawerRoute,
              })),
            children: [
              {
                name: "development.route-surfaces.drawer.second",
                path: "second",
                lazy: () =>
                  import("./demo").then((module) => ({
                    default: module.DemoSecondDrawerRoute,
                  })),
              },
            ],
          },
          {
            name: "development.route-surfaces.dialog",
            path: "dialog",
            lazy: () =>
              import("./demo").then((module) => ({
                default: module.DemoDialogRoute,
              })),
          },
        ],
      },
      {
        name: "development.route-surfaces.page",
        path: "route-surfaces/page",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.DemoPageRoute,
          })),
        children: [
          {
            name: "development.route-surfaces.page.drawer",
            path: "drawer",
            lazy: () =>
              import("./demo").then((module) => ({
                default: module.DemoPageDrawerRoute,
              })),
            children: [
              {
                name: "development.route-surfaces.page.drawer.dialog",
                path: "dialog",
                lazy: () =>
                  import("./demo").then((module) => ({
                    default: module.DemoPageDrawerDialogRoute,
                  })),
              },
            ],
          },
        ],
      },
      {
        name: "development.route-surfaces.contextual",
        path: "route-surfaces/contextual",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.DemoContextualHomeRoute,
          })),
        children: [
          {
            name: "development.route-surfaces.contextual.list",
            path: "list",
            lazy: () =>
              import("./demo").then((module) => ({
                default: module.DemoContextualListRoute,
              })),
            children: [
              {
                name: "development.route-surfaces.contextual.create",
                path: "create",
                lazy: () =>
                  import("./demo").then((module) => ({
                    default: module.DemoContextualCreateRoute,
                  })),
              },
              {
                name: "development.route-surfaces.contextual.detail",
                path: "detail/:id",
                lazy: () =>
                  import("./demo").then((module) => ({
                    default: module.DemoContextualDetailRoute,
                  })),
                children: [
                  {
                    name: "development.route-surfaces.contextual.detail.edit",
                    path: "edit",
                    lazy: () =>
                      import("./demo").then((module) => ({
                        default: module.DemoContextualEditRoute,
                      })),
                  },
                ],
              },
              {
                name: "development.route-surfaces.contextual.edit",
                path: "edit/:id",
                lazy: () =>
                  import("./demo").then((module) => ({
                    default: module.DemoContextualEditRoute,
                  })),
              },
            ],
          },
        ],
      },
    ]),
  },
};

export default routeSurfacesExtension;
