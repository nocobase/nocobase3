import type {
  AIEmployeeEditableValues,
  AIMetadataItem,
} from './ai-employee-service.js';

export function effectiveSkillNames(
  settings: AIEmployeeEditableValues['skillSettings'] | undefined,
  catalog: AIMetadataItem[],
): string[] {
  return (
    settings?.enabledSkills ?? [
      ...new Set([
        ...catalog
          .filter((item) => item.scope === 'GENERAL')
          .map((item) => item.name),
        ...(settings?.skills ?? []),
      ]),
    ]
  );
}

export function effectiveToolNames(
  settings: AIEmployeeEditableValues['skillSettings'] | undefined,
  tools: AIMetadataItem[],
  skills: AIMetadataItem[],
): string[] {
  if (settings?.enabledTools != null) return settings.enabledTools;
  const enabledSkills = new Set(effectiveSkillNames(settings, skills));
  // These are the runtime SYSTEM_TOOLS identifiers. Optional capabilities and
  // skill-bound tools are eligible here, not necessarily active in a session.
  const optionalSystemTools = new Set([
    'getSkill',
    'subAgentWebSearch',
    'knowledge-base-retrieve',
  ]);
  return [
    ...new Set([
      ...tools
        .filter(
          (item) =>
            item.scope === 'GENERAL' || optionalSystemTools.has(item.name),
        )
        .map((item) => item.name),
      ...(settings?.tools ?? []).map((item) => item.name),
      ...skills
        .filter((item) => enabledSkills.has(item.name))
        .flatMap((item) => item.tools ?? []),
    ]),
  ];
}
