import type { ToolsEntity } from '@nocobase/ai-employee';

const baseToolNamesByMap = new WeakMap<
  ReadonlyMap<string, ToolsEntity>,
  ReadonlySet<string>
>();

export function markToolMapBaseNames(
  toolMap: ReadonlyMap<string, ToolsEntity>,
  baseToolNames: ReadonlySet<string>,
): ReadonlyMap<string, ToolsEntity> {
  baseToolNamesByMap.set(toolMap, new Set(baseToolNames));
  return toolMap;
}

export function getToolMapBaseNames(
  toolMap: ReadonlyMap<string, ToolsEntity>,
): ReadonlySet<string> {
  return baseToolNamesByMap.get(toolMap) ?? new Set(toolMap.keys());
}
