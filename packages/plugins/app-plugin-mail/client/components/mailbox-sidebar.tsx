import {
  Archive,
  FileText,
  Folder,
  Inbox,
  MailOpen,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import type { MailAccountView, MailFolder } from '../mail-client.js';
import { cn } from '../lib/utils.js';
import { NativeSelect } from './ui/native-select.js';

export type MailboxSmartView = 'all' | 'unread' | 'starred';

export interface MailboxSidebarLabels {
  readonly account: string;
  readonly allMail: string;
  readonly unread: string;
  readonly starred: string;
  readonly folders: string;
}

export interface MailboxSidebarProps {
  readonly accounts: readonly MailAccountView[];
  readonly accountId: string;
  readonly folderId?: string;
  readonly folders: readonly MailFolder[];
  readonly labels: MailboxSidebarLabels;
  readonly onAccountChange: (accountId: string) => void;
  readonly onFolderChange: (folderId?: string) => void;
  readonly onSmartViewChange: (view: MailboxSmartView) => void;
  readonly smartView: MailboxSmartView;
}

const folderIcons: Readonly<Record<MailFolder['type'], LucideIcon>> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  junk: ShieldAlert,
  archive: Archive,
  custom: Folder,
};

export function MailboxSidebar({
  accounts,
  accountId,
  folderId,
  folders,
  labels,
  onAccountChange,
  onFolderChange,
  onSmartViewChange,
  smartView,
}: MailboxSidebarProps): ReactElement {
  return (
    <aside className='flex min-h-0 flex-col border-b bg-muted/20 p-3 lg:border-r lg:border-b-0'>
      <label className='text-xs font-medium text-muted-foreground'>
        {labels.account}
        <NativeSelect
          className='mt-1 bg-background'
          onChange={(event) => onAccountChange(event.target.value)}
          value={accountId}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.address}
            </option>
          ))}
        </NativeSelect>
      </label>

      <nav aria-label={labels.folders} className='mt-4 space-y-1'>
        <SidebarButton
          active={!folderId && smartView === 'all'}
          icon={Inbox}
          label={labels.allMail}
          onClick={() => {
            onFolderChange(undefined);
            onSmartViewChange('all');
          }}
        />
        <SidebarButton
          active={!folderId && smartView === 'unread'}
          icon={MailOpen}
          label={labels.unread}
          onClick={() => {
            onFolderChange(undefined);
            onSmartViewChange('unread');
          }}
        />
        <SidebarButton
          active={!folderId && smartView === 'starred'}
          icon={Star}
          label={labels.starred}
          onClick={() => {
            onFolderChange(undefined);
            onSmartViewChange('starred');
          }}
        />
      </nav>

      <p className='mt-6 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        {labels.folders}
      </p>
      <nav
        aria-label={labels.folders}
        className='mt-2 min-h-0 space-y-1 overflow-y-auto'
      >
        {folders.map((folder) => {
          const Icon = folderIcons[folder.type];
          return (
            <SidebarButton
              active={folderId === folder.providerFolderId}
              count={folder.unreadCount}
              icon={Icon}
              key={folder.id}
              label={folder.name}
              onClick={() => {
                onSmartViewChange('all');
                onFolderChange(folder.providerFolderId);
              }}
            />
          );
        })}
      </nav>
    </aside>
  );
}

interface SidebarButtonProps {
  readonly active: boolean;
  readonly count?: number;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
}

function SidebarButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: SidebarButtonProps): ReactElement {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-muted',
        active && 'bg-primary/10 font-medium text-primary hover:bg-primary/15',
      )}
      onClick={onClick}
      type='button'
    >
      <Icon aria-hidden='true' className='size-4 shrink-0' />
      <span className='min-w-0 flex-1 truncate'>{label}</span>
      {count ? (
        <span className='text-xs tabular-nums text-muted-foreground'>
          {count}
        </span>
      ) : null}
    </button>
  );
}
