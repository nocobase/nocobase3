import type { AppTool } from '../tools/run-tool.ts';
import { ToolCommand } from '../lib/tool-command.ts';

export default class Start extends ToolCommand {
  static override summary = 'Start the built server from dist/.';
  static override description =
    'A shortcut for running dist/server/standalone.js from the source checkout. A deployment starts that file directly, without the CLI.';

  protected readonly tool: AppTool = 'start';
}
