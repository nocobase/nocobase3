import type { AppTool } from '../../tools/run-tool.ts';
import { ToolCommand } from '../../lib/tool-command.ts';

export default class BuildVerify extends ToolCommand {
  static override summary =
    'Fail when server code imports a package dist/package.json does not declare.';

  protected readonly tool: AppTool = 'verify';
}
