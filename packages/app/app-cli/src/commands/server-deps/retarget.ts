import type { AppTool } from '../../tools/run-tool.ts';
import { ToolCommand } from '../../lib/tool-command.ts';

export default class ServerDepsRetarget extends ToolCommand {
  static override summary =
    'Reinstall the native modules in dist/ for another deployment platform.';
  static override description =
    'Takes the same --target and --node-version options as `nocobase build`.';

  protected readonly tool: AppTool = 'retarget';
}
