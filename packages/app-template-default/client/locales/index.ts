import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import { starter as enUSStarter } from "./en-US";
import { starter as zhCNStarter } from "./zh-CN";

registerTranslationResources("starter", {
  "en-US": enUSStarter,
  "zh-CN": zhCNStarter,
});
