import type { MailFolder } from '../mail-client.js';

export interface MailDefaultFolderNames {
  readonly inbox: string;
  readonly sent: string;
  readonly drafts: string;
  readonly trash: string;
  readonly junk: string;
  readonly archive: string;
}

const DEFAULT_FOLDER_DEFINITIONS = [
  {
    type: 'inbox',
    providerFolderId: '__nocobase_default_inbox__',
    key: 'inbox',
  },
  { type: 'sent', providerFolderId: '__nocobase_default_sent__', key: 'sent' },
  {
    type: 'drafts',
    providerFolderId: '__nocobase_local_drafts__',
    key: 'drafts',
  },
  {
    type: 'trash',
    providerFolderId: '__nocobase_default_trash__',
    key: 'trash',
  },
  { type: 'junk', providerFolderId: '__nocobase_default_junk__', key: 'junk' },
  {
    type: 'archive',
    providerFolderId: '__nocobase_default_archive__',
    key: 'archive',
  },
] as const;

/** Returns the stable display order used when a Provider omits one or more standard folders. */
export function mergeMailFolders(
  accountId: string,
  folders: readonly MailFolder[],
  names: MailDefaultFolderNames,
): readonly MailFolder[] {
  const standardFolders = DEFAULT_FOLDER_DEFINITIONS.map((definition) => {
    const existing = folders.find((folder) => folder.type === definition.type);
    if (existing) return existing;
    return {
      id: `${accountId}:${definition.providerFolderId}`,
      accountId,
      providerFolderId: definition.providerFolderId,
      type: definition.type,
      name: names[definition.key],
      kind: 'folder' as const,
    };
  });
  const customFolders = folders.filter((folder) => folder.type === 'custom');
  return [...standardFolders, ...customFolders];
}
