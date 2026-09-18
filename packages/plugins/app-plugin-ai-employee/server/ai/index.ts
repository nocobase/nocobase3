import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MCPLoader,
  SkillsLoader,
  type AIManager,
  type AIEmployeeManager,
  type ToolsManager,
} from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';

import employees from './employees/index.js';
import tools from './tools/index.js';

export interface AIResourceRegistrarOptions {
  readonly logger?: Logger;
  readonly mcpDirectory?: string;
  readonly skillsDirectories?: readonly (string | AISkillDirectory)[];
  readonly source?: string;
}

export interface AISkillDirectory {
  readonly directory: string;
  readonly source: string;
  readonly optional?: boolean;
}

/** Explicit lifecycle contract for application-owned AI resources. */
export abstract class AIResourceRegistrar {
  private readonly logger?: Logger;
  private readonly mcpDirectory?: string;
  private readonly skillsDirectories: readonly AISkillDirectory[];

  public constructor(options: AIResourceRegistrarOptions = {}) {
    this.logger = options.logger;
    this.mcpDirectory = options.mcpDirectory;
    this.skillsDirectories = normalizeDirectories(
      options.skillsDirectories ?? [],
      options.source ?? 'application',
    );
  }

  public async registerAIResources(ai: AIManager): Promise<void> {
    await this.registerTools(ai.toolsManager);
    this.logStage('tools', await ai.toolsManager.listTools({}));
    await this.loadMCP(ai);
    this.logStage('mcp', await ai.mcpServerManager.listMCP({}));
    await this.loadSkills(ai);
    this.logStage('skills', await ai.skillsManager.listSkills());
    await this.registerAIEmployees(ai.employeeManager);
    this.logStage('employees', await ai.employeeManager.listEmployees());
  }

  protected abstract registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void>;

  protected abstract registerTools(toolsManager: ToolsManager): Promise<void>;

  protected async loadMCP(ai: AIManager): Promise<void> {
    if (!this.mcpDirectory) return;
    await new MCPLoader(ai, {
      scan: {
        basePath: this.mcpDirectory,
        pattern: ['*.ts', '*.js', '!*.d.ts'],
      },
      logger: this.logger,
    }).load();
  }

  protected async loadSkills(ai: AIManager): Promise<void> {
    for (const { directory, source, optional } of this.skillsDirectories) {
      if (!fs.existsSync(directory)) {
        this.logger?.[optional ? 'debug' : 'warn']?.(
          { directory, source, stage: 'skills' },
          'AI Skill directory does not exist; skipping',
        );
        continue;
      }
      await new SkillsLoader(ai, {
        scan: {
          basePath: directory,
          pattern: ['**/SKILL.md'],
        },
        logger: this.logger,
      }).load();
      this.logger?.debug?.(
        { directory, source, stage: 'skills' },
        'AI Skill directory loaded',
      );
    }
  }

  private logStage(stage: string, resources: readonly unknown[]): void {
    this.logger?.debug?.(
      { total: resources.length, stage },
      `AI ${stage} registration completed`,
    );
  }
}

/** Built-in Employee and Tool registration for the AI Employee plugin. */
export class AIEmployeeResources extends AIResourceRegistrar {
  public constructor(options: AIResourceRegistrarOptions = {}) {
    super({
      ...options,
      skillsDirectories: [
        {
          directory: resolvePackageRootSkillDirectory(),
          source: 'plugin-built-in',
        },
        ...(options.skillsDirectories ?? []),
      ],
    });
  }

  protected override async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    for (const employee of employees) {
      await aiEmployeeManager.registerEmployee(employee);
    }
  }

  protected override async registerTools(
    toolsManager: ToolsManager,
  ): Promise<void> {
    for (const tool of tools) {
      await toolsManager.registerTools(
        tool as Parameters<ToolsManager['registerTools']>[0],
      );
    }
  }
}

export function normalizeAISkillDirectories(
  directories: readonly string[],
  appRoot: string,
): readonly string[] {
  return [
    ...new Set(
      directories
        .map((directory) => directory.trim())
        .filter(Boolean)
        .map((directory) =>
          path.isAbsolute(directory)
            ? directory
            : path.resolve(appRoot, directory),
        ),
    ),
  ];
}

function normalizeDirectories(
  directories: readonly (string | AISkillDirectory)[],
  source: string,
): readonly AISkillDirectory[] {
  const unique = new Map<string, AISkillDirectory>();
  for (const entry of directories) {
    const item =
      typeof entry === 'string' ? { directory: entry, source } : entry;
    const directory = path.resolve(item.directory);
    const previous = unique.get(directory);
    unique.set(directory, {
      ...item,
      directory,
      optional: previous
        ? Boolean(previous.optional && item.optional)
        : item.optional,
    });
  }
  return [...unique.values()];
}

function resolvePackageRootSkillDirectory(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (directory !== path.dirname(directory)) {
    const packageFile = path.join(directory, 'package.json');
    if (fs.existsSync(packageFile)) {
      try {
        const packageMetadata = JSON.parse(
          fs.readFileSync(packageFile, 'utf8'),
        ) as {
          name?: string;
        };
        const skillsDirectory = path.join(directory, 'ai', 'skills');
        // TypeScript can emit a copy of package.json into dist for JSON imports.
        // Prefer its copied runtime assets; fall back to root assets in published layouts.
        if (
          packageMetadata.name === '@nocobase/app-plugin-ai-employee' &&
          fs.existsSync(skillsDirectory)
        ) {
          return skillsDirectory;
        }
      } catch {
        // Continue toward the package root when an intermediate manifest is invalid.
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error('Cannot resolve the AI Employee plugin package root');
}
