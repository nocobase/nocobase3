import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseManager } from '@nocobase/database';
import type { WorkflowFlatIr } from '../instructions/definition.js';

import { compileWorkflowSource } from './source-compiler.js';
import { WorkflowSourceCheckError } from './source-issues.js';
import {
  activateWorkflowSource,
  materializeWorkflowSource,
} from './source-materializer.js';
import { parseWorkflowSource } from './source-parser.js';
import type { WorkflowId, WorkflowInstructionClass } from '../engine/types.js';
import { validateWorkflowSourceAst } from './source-validator.js';

export interface WorkflowSourceLoaderOptions {
  database: DatabaseManager;
  connectionName?: string;
  instructions: Map<string, WorkflowInstructionClass>;
  defaultRootPath?: string;
  autoActivate?: boolean;
  onWorkflowUpdated?: (workflowId: WorkflowId) => void | Promise<void>;
}

export interface WorkflowSourceLoadResult {
  created: number;
  replaced: number;
}

export class WorkflowSourceError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(`${filePath}: ${message}`);
    this.name = 'WorkflowSourceError';
  }
}

/** Compatibility export. Single-source publishing now mints revisions instead of conflicting. */
export class WorkflowSourceConflictError extends WorkflowSourceError {}

interface LoadedSource {
  key: string;
  hash: string;
  filePath: string;
  ir: WorkflowFlatIr;
}

export default class WorkflowSourceLoader {
  private loading?: Promise<WorkflowSourceLoadResult>;

  constructor(private readonly options: WorkflowSourceLoaderOptions) {}

  get defaultRootPath(): string {
    return (
      this.options.defaultRootPath ??
      path.join(process.env.STORAGE_PATH ?? process.cwd(), 'workflows')
    );
  }

  async load(
    rootPath: string = this.defaultRootPath,
  ): Promise<WorkflowSourceLoadResult> {
    if (this.loading) return this.loading;
    const loading = this.performLoad(rootPath);
    this.loading = loading;
    try {
      return await loading;
    } finally {
      if (this.loading === loading) this.loading = undefined;
    }
  }

  async activate(workflowId: WorkflowId): Promise<void> {
    await this.options.database.transaction(
      async (connection) =>
        activateWorkflowSource(connection.query, workflowId),
      this.options.connectionName,
    );
    await this.options.onWorkflowUpdated?.(workflowId);
  }

  private async performLoad(
    rootPath: string,
  ): Promise<WorkflowSourceLoadResult> {
    const sources = await this.readSources(rootPath);
    const updated: WorkflowId[] = [];
    const result = await this.options.database.transaction(
      async (connection) => {
        let created = 0;
        for (const source of sources) {
          const materialized = await materializeWorkflowSource(
            source,
            connection.query,
          );
          if (materialized.action === 'created') {
            created += 1;
            updated.push(materialized.workflowId);
            if (this.options.autoActivate === true)
              await activateWorkflowSource(
                connection.query,
                materialized.workflowId,
              );
          }
        }
        return { created, replaced: 0 };
      },
      this.options.connectionName,
    );
    for (const workflowId of updated)
      await this.options.onWorkflowUpdated?.(workflowId);
    return result;
  }

  private async readSources(rootPath: string): Promise<LoadedSource[]> {
    let directories;
    try {
      directories = await fs.readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const sources: LoadedSource[] = [];
    for (const directory of directories
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const packagePath = path.join(rootPath, directory.name);
      const filePath = await resolveWorkflowEntry(packagePath);
      const parsed = await parseWorkflowSource(filePath);
      const issues = validateWorkflowSourceAst(parsed.ast, filePath, {
        instructions: this.options.instructions,
      });
      if (issues.length) throw new WorkflowSourceCheckError(issues);
      sources.push({
        key: directory.name,
        hash: createHash('sha256').update(parsed.bundle).digest('hex'),
        filePath,
        ir: compileWorkflowSource(parsed.ast, filePath, {
          instructions: this.options.instructions,
        }),
      });
    }
    return sources;
  }
}

async function resolveWorkflowEntry(packagePath: string): Promise<string> {
  for (const name of ['workflow.ts', 'workflow.js']) {
    const filePath = path.join(packagePath, name);
    try {
      await fs.access(filePath);
      return filePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new WorkflowSourceError(
    'workflow.ts or compiled workflow.js is required in every workflow package',
    path.join(packagePath, 'workflow.ts'),
  );
}
