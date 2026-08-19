import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { Bell, MailWarning, ScrollText, Server } from "lucide-react";
import { NotificationInboxBell, NotificationInboxProvider } from './inbox/runtime';

const notificationExtension: AppExtension = {
  id: "notification-operations",
  Provider: NotificationInboxProvider,
  HeaderItems: NotificationInboxBell,
  resources: [
    {
      name: 'notification-inbox',
      list: 'inbox',
      meta: {
        label: 'My notifications',
        icon: <Bell />,
        acl: { type: 'authenticated' },
      },
    },
    {
      name: "notification-operations",
      meta: {
        label: "Notifications",
        icon: <MailWarning />,
        description: "Inspect delivery state and provider connectivity.",
        acl: { type: "authenticated" },
      },
    },
    {
      name: "notification-deliveries",
      list: "notifications",
      meta: {
        parent: "notification-operations",
        label: "Delivery log",
        icon: <ScrollText />,
        acl: { type: "authenticated" },
      },
    },
    {
      name: "notification-providers",
      list: "notifications/providers",
      meta: {
        parent: "notification-operations",
        label: "Providers",
        icon: <Server />,
        acl: { type: "authenticated" },
      },
    },
  ],
  routes: defineAppRoutes([
    {
      name: 'notification-inbox',
      path: 'inbox',
      meta: { acl: { type: 'authenticated' } },
      lazy: () =>
        import('./inbox/page').then((module) => ({
          default: module.NotificationInboxPage,
        })),
    },
    {
      name: "notifications",
      path: "notifications",
      meta: { acl: { type: "authenticated" } },
      children: [
        {
          name: "notifications.deliveries",
          index: true,
          lazy: () =>
            import("./admin/pages").then((module) => ({
              default: module.NotificationDeliveryAdminPage,
            })),
        },
        {
          name: "notifications.providers",
          path: "providers",
          lazy: () =>
            import("./admin/pages").then((module) => ({
              default: module.NotificationProviderAdminPage,
            })),
        },
      ],
    },
  ]),
};

export default notificationExtension;
