import type { AppTool } from '../../tools/run-tool.ts';
import { ToolCommand } from '../../lib/tool-command.ts';

export default class DistCheck extends ToolCommand {
  static override summary =
    'Check that every package the server, database and CLI code imports is installed in dist/.';
  static override description =
    'Fails, naming the package, when an import would not resolve on a deployed server. `nocobase build` runs this as its last step.';

  protected readonly tool: AppTool = 'verify';
}
