---
'@nocobase/agent-protocol': minor
'@nocobase/agent-runner': minor
'@nocobase/app-plugin-agents': minor
'@nocobase/app-plugin-projects': patch
---

Limit a runner's concurrent runs per coding tool, beside its total slots, so a machine with Claude Code and Codex can run, say, at most two Claude runs and one Codex run at once.

- `@nocobase/agent-protocol`: optional `toolSlots` on registration, `load.tools` on the heartbeat and `tools` on the claim (`ToolSlots`, `ToolLoad`). They are additions within protocol 7: a side that does not know them ignores them.
- `@nocobase/agent-runner`: `register --slots` and `start --slots` take a total, limits per tool, or both (`3,claude=2,codex=1`). The limits hold across every application the machine serves; each claim says how many runs of each limited tool the runner can still take, and the heartbeat reports them.
- `@nocobase/app-plugin-agents`: runners and registration tokens keep `toolSlots`, set on registration or on the runtime's settings and in the "Add runtime" dialog. A claim takes a run only when both the runner's total and the run's tool have room, using the agent's next tool while its first is full and passing over a run none of whose tools has room. A queued run waiting on a full tool reads `toolSlotsFull` rather than `runnersBusy`, and the runtimes page shows the runs by tool against each limit. The migration `202610080001_ag_add_runner_tool_slots` adds the columns.
- `@nocobase/app-plugin-projects`: words the `toolSlotsFull` wait reason.
