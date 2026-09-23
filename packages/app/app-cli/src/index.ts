import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';
import type { AppCommandContext } from './context.js';
import { AppCommand } from './context.js';
import { createDefaultCommandContext } from './default-context.js';
import Info from './commands/info.js';
import ConfigCheck from './commands/config-check.js';
import ConfigInit from './commands/config-init.js';
import ConfigSet from './commands/config-set.js';
import DbApply from './commands/db-apply.js';
import DbReset from './commands/db-reset.js';
import DbRepair from './commands/db-repair.js';
import DbRollback from './commands/db-rollback.js';
import DbRedo from './commands/db-redo.js';
import DbUnlock from './commands/db-unlock.js';
import DbDoctor from './commands/db-doctor.js';
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
    'config:init': ConfigInit,
    'config:check': ConfigCheck,
    'config:set': ConfigSet,
    'db:apply': DbApply,
    'db:reset': DbReset,
    'db:repair': DbRepair,
    'db:rollback': DbRollback,
    'db:redo': DbRedo,
    'db:unlock': DbUnlock,
    'db:doctor': DbDoctor,
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
