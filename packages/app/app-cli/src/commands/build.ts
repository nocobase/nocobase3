import type { Command } from '@oclif/core';

import type { AppTool } from '../tools/run-tool.ts';
import { ToolCommand, type ToolCommandOptions } from '../lib/tool-command.ts';

export default class Build extends ToolCommand {
  static override summary =
    'Build the client, server, CLI and production dependencies into dist/.';
  static override description = `Runs the registered plugins' build hooks at their stages.

Options are passed to the build:
  --target <target>       Deployment platform, such as linux-x64 or linux-arm64-musl (default: current).
  --node-version <major>  Target Node major for an explicit platform target (default: 24).
  --tar                   Also create storage/exports/dist.tar.gz after a successful build.

build retarget and build verify rerun those two steps on a dist/ that is already built.`;
  static override examples: Command.Example[] = [
    '<%= config.bin %> build',
    '<%= config.bin %> build --target linux-x64 --node-version 24 --tar',
  ];

  protected readonly tool: AppTool = 'build';
  protected override readonly toolOptions: ToolCommandOptions = {
    hooks: true,
  };
}
