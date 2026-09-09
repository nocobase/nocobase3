// The commands this package contributes, listed explicitly.
//
// They are imported rather than discovered from the directory tree because the assembled CLI merges them with app and
// plugin commands into one map before oclif sees any of them.
import PluginInspect from '../commands/plugin/inspect.ts';
import PluginRegister from '../commands/plugin/register.ts';
import PluginSkillsSync from '../commands/plugin/skills/sync.ts';
import PluginUnregister from '../commands/plugin/unregister.ts';
import PluginUpdate from '../commands/plugin/update.ts';
import type { AppCliCommand } from '../plugins/types.ts';
import { PLUGIN_TOPIC } from './assemble.ts';

export const builtinCommands: Readonly<Record<string, AppCliCommand>> =
  Object.freeze({
    'plugin:inspect': PluginInspect,
    'plugin:register': PluginRegister,
    'plugin:skills:sync': PluginSkillsSync,
    'plugin:unregister': PluginUnregister,
    'plugin:update': PluginUpdate,
  });

export const builtinTopics: Readonly<Record<string, { description: string }>> =
  Object.freeze({
    [PLUGIN_TOPIC]: { description: 'Manage the plugins this app uses.' },
    'plugin:skills': {
      description: 'Synchronize the agent skills plugins ship.',
    },
  });
