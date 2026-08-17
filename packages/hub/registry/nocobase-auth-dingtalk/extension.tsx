import { lazy } from "react";
import { MessageSquare } from "lucide-react";

import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";

const DingtalkSignInButton = lazy(() => import("./dingtalk-sign-in-button"));
const DingtalkAutoLoginProvider = lazy(() => import("./auto-login-provider"));

const dingtalkAuthExtension: AppExtension = {
  id: "nocobase-auth-dingtalk",
  AuthRuntimeProvider: DingtalkAutoLoginProvider,
  authRuntimePriority: 10,
  dev: {
    resources: [
      {
        name: "auth-dingtalk-demo",
        list: "auth/dingtalk",
        meta: {
          parent: "auth-components",
          label: "DingTalk",
          icon: <MessageSquare />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.auth.dingtalk",
        path: "auth/dingtalk",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.DingtalkAuthDemoPage,
          })),
      },
    ]),
  },
  authAdapters: [
    {
      authType: "dingtalk",
      placement: "button",
      Component: DingtalkSignInButton,
    },
  ],
};

export default dingtalkAuthExtension;
