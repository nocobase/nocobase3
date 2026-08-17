import { lazy } from "react";
import { KeyRound } from "lucide-react";

import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";

const CasSignInButton = lazy(() => import("./cas-sign-in-button"));

const casAuthExtension: AppExtension = {
  id: "nocobase-auth-cas",
  dev: {
    resources: [
      {
        name: "auth-cas-demo",
        list: "auth/cas",
        meta: {
          parent: "auth-components",
          label: "CAS",
          icon: <KeyRound />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.auth.cas",
        path: "auth/cas",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.CasAuthDemoPage,
          })),
      },
    ]),
  },
  authAdapters: [
    {
      authType: "CAS",
      placement: "button",
      Component: CasSignInButton,
    },
  ],
};

export default casAuthExtension;
