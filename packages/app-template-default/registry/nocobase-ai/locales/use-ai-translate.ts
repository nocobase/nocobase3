import { useTranslate } from "@refinedev/core";
import { useCallback } from "react";
import { NOCOBASE_AI_I18N_NAMESPACE } from ".";

export function useAITranslate() {
  const translate = useTranslate();

  return useCallback(
    (
      key: string,
      fallback: string,
      options: Record<string, unknown> = {}
    ) =>
      translate(
        key,
        { ...options, ns: NOCOBASE_AI_I18N_NAMESPACE },
        fallback
      ),
    [translate]
  );
}
