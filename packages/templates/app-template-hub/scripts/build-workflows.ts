import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildApplicationWorkflows,
  type ApplicationWorkflowBuildOptions,
  type ApplicationWorkflowBuildSummary,
} from '@nocobase/app-plugin-workflow/build';

export { buildApplicationWorkflows };
export type {
  ApplicationWorkflowBuildOptions as WorkflowBuildOptions,
  ApplicationWorkflowBuildSummary as WorkflowBuildSummary,
};

async function main(): Promise<void> {
  const appRoot: string = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const sourceRoot: string =
    readOption('--source-root') ?? path.join(appRoot, 'server', 'workflows');
  const distRoot: string =
    readOption('--dist-root') ??
    path.join(appRoot, 'dist', 'server', 'workflows');
  const resourceRoot: string | undefined = readOption('--resource-root');
  const result = await buildApplicationWorkflows({
    sourceRoot,
    distRoot,
    ...(resourceRoot === undefined ? {} : { resourceRoot }),
  });
  console.log(
    `[workflow-build] generated ${result.packages} Artifact(s) in ${distRoot}`,
  );
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
  await main();
