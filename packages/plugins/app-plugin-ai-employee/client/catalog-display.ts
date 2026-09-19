import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';
import { compareResourceNames } from './resource-name-order.js';

interface ToolDisplayMetadata {
  name: string;
  title?: string;
  about?: string;
  i18n?: { namespace: string };
}

interface SkillDisplayMetadata {
  name: string;
  title?: string;
  description?: string;
  i18n?: { namespace: string };
}

export interface CatalogDisplay {
  toolTitle: (tool: ToolDisplayMetadata) => string;
  toolAbout: (tool: ToolDisplayMetadata) => string;
  skillTitle: (skill: SkillDisplayMetadata) => string;
  skillDescription: (skill: SkillDisplayMetadata) => string;
  compareTitles: (
    leftTitle: string,
    rightTitle: string,
    leftName: string,
    rightName: string,
  ) => number;
  locale: string | undefined;
}

/** Translate display fields only; identifiers and model-facing text stay raw. */
export function useCatalogDisplay(): CatalogDisplay {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || undefined;
  return useMemo(() => {
    const collator = new Intl.Collator(locale, {
      numeric: true,
      sensitivity: 'base',
    });
    // Resource ownership is explicit: do not expand it to the App's fallback
    // namespaces as the UI-copy translator does. Keep its no-runtime fallback.
    const translateSource = i18n.isInitialized ? i18n.t.bind(i18n) : t;
    const translate = (
      source: string | undefined,
      namespace?: string,
    ): string =>
      source && namespace
        ? translateSource(source, {
            ns: namespace,
            keySeparator: false,
            nsSeparator: false,
            defaultValue: source,
            fallbackNS: false,
            skipInterpolation: true,
          })
        : (source ?? '');
    return {
      toolTitle: (tool) =>
        translate(tool.title, tool.i18n?.namespace).trim() || tool.name,
      toolAbout: (tool) => translate(tool.about, tool.i18n?.namespace),
      skillTitle: (skill) =>
        translate(skill.title, skill.i18n?.namespace).trim() || skill.name,
      skillDescription: (skill) =>
        translate(skill.description, skill.i18n?.namespace),
      compareTitles: (leftTitle, rightTitle, leftName, rightName) =>
        collator.compare(leftTitle, rightTitle) ||
        compareResourceNames(leftName, rightName),
      locale,
    };
  }, [t, i18n, locale]);
}
