/** Limits per coding tool as the runtime forms edit them: the text of each tool's limit, read back into `ToolSlots`. */
import type { AgentTool, ToolSlots } from '@nocobase/agent-protocol';

/** What the fields hold: the text of each tool's limit, empty for none. */
export type ToolSlotsDraft = Readonly<Partial<Record<AgentTool, string>>>;

export function toolSlotsDraft(toolSlots: ToolSlots | null): ToolSlotsDraft {
  return Object.fromEntries(
    Object.entries(toolSlots ?? {}).map(([tool, count]) => [
      tool,
      String(count),
    ]),
  );
}

/**
 * The limits `draft` holds for `tools`, null for none; undefined when one of them is not a whole number from 1 to 64.
 * Tools not in `tools` are left out.
 */
export function readToolSlots(
  draft: ToolSlotsDraft,
  tools: readonly AgentTool[],
): ToolSlots | null | undefined {
  const slots: Partial<Record<AgentTool, number>> = {};
  for (const tool of tools) {
    const text = draft[tool]?.trim() ?? '';
    if (text === '') continue;
    const count = Number(text);
    if (!/^\d+$/u.test(text) || count < 1 || count > 64) return undefined;
    slots[tool] = count;
  }
  return Object.keys(slots).length > 0 ? slots : null;
}
