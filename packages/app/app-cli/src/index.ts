import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';
import type { AppCommandContext } from './context.js';
import { AppCommand } from './context.js';
import { createDefaultCommandContext } from './default-context.js';
import Info from './commands/info.js';
import Migrate from './commands/migrate.js';
import Seed from './commands/seed.js';
import Collections from './commands/collections-generate.js';
import I18n from './commands/i18n-check.js';
import Upload from './commands/upload.js';
import Deploy from './commands/deploy.js';
export type { AppCommandContext, AppCommandRuntime } from './context.js';
export interface AppCommandsOptions {
  readonly rootDir: string;
  readonly loadRuntime?: AppCommandContext['loadRuntime'];
  readonly createApp?: AppCommandContext['createApp'];
  readonly publishing?: boolean;
}
export function createAppCommands(options: AppCommandsOptions): AppCliCommands {
  const context = createDefaultCommandContext(options);
  const commands: Record<string, typeof AppCommand> = {
    info: Info,
    migrate: Migrate,
    seed: Seed,
    'collections:generate': Collections,
    'i18n:check': I18n,
    ...(options.publishing ? { upload: Upload, deploy: Deploy } : {}),
  };
  return Object.fromEntries(
    Object.entries(commands).map(([name, CommandType]) => {
      class BoundCommand extends CommandType {
        static override appContext: AppCommandContext = context;
      }
      return [name, BoundCommand];
    }),
  );
}
