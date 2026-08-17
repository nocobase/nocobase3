import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { Blocks, PanelsTopLeft, ShieldCheck } from "lucide-react";
import { RoleSwitcherUserMenuItems } from "./components/role-switcher";

const nocobaseAclExtension: AppExtension = {
  id: "nocobase-acl",
  UserMenuItems: RoleSwitcherUserMenuItems,
  dev: {
    resources: [
      {
        name: "acl-integration",
        meta: {
          label: "Access control",
          icon: <ShieldCheck />,
          description: "NocoBase ACL integration for admin applications.",
          acl: { type: "authenticated" },
        },
      },
      {
        name: "acl-components",
        list: "acl",
        meta: {
          parent: "acl-integration",
          label: "Role switcher",
          icon: <Blocks />,
          acl: { type: "authenticated" },
        },
      },
      {
        name: "acl-patterns",
        list: "acl/patterns",
        meta: {
          parent: "acl-integration",
          label: "Permission patterns",
          icon: <PanelsTopLeft />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.acl",
        path: "acl",
        children: [
          {
            name: "development.acl.components",
            index: true,
            lazy: () =>
              import("./demo/components").then((module) => ({
                default: module.AclComponentsPage,
              })),
          },
          {
            name: "development.acl.patterns",
            path: "patterns",
            lazy: () =>
              import("./demo").then((module) => ({
                default: module.AclPatternsPage,
              })),
          },
        ],
      },
    ]),
  },
};

export default nocobaseAclExtension;
