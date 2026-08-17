import { NocoBaseAIExtensionProvider } from "./global-ai-chat";
import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import {
  Bot,
  MessageSquare,
  MousePointer2,
  PanelRight,
  Sparkles,
  Wrench,
} from "lucide-react";
import "./locales";

const nocobaseAIExtension: AppExtension = {
  id: "nocobase-ai",
  Provider: NocoBaseAIExtensionProvider,
  dev: {
    resources: [
      {
        name: "ai-components",
        meta: {
          label: "AI Components",
          i18nKey: "navigation.group",
          i18nOptions: { ns: "nocobase-ai" },
          icon: <Bot />,
          acl: { type: "authenticated" },
        },
      },
      {
        name: "ai-chat-window",
        list: "ai-chat",
        meta: {
          parent: "ai-components",
          label: "Chat window",
          i18nKey: "navigation.chat",
          i18nOptions: { ns: "nocobase-ai" },
          icon: <MessageSquare />,
          description:
            "Build freely with AI while NocoBase keeps the application reliable.",
          acl: { type: "authenticated" },
        },
      },
      {
        name: "ai-floating-chat",
        list: "ai-chat/floating",
        meta: {
          parent: "ai-components",
          label: "Floating chat",
          i18nKey: "navigation.floating",
          i18nOptions: { ns: "nocobase-ai" },
          icon: <PanelRight />,
          acl: { type: "authenticated" },
        },
      },
      {
        name: "ai-employee-tasks",
        list: "ai-chat/shortcut",
        meta: {
          parent: "ai-components",
          label: "Employee tasks",
          i18nKey: "navigation.tasks",
          i18nOptions: { ns: "nocobase-ai" },
          icon: <Sparkles />,
          acl: { type: "authenticated" },
        },
      },
      {
        name: "ai-page-context",
        list: "ai-chat/context",
        meta: {
          parent: "ai-components",
          label: "Page context",
          i18nKey: "navigation.context",
          i18nOptions: { ns: "nocobase-ai" },
          icon: <MousePointer2 />,
          acl: { type: "authenticated" },
        },
      },
      {
        name: "ai-tool-cards",
        list: "ai-chat/tools",
        meta: {
          parent: "ai-components",
          label: "Tool cards",
          i18nKey: "navigation.tools",
          i18nOptions: { ns: "nocobase-ai" },
          icon: <Wrench />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.ai",
        path: "ai-chat",
        children: [
          {
            name: "development.ai.chat",
            index: true,
            lazy: () =>
              import("./demo").then((module) => ({
                default: module.AIChatPage,
              })),
          },
          {
            name: "development.ai.floating",
            path: "floating",
            lazy: () =>
              import("./demo/floating").then((module) => ({
                default: module.FloatingChatPage,
              })),
          },
          {
            name: "development.ai.shortcut",
            path: "shortcut",
            lazy: () =>
              import("./demo/shortcut").then((module) => ({
                default: module.ShortcutPage,
              })),
          },
          {
            name: "development.ai.context",
            path: "context",
            lazy: () =>
              import("./demo/page-context").then((module) => ({
                default: module.PageContextPage,
              })),
          },
          {
            name: "development.ai.tools",
            path: "tools",
            lazy: () =>
              import("./demo/tool-cards").then((module) => ({
                default: module.ToolCardsPage,
              })),
          },
        ],
      },
    ]),
  },
};

export default nocobaseAIExtension;
