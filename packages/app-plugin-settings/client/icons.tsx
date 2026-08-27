import {
  Bell,
  BookOpenText,
  Database,
  FolderCog,
  KeyRound,
  Settings2,
  ShieldCheck,
  UserRoundCog,
  Workflow,
} from 'lucide-react';
import type { ReactElement } from 'react';

import type { AppSettingsModuleIcon } from './registry.js';

export interface AppSettingsModuleIconViewProps {
  readonly className?: string;
  icon: AppSettingsModuleIcon;
}

export function AppSettingsModuleIconView({
  className,
  icon,
}: AppSettingsModuleIconViewProps): ReactElement {
  if (icon === 'bell') return <Bell className={className} />;
  if (icon === 'book-open') return <BookOpenText className={className} />;
  if (icon === 'database') return <Database className={className} />;
  if (icon === 'folder') return <FolderCog className={className} />;
  if (icon === 'key') return <KeyRound className={className} />;
  if (icon === 'settings') return <Settings2 className={className} />;
  if (icon === 'shield') return <ShieldCheck className={className} />;
  if (icon === 'users') return <UserRoundCog className={className} />;
  return <Workflow className={className} />;
}
