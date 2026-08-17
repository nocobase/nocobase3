import { UsersRound } from "lucide-react";

import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { userRoutes } from "./routes";

export const usersExampleRoutes = defineAppRoutes([
  {
    name: "users",
    path: userRoutes.list,
    lazy: () => import("./list"),
    resource: {
      meta: {
        label: "Users",
        priority: 1,
        singularLabel: "User",
        i18nKey: "resources.users",
        i18nSingularKey: "resources.user",
        i18nOptions: { ns: "app" },
        descriptionI18nKey: "resources.users.description",
        icon: <UsersRound />,
        description:
          "Manage the people who can sign in and work in this NocoBase application.",
        canCreate: true,
        canDelete: true,
        acl: { type: "collection" },
      },
    },
    children: [
      {
        name: "users.create",
        path: "create",
        resourceAction: "create",
        lazy: () => import("./create"),
      },
      {
        name: "users.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () => import("./edit"),
      },
      {
        name: "users.role",
        path: "roles/:roleName",
        lazy: () =>
          import("./role-detail").then((module) => ({
            default: module.UserRoleDetailRoute,
          })),
      },
      {
        name: "users.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () => import("./show"),
        children: [
          {
            name: "users.show.edit",
            path: "edit",
            lazy: () =>
              import("./edit").then((module) => ({
                default: module.UserShowEditRoute,
              })),
          },
          {
            name: "users.show.role",
            path: "roles/:roleName",
            lazy: () =>
              import("./role-detail").then((module) => ({
                default: module.UserShowRoleDetailRoute,
              })),
          },
        ],
      },
    ],
  },
]);
