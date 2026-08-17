import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import enUS from "./en-US";
import zhCN from "./zh-CN";

export const NOCOBASE_AI_I18N_NAMESPACE = "nocobase-ai";

registerTranslationResources(NOCOBASE_AI_I18N_NAMESPACE, {
  "en-US": enUS,
  "zh-CN": zhCN,
});
