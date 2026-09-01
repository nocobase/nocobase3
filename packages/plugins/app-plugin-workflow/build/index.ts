import fs from 'node:fs/promises';
import path from 'node:path';

import {
  coreInstructions,
  type WorkflowInstructionClass,
} from '../server/instructions/index.js';
import {
  buildWorkflowPackage,
  writeWorkflowArtifact,
} from '../server/loader/artifact-builder.js';

export {
  buildWorkflowArtifact,
  computeWorkflowArtifactDigest,
  writeWorkflowArtifact,
} from '../server/loader/artifact-builder.js';
export type {
  WorkflowArtifactBuildInput,
  WorkflowArtifactBuildResult,
  WorkflowArtifactDefinition,
  WorkflowArtifactDigestFile,
} from '../server/loader/artifact-builder.js';
export { checkWorkflowPackage } from '../server/loader/source-check.js';
export { WorkflowSourceCheckError } from '../server/loader/source-issues.js';
export type {
  WorkflowSourceIssue,
  WorkflowSourcePhase,
} from '../server/loader/source-issues.js';

export interface ApplicationWorkflowBuildSummary {
  packages: number;
  artifacts: readonly string[];
}

export interface ApplicationWorkflowBuildOptions {
  sourceRoot: string;
  distRoot: string;
  instructions?: ReadonlyMap<string, WorkflowInstructionClass>;
}

/** Build every workflow package in an application's workflow source root. */
export async function buildApplicationWorkflows(
  options: ApplicationWorkflowBuildOptions,
): Promise<ApplicationWorkflowBuildSummary> {
  const { sourceRoot, distRoot } = options;
  const entries = await readSourceRoot(sourceRoot);
  const packageNames: string[] = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (await exists(path.join(sourceRoot, entry.name, 'workflow.ts')))
    ) {
      packageNames.push(entry.name);
    }
  }

  await fs.mkdir(distRoot, { recursive: true });
  for (const entry of await fs.readdir(distRoot, { withFileTypes: true })) {
    await fs.rm(path.join(distRoot, entry.name), {
      recursive: true,
      force: true,
    });
  }

  const instructions: Map<string, WorkflowInstructionClass> = new Map(
    options.instructions ?? coreInstructions,
  );
  const artifacts: string[] = [];
  for (const packageName of packageNames.sort()) {
    const packageRoot = path.join(sourceRoot, packageName);
    try {
      const built = await buildWorkflowPackage(packageRoot, { instructions });
      artifacts.push(await writeWorkflowArtifact(built, distRoot));
    } catch (error) {
      throw new Error(
        `Workflow package "${packageName}" at "${packageRoot}" failed to build: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  return { packages: packageNames.length, artifacts };
}

async function readSourceRoot(
  sourceRoot: string,
): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
