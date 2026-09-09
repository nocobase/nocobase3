import type {
  AIEmployee as AIEmployeeType,
  SkillsEntity,
  ToolsEntity,
  ToolsFilter,
} from '@nocobase/ai-employee';
import { listSystemTools, SYSTEM_TOOLS } from '@nocobase/ai-employee';
import _ from 'lodash';
import {
  listAccessibleAIEmployees,
  serializeEmployeeSummary,
} from '../../manager/sub-agents/shared.js';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  LOAD_FRONTEND_TOOL_NAME,
} from './common/frontend-tools.js';
import {
  listCurrentFrontendTools,
  prepareToolsForFrontendConversation,
  shouldAutoExecuteFrontendTool,
} from './frontend-tools.js';
import type { AIEmployeeAgentOptions } from './options.js';
import type { ToolCallPolicy } from './tool-call-policy.js';

export class AIEmployeeToolContext implements ToolCallPolicy {
  public constructor(private readonly options: AIEmployeeAgentOptions) {
    options.builtInManager.setupBuiltInInfo({
      employee: options.employee as unknown as AIEmployeeType,
      translate: options.agentContext.translate,
    });
  }

  private get chatSettings(): {
    enableSkills?: boolean;
    enableTools?: boolean;
  } {
    return (this.options.employee.chatSettings ?? {}) as {
      enableSkills?: boolean;
      enableTools?: boolean;
    };
  }

  private async getKnowledgeBaseRetrieveTool(): Promise<
    ToolsEntity | undefined
  > {
    const employee = this.options.employee as unknown as AIEmployeeType;
    if (
      !(await this.options.knowledgeBaseManager.isEnabledKnowledgeBase(
        employee,
      ))
    )
      return undefined;
    if (
      !(await this.options.knowledgeBaseManager.hasAccessibleKnowledgeBase({
        employee,
        roleNames: this.options.agentContext.actor.roles,
      }))
    )
      return undefined;
    return this.options.agentContext.ai.toolsManager.getTools(
      SYSTEM_TOOLS.KNOWLEDGE_BASE,
      {
        ctx: this.options.agentContext,
      },
    );
  }

  private listTools(filter?: ToolsFilter): Promise<ToolsEntity[]> {
    return this.options.agentContext.ai.toolsManager.listTools({
      ...filter,
      ctx: this.options.agentContext,
    });
  }

  private async getAIEmployeeTools(): Promise<ToolsEntity[]> {
    if (this.chatSettings.enableTools === false) return [];
    const currentFrontendTools = await listCurrentFrontendTools(
      this.options.repositories,
      {
        ...(this.options.execution ?? {}),
        sessionId: this.options.sessionId,
      },
    );
    const tools = await this.listTools({ scope: 'GENERAL' });
    const getSkill = await this.options.agentContext.ai.toolsManager.getTools(
      SYSTEM_TOOLS.GET_SKILL,
      {
        ctx: this.options.agentContext,
      },
    );
    if (getSkill) tools.push(getSkill);
    if (this.options.webSearch === true) {
      const webSearch =
        await this.options.agentContext.ai.toolsManager.getTools(
          SYSTEM_TOOLS.WEB_SEARCH,
          {
            ctx: this.options.agentContext,
          },
        );
      if (webSearch) tools.push(webSearch);
    }
    const generalNames = new Set(tools.map((tool) => tool.definition.name));
    const toolMap = await this.getToolsMap();
    const configured = [
      ...(this.options.employee.skillSettings?.tools ?? []),
      ...(this.options.tools ?? []),
    ];
    if (await this.getKnowledgeBaseRetrieveTool())
      configured.push({ name: SYSTEM_TOOLS.KNOWLEDGE_BASE });
    for (const setting of configured) {
      if (!generalNames.has(setting.name)) {
        const tool = toolMap.get(setting.name);
        if (tool) tools.push(tool);
      }
    }
    const systemTools = [
      ...listSystemTools(),
      LOAD_FRONTEND_TOOL_NAME,
      EXECUTE_FRONTEND_TOOL_NAME,
    ];
    const settings = this.options.skillSettings;
    if (!settings)
      return prepareToolsForFrontendConversation(tools, currentFrontendTools);
    const filter = settings.tools;
    if (!settings.toolsVersion) {
      const names = filter ?? [];
      return prepareToolsForFrontendConversation(
        tools.filter(
          (tool) =>
            names.length === 0 ||
            systemTools.includes(tool.definition.name) ||
            names.includes(tool.definition.name),
        ),
        currentFrontendTools,
      );
    }
    if (Array.isArray(filter)) {
      return prepareToolsForFrontendConversation(
        tools.filter(
          (tool) =>
            systemTools.includes(tool.definition.name) ||
            filter.includes(tool.definition.name),
        ),
        currentFrontendTools,
      );
    }
    return prepareToolsForFrontendConversation(tools, currentFrontendTools);
  }

  public async getAvailableSkills(): Promise<SkillsEntity[]> {
    if (this.chatSettings.enableSkills === false) return [];
    const skillsManager = this.options.agentContext.ai.skillsManager;
    const getSkill = (await this.getAIEmployeeTools()).find(
      (tool) => tool.definition.name === SYSTEM_TOOLS.GET_SKILL,
    );
    if (!getSkill) return [];
    const general = await skillsManager.listSkills({ scope: 'GENERAL' });
    const names = this.options.employee.skillSettings?.skills ?? [];
    const specified = names.length ? await skillsManager.getSkills(names) : [];
    const merged = _.uniqBy([...(specified || []), ...(general || [])], 'name');
    const settings = this.options.skillSettings;
    if (!settings) return merged;
    const filter = settings.skills ?? [];
    if (!settings.skillsVersion) {
      return merged.filter(
        (skill) => filter.length === 0 || filter.includes(skill.name),
      );
    }
    return Array.isArray(filter)
      ? merged.filter((skill) => filter.includes(skill.name))
      : merged;
  }

  public async getAgentTools(): Promise<{
    tools: ToolsEntity[];
    baseToolNames: Set<string>;
  }> {
    if (this.chatSettings.enableTools === false)
      return { tools: [], baseToolNames: new Set() };
    const baseTools = await this.getAIEmployeeTools();
    const toolMap = new Map(await this.getToolsMap());
    for (const tool of baseTools) toolMap.set(tool.definition.name, tool);
    const skillToolNames = new Set(
      (await this.getAvailableSkills()).flatMap((skill) => skill.tools ?? []),
    );
    const baseToolNames = new Set(
      baseTools
        .map((tool) => tool.definition.name)
        .filter(
          (name) =>
            name === SYSTEM_TOOLS.GET_SKILL || !skillToolNames.has(name),
        ),
    );
    return { tools: Array.from(toolMap.values()), baseToolNames };
  }

  private async getLoadedSkillNames(): Promise<string[]> {
    const list = await this.options.repositories.aiToolMessages.find({
      filter: {
        sessionId: this.options.sessionId,
        toolName: SYSTEM_TOOLS.GET_SKILL,
        status: 'success',
      },
      sort: ['id'],
    });
    const names = new Set<string>();
    for (const item of list) {
      let content: unknown = item.content;
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          continue;
        }
      }
      if (content && typeof content === 'object') {
        const name = (content as Record<string, unknown>).skillName;
        if (typeof name === 'string') names.add(name);
      }
    }
    return [...names];
  }

  public async getActivatedSkillToolNames(): Promise<Set<string>> {
    const names = await this.getLoadedSkillNames();
    if (!names.length) return new Set();
    const loaded =
      await this.options.agentContext.ai.skillsManager.getSkills(names);
    const normalized = Array.isArray(loaded) ? loaded : [loaded];
    const skills = new Map(
      [...(await this.getAvailableSkills()), ...normalized.filter(Boolean)].map(
        (skill) => [skill.name, skill],
      ),
    );
    return new Set(names.flatMap((name) => skills.get(name)?.tools ?? []));
  }

  public async getAvailableAIEmployees(): Promise<
    ReturnType<typeof serializeEmployeeSummary>[]
  > {
    const configured =
      this.options.employee.skillSettings?.tools?.map(
        ({ name }: { name: string }) => name,
      ) ?? [];
    if (!configured.includes('dispatch-sub-agent-task')) return [];
    return (
      await listAccessibleAIEmployees({
        roleNames: this.options.agentContext.actor.roles,
        repositories: this.options.repositories,
      })
    )
      .map((employee) =>
        serializeEmployeeSummary({
          employee,
          builtInManager: this.options.builtInManager,
          translate: this.options.agentContext.translate,
        }),
      )
      .filter(
        (employee) => employee.username !== this.options.employee.username,
      );
  }

  public async getToolsMap(): Promise<ReadonlyMap<string, ToolsEntity>> {
    const tools = await this.listTools({ sessionId: this.options.sessionId });
    return new Map(tools.map((tool) => [tool.definition.name, tool]));
  }

  public shouldInterruptToolCall(tool?: ToolsEntity): boolean {
    return tool?.execution === 'frontend' || !this.isAutoCall(tool, undefined);
  }

  public async isAutoCall(
    tool: ToolsEntity | undefined,
    args: unknown,
  ): Promise<boolean> {
    if (tool?.definition.name === EXECUTE_FRONTEND_TOOL_NAME) {
      const frontendTools = await listCurrentFrontendTools(
        this.options.repositories,
        {
          ...(this.options.execution ?? {}),
          sessionId: this.options.sessionId,
        },
      );
      return shouldAutoExecuteFrontendTool(frontendTools, args);
    }
    if (!tool) return false;
    const fallback = tool.defaultPermission === 'ALLOW';
    if (tool.scope !== 'CUSTOM') return fallback;
    const preset = this.options.employee.skillSettings?.tools?.find(
      (setting: { name: string }) => setting.name === tool.definition.name,
    );
    return preset ? preset.autoCall === true : fallback;
  }
}
