---
title: 'Register AI Employees and Tools explicitly'
description: 'Define AI Employees and Tools in server/ai with static imports and load Skills from SKILL.md.'
keywords: 'server/ai/employees,server/ai/tools,ai/skills,SKILL.md,AIResourceRegistrar'
---

# Register AI Employees and Tools explicitly

Application Employees and Tools are defined under `server/ai/`, aggregated with static imports, and registered through `AIResourceRegistrar` from the application Server Provider `boot()` lifecycle.

Employee prompts belong in the TypeScript `systemPrompt` field. Configure the Employee's Skills and Tools explicitly by name. Tool names and descriptions come from the `defineTools()` definition.

```ts
// server/ai/index.ts
import { AIResourceRegistrar } from '@nocobase/app-plugin-ai-employee/server';
import type { AIEmployeeManager, ToolsManager } from '@nocobase/ai-employee';
import employee from './employees/customer-support.js';
import tool from './tools/lookup-order.js';

export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    await aiEmployeeManager.registerEmployee(employee);
  }

  protected override async registerTools(
    toolsManager: ToolsManager,
  ): Promise<void> {
    await toolsManager.registerTools(tool);
  }
}
```

Resolve the existing `aiManagerToken` in the application's Server Provider and call `registerAIResources(ai)`. Do not create another `AIManager`. The lifecycle order is `Tool -> MCP -> Skill -> AI Employee`.

## Skills

Skills remain loader-managed. Each Skill uses a strictly named `SKILL.md` file. The plugin loads its published package-root `ai/skills`, then the App-root `ai/skills`, then directories configured by `ai.skills.paths`. Configured paths may be absolute or relative to the App root; blank and duplicate paths are ignored, and missing directories produce a warning without stopping startup. Skill-local tools, when supported, belong to the Skill loader and are not Employee-local auto-discovery.
