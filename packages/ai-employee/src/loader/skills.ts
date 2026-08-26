/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  DirectoryScanner,
  DirectoryScannerOptions,
  FileDescriptor,
} from './scanner.js';
import { readFile } from 'fs/promises';
import _ from 'lodash';
import { existsSync } from 'fs';
import { AIManager } from '../manager/index.js';
import { LoadAndRegister } from './types.js';
import type { RuntimeLogger } from '../runtime/logger.js';
import matter from 'gray-matter';
import path from 'path';
import type { SkillsScope } from '../repository/ai-skill.js';

export type SkillsLoaderOptions = {
  scan: DirectoryScannerOptions;
  logger?: RuntimeLogger;
};
export class SkillsLoader extends LoadAndRegister<SkillsLoaderOptions> {
  protected readonly scanner: DirectoryScanner;

  protected files: FileDescriptor[] = [];
  protected skillsDescriptors: SkillsDescriptor[] = [];
  protected logger: RuntimeLogger;

  constructor(
    protected readonly ai: AIManager,
    protected readonly options: SkillsLoaderOptions,
  ) {
    super(ai, options);
    this.logger = options.logger;
    this.scanner = new DirectoryScanner(this.options.scan);
  }

  protected async scan(): Promise<void> {
    this.files = await this.scanner.scan();
  }

  protected async import(): Promise<void> {
    if (!this.files.length) {
      return;
    }

    this.skillsDescriptors = await Promise.all(
      this.files
        .map(async (skillsFile) => {
          if (skillsFile.basename !== 'SKILLS.md') {
            return null;
          }
          if (!existsSync(skillsFile.path)) {
            this.logger?.error(
              `skills [${skillsFile.directory}] ignored: can not find SKILLS.md at ${skillsFile.path}`,
            );
            return null;
          }
          const skillsDir = new FileDescriptor(path.dirname(skillsFile.path));
          const name = skillsFile.directory;
          const entry: Partial<SkillsDescriptor> = {
            name,
            skillsFile,
            skillsDir,
          };
          try {
            const skills = await readFile(skillsFile.path, 'utf-8');
            const { data, content } = matter(skills);
            entry.scope = data['scope'] ?? 'SPECIFIED';
            entry.name = data['name'];
            entry.description = data['description'];
            entry.content = content;
            entry.introduction = data['introduction'];
            entry.tools = data['tools'] ?? [];
          } catch (e) {
            this.logger?.error(
              { error: e },
              `skills [${name}] load fail: error occur when reading SKILLS.md at ${skillsFile.path}`,
            );
            return null;
          }

          try {
            const toolsScanner = new DirectoryScanner({
              basePath: skillsDir.path,
              pattern: ['tools/**/*.ts', 'tools/**/*.js', '!tools/**/*.d.ts'],
            });
            const toolsFiles = await toolsScanner.scan();
            entry.tools = Array.from(
              new Set([
                ...entry.tools,
                ...toolsFiles.map((it) =>
                  it.basename === 'index.ts' || it.basename === 'index.js'
                    ? it.directory
                    : it.name,
                ),
              ]),
            );
          } catch (e) {
            this.logger?.error(
              { error: e },
              `skills [${name}] load fail: error occur when loading tools at ${skillsDir.path}`,
            );
            return null;
          }

          return entry as SkillsDescriptor;
        })
        .filter((it) => it != null),
    );
  }

  protected async register(): Promise<void> {
    if (!this.skillsDescriptors.length) {
      return;
    }
    const { skillsManager } = this.ai;
    for (const descriptor of this.skillsDescriptors) {
      await skillsManager.registerSkills({
        scope: descriptor.scope,
        name: descriptor.name,
        description: descriptor.description,
        content: descriptor.content,
        tools: descriptor.tools,
        introduction: descriptor.introduction,
      });
    }
  }
}

export type SkillsDescriptor = {
  scope: SkillsScope;
  name: string;
  description: string;
  content: string;
  skillsFile: FileDescriptor;
  skillsDir: FileDescriptor;
  tools?: string[];
  introduction?: {
    title: string;
    about?: string;
  };
};
