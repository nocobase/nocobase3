import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import {
  ListFilter,
  Mail,
  MessagesSquare,
  PanelsLeftRight,
  PenLine,
  Users,
  UsersRound,
} from "lucide-react";
import { MailUnreadProvider } from "./components/mail-unread";

const nocobaseMailExtension: AppExtension = {
  id: "nocobase-mail",
  Provider: MailUnreadProvider,
  dev: {
    resources: [
      {
        name: "mail",
        list: "mail",
        meta: {
          label: "Mail manager",
          icon: <Mail />,
          description: "Read, send, and manage mailbox messages.",
        },
      },
      {
        name: "mail-scenario-workspace",
        list: "mail/workspace",
        meta: {
          parent: "mail",
          label: "My mailbox",
          icon: <PanelsLeftRight />,
        },
      },
      {
        name: "mail-scenario-audiences",
        list: "mail/personal",
        meta: {
          parent: "mail",
          label: "Mailbox views",
          icon: <Users />,
        },
      },
      {
        name: "mail-scenario-unread",
        list: "mail/unread",
        meta: {
          parent: "mail",
          label: "Unread indicator",
          icon: <MessagesSquare />,
        },
      },
      {
        name: "mail-scenario-compose",
        list: "mail/compose",
        meta: {
          parent: "mail",
          label: "Compose & send",
          icon: <PenLine />,
        },
      },
      {
        name: "mail-scenario-correspondence",
        list: "mail/filtered",
        meta: {
          parent: "mail",
          label: "Correspondence per user",
          icon: <ListFilter />,
        },
      },
      {
        name: "mail-bulk",
        list: "mail/bulk",
        meta: {
          parent: "mail",
          label: "Bulk mail",
          icon: <UsersRound />,
          description: "Send bulk mail and track delivery jobs.",
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.mail",
        path: "mail",
        children: [
          {
            name: "development.mail.overview",
            index: true,
            lazy: () =>
              import("./mail-demo-pages").then((module) => ({
                default: module.MailScenarioOverview,
              })),
          },
          {
            name: "development.mail.workspace",
            path: "workspace",
            lazy: () =>
              import("./mail-pages").then((module) => ({
                default: module.MailManagerPage,
              })),
          },
          {
            name: "development.mail.personal",
            path: "personal",
            lazy: () =>
              import("./mail-demo-pages").then((module) => ({
                default: module.MailAudienceScenario,
              })),
          },
          {
            name: "development.mail.unread",
            path: "unread",
            lazy: () =>
              import("./mail-demo-pages").then((module) => ({
                default: module.MailUnreadScenario,
              })),
          },
          {
            name: "development.mail.compose",
            path: "compose",
            lazy: () =>
              import("./mail-pages").then((module) => ({
                default: module.MailComposePage,
              })),
          },
          {
            name: "development.mail.filtered",
            path: "filtered",
            lazy: () =>
              import("./mail-demo-pages").then((module) => ({
                default: module.MailCorrespondenceScenario,
              })),
          },
          {
            name: "development.mail.bulk",
            path: "bulk",
            lazy: () =>
              import("./mail-pages").then((module) => ({
                default: module.MailBulkPage,
              })),
          },
        ],
      },
    ]),
  },
};

export default nocobaseMailExtension;
