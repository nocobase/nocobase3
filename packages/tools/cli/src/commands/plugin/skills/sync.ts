import SkillsSync from '../../skills/sync.ts';

/** Compatibility entry point for applications that still invoke `plugin:skills:sync`. */
export default class PluginSkillsSync extends SkillsSync {
  static override summary =
    "Copy NocoBase package skills into the app's .agents/skills (compatibility alias).";
  static override description =
    'Compatibility alias for skills:sync. It synchronizes skills from direct @nocobase/* dependencies and registered plugins. New scripts should invoke skills:sync.';

  protected override readonly operation = 'plugin:skills:sync';
}
