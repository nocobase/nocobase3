import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkflowPackage, coreInstructions, writeWorkflowArtifact, type WorkflowInstructionClass } from '@nocobase/workflow';

export interface WorkflowBuildSummary { packages: number; artifacts: readonly string[]; }
export interface WorkflowBuildOptions { sourceRoot: string; distRoot: string; }

export async function buildApplicationWorkflows(options: WorkflowBuildOptions): Promise<WorkflowBuildSummary> {
  const { sourceRoot, distRoot } = options;
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const packageNames: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && await exists(path.join(sourceRoot, entry.name, 'workflow.ts'))) packageNames.push(entry.name);
  }
  await fs.mkdir(distRoot, { recursive: true });
  for (const entry of await fs.readdir(distRoot, { withFileTypes: true })) {
    await fs.rm(path.join(distRoot, entry.name), { recursive: true, force: true });
  }
  const instructions: Map<string, WorkflowInstructionClass> = new Map(coreInstructions);
  const artifacts: string[] = [];
  for (const packageName of packageNames.sort()) {
    try {
      const built = await buildWorkflowPackage(path.join(sourceRoot, packageName), { instructions });
      artifacts.push(await writeWorkflowArtifact(built, distRoot));
    } catch (error) {
      throw new Error(`Workflow package "${packageName}" at "${path.join(sourceRoot, packageName)}" failed to build: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  return { packages: packageNames.length, artifacts };
}

async function exists(target: string): Promise<boolean> { try { await fs.access(target); return true; } catch { return false; } }

async function main(): Promise<void> {
  const appRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourceRoot: string = readOption('--source-root') ?? path.join(appRoot, 'server', 'workflows');
  const distRoot: string = readOption('--dist-root') ?? path.join(appRoot, 'dist', 'server', 'workflows');
  const result = await buildApplicationWorkflows({ sourceRoot, distRoot });
  console.log(`[workflow-build] generated ${result.packages} Artifact(s) in ${distRoot}`);
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) await main();
