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

import type { MailAccountView, MailFolder, MailLabel } from '../mail-client.js';
import { cn } from '../lib/utils.js';
import { MailLabelColorDot } from './mail-label-tag.js';
import { NativeSelect } from './ui/native-select.js';

export type MailboxSmartView = 'all' | 'unread' | 'starred';

export interface MailboxSidebarLabels {
  readonly account: string;
  readonly allAccounts: string;
  readonly allMail: string;
  readonly unread: string;
  readonly starred: string;
  readonly folders: string;
  readonly labels: string;
}

export interface MailboxSidebarProps {
  readonly accounts: readonly MailAccountView[];
  readonly accountId: string;
  readonly folderId?: string;
  readonly folders: readonly MailFolder[];
  readonly labelId?: string;
  readonly customLabels: readonly MailLabel[];
  readonly labels: MailboxSidebarLabels;
  readonly onAccountChange: (accountId: string) => void;
  readonly onFolderChange: (folderId?: string) => void;
  readonly onLabelChange: (labelId?: string) => void;
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
  labelId,
  customLabels,
  labels,
  onAccountChange,
  onFolderChange,
  onLabelChange,
  onSmartViewChange,
  smartView,
}: MailboxSidebarProps): ReactElement {
  const orderedFolders = [
    ...folders.filter((folder) => folder.type === 'inbox'),
    ...folders.filter((folder) => folder.type === 'sent'),
    ...folders.filter(
      (folder) => folder.type !== 'inbox' && folder.type !== 'sent',
    ),
  ];

  return (
    <aside className='flex h-full min-h-0 flex-col overflow-y-auto border-b bg-muted/20 p-3 lg:border-r lg:border-b-0'>
      <label className='text-xs font-medium text-muted-foreground'>
        {labels.account}
        <NativeSelect
          className='mt-1 bg-background'
          onChange={(event) => onAccountChange(event.target.value)}
          value={accountId}
        >
          <option value=''>{labels.allAccounts}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.address}
            </option>
          ))}
        </NativeSelect>
      </label>

      <nav aria-label={labels.folders} className='mt-4 space-y-1'>
        <SidebarButton
          active={!folderId && !labelId && smartView === 'all'}
          icon={Inbox}
          label={labels.allMail}
          onClick={() => {
            onFolderChange(undefined);
            onLabelChange(undefined);
            onSmartViewChange('all');
          }}
        />
        <SidebarButton
          active={!folderId && !labelId && smartView === 'unread'}
          icon={MailOpen}
          label={labels.unread}
          onClick={() => {
            onFolderChange(undefined);
            onLabelChange(undefined);
            onSmartViewChange('unread');
          }}
        />
        <SidebarButton
          active={!folderId && !labelId && smartView === 'starred'}
          icon={Star}
          label={labels.starred}
          onClick={() => {
            onFolderChange(undefined);
            onLabelChange(undefined);
            onSmartViewChange('starred');
          }}
        />
      </nav>

      {accountId ? (
        <>
          <p className='mt-6 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
            {labels.folders}
          </p>
          <nav aria-label={labels.folders} className='mt-2 space-y-1'>
            {orderedFolders.map((folder) => {
              const Icon = folderIcons[folder.type];
              return (
                <SidebarButton
                  active={!labelId && folderId === folder.providerFolderId}
                  count={folder.unreadCount}
                  icon={Icon}
                  key={folder.id}
                  label={folder.name}
                  onClick={() => {
                    onSmartViewChange('all');
                    onFolderChange(folder.providerFolderId);
                    onLabelChange(undefined);
                  }}
                />
              );
            })}
          </nav>
        </>
      ) : null}
      {customLabels.length > 0 ? (
        <>
          <p className='mt-6 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
            {labels.labels}
          </p>
          <nav aria-label={labels.labels} className='mt-2 space-y-1'>
            {customLabels.map((label) => (
              <SidebarButton
                active={labelId === label.id}
                color={label.color}
                key={label.id}
                label={label.name}
                onClick={() => {
                  onSmartViewChange('all');
                  onFolderChange(undefined);
                  onLabelChange(label.id);
                }}
              />
            ))}
          </nav>
        </>
      ) : null}
    </aside>
  );
}

interface SidebarButtonProps {
  readonly active: boolean;
  readonly count?: number;
  readonly color?: MailLabel['color'];
  readonly icon?: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
}

function SidebarButton({
  active,
  count,
  color,
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
      {color ? (
        <MailLabelColorDot color={color} />
      ) : Icon ? (
        <Icon aria-hidden='true' className='size-4 shrink-0' />
      ) : null}
      <span className='min-w-0 flex-1 truncate'>{label}</span>
      {count ? (
        <span className='text-xs tabular-nums text-muted-foreground'>
          {count}
        </span>
      ) : null}
    </button>
  );
}
