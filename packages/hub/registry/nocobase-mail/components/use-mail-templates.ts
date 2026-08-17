import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { mailApi } from "./mail-api";
import type { MailTemplate } from "./types";

export interface MailTemplateValues {
  name: string;
  content: string;
}

export function useMailTemplates() {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await mailApi.getTemplates());
    } catch (error) {
      setTemplates([]);
      toast.error(error instanceof Error ? error.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async (values: MailTemplateValues) => {
    const template = await mailApi.createTemplate(values);
    setTemplates((prev) => [...prev, template]);
    return template;
  }, []);

  const update = useCallback(
    async (id: number | string, values: MailTemplateValues) => {
      const template = await mailApi.updateTemplate(id, values);
      setTemplates((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...template } : item))
      );
      return template;
    },
    []
  );

  const remove = useCallback(async (id: number | string) => {
    await mailApi.deleteTemplate(id);
    setTemplates((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { templates, loading, refresh, create, update, remove };
}
