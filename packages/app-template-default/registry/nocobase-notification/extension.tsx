import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { Bell, FileClock, Mail } from "lucide-react";

import { NotificationInAppProvider } from "./in-app/runtime.js";

const notificationExtension: AppExtension = {
  id: "nocobase-notification",
  Provider: NotificationInAppProvider,
  resources: [
    {
      name: "notifications",
      list: "notifications",
      meta: {
        label: "Notifications",
        icon: <Bell />,
        acl: { type: "authenticated" },
      },
    },
    {
      name: "notification-email-logs",
      list: "notifications",
      meta: {
        parent: "notifications",
        label: "Email delivery logs",
        icon: <FileClock />,
        acl: { type: "authenticated" },
      },
    },
    {
      name: "notification-in-app",
      list: "notifications/in-app",
      meta: {
        parent: "notifications",
        label: "My notifications",
        icon: <Mail />,
        acl: { type: "authenticated" },
      },
    },
  ],
  routes: defineAppRoutes([
    {
      name: "notifications",
      path: "notifications",
      meta: { acl: { type: "authenticated" } },
      children: [
        {
          name: "notifications.email-logs",
          index: true,
          lazy: () =>
            import("./logs/page.js").then((module) => ({
              default: module.NotificationEmailLogsPage,
            })),
        },
        {
          name: "notifications.in-app",
          path: "in-app",
          lazy: () =>
            import("./in-app/page.js").then((module) => ({
              default: module.NotificationInAppPage,
            })),
        },
      ],
    },
  ]),
};

export default notificationExtension;
