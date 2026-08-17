import { beforeAll, describe, expect, it } from "vitest";

import { i18n, translate } from "@nocobase/portal-sdk/i18n";
import { portalI18nReady } from "@/providers/i18n/runtime";
import "../locales";

describe("NocoBase AI translations", () => {
  beforeAll(() => portalI18nReady);

  it("provides the core English and Chinese interaction copy", async () => {
    await i18n.changeLanguage("en-US");
    expect(translate("chat.conversations", { ns: "nocobase-ai" })).toBe(
      "Conversations"
    );
    expect(
      translate("tool.status.approvalRequired", { ns: "nocobase-ai" })
    ).toBe("Approval required");

    await i18n.changeLanguage("zh-CN");
    expect(translate("navigation.chat", { ns: "nocobase-ai" })).toBe(
      "聊天窗口"
    );
    expect(translate("chat.composer.send", { ns: "nocobase-ai" })).toBe(
      "发送消息"
    );
    expect(
      translate("pageElement.pick", { ns: "nocobase-ai" })
    ).toBe("选择一个页面元素");
  });
});
