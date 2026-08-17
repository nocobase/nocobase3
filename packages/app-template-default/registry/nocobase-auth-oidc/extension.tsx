import { lazy } from "react";
import { LogIn } from "lucide-react";

import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";

const OidcSignInButton = lazy(() => import("./oidc-sign-in-button"));
const OidcAutoRedirectProvider = lazy(() => import("./auto-redirect-provider"));

const oidcAuthExtension: AppExtension = {
  id: "nocobase-auth-oidc",
  AuthRuntimeProvider: OidcAutoRedirectProvider,
  authRuntimePriority: 20,
  dev: {
    resources: [
      {
        name: "auth-oidc-demo",
        list: "auth/oidc",
        meta: {
          parent: "auth-components",
          label: "OIDC",
          icon: <LogIn />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.auth.oidc",
        path: "auth/oidc",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.OidcAuthDemoPage,
          })),
      },
    ]),
  },
  authAdapters: [
    {
      authType: "OIDC",
      placement: "button",
      Component: OidcSignInButton,
    },
  ],
};

export default oidcAuthExtension;
