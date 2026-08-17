import { lazy } from "react";
import { Building2 } from "lucide-react";

import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";

const WecomSignInButton = lazy(() => import("./wecom-sign-in-button"));
const WecomAutoLoginProvider = lazy(() => import("./auto-login-provider"));

const wecomAuthExtension: AppExtension = {
  id: "nocobase-auth-wecom",
  AuthRuntimeProvider: WecomAutoLoginProvider,
  authRuntimePriority: 10,
  dev: {
    resources: [
      {
        name: "auth-wecom-demo",
        list: "auth/wecom",
        meta: {
          parent: "auth-components",
          label: "WeCom",
          icon: <Building2 />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.auth.wecom",
        path: "auth/wecom",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.WecomAuthDemoPage,
          })),
      },
    ]),
  },
  authAdapters: [
    {
      authType: "wecom",
      placement: "button",
      Component: WecomSignInButton,
    },
  ],
};

export default wecomAuthExtension;
