import type { AppTool } from '../tools/run-tool.ts';
import { ToolCommand, type ToolCommandOptions } from '../lib/tool-command.ts';

export default class Dev extends ToolCommand {
  static override summary =
    'Start the development server and restart it when sources or configuration change.';
  static override description =
    "Runs the registered plugins' beforeDev hooks first. `.env` and `.env.local` changes restart every development process, including Vite; `config.yml` changes restart only the server.";

  protected readonly tool: AppTool = 'dev';
  // The development processes load the application's TypeScript, so they run under its `tsx`.
  protected override readonly toolOptions: ToolCommandOptions = {
    hooks: true,
    execArgv: ['--import', 'tsx', ...process.execArgv],
  };
}
