import { beforeAll, describe, expect, it } from "vitest";

import {
  applySystemLocale,
  getCurrentLocale,
  i18n,
  registerTranslationResources,
  resolveTranslatableText,
  translate,
} from "@nocobase/portal-sdk/i18n";
import { portalI18nReady } from "@/providers/i18n/runtime";
import "@/locales";

describe("Portal i18n integration", () => {
  beforeAll(() => portalI18nReady);

  it("resolves template and extension translations", async () => {
    await i18n.changeLanguage("en-US");
    expect(translate("buttons.create", { ns: "starter" }, "Create")).toBe(
      "Create"
    );

    await i18n.changeLanguage("zh-CN");
    expect(translate("buttons.create", { ns: "starter" }, "Create")).toBe(
      "新建"
    );
    expect(resolveTranslatableText('{{t("Admin")}}')).toBe("管理员");

    registerTranslationResources("example-feature", {
      "en-US": { title: "Example" },
      "zh-CN": { title: "示例" },
    });
    expect(
      translate("title", { ns: "example-feature" }, "Example")
    ).toBe("示例");
  });

  it("applies the locale selected by System Settings", async () => {
    await applySystemLocale({
      appLang: "en-US",
      enabledLanguages: ["en-US", "zh-CN"],
    });
    expect(getCurrentLocale()).toBe("en-US");
  });
});
