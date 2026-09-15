import type { ListResponse } from 'imapflow';

import type { NormalizedMailFolder } from '@nocobase/app-plugin-mail/server/types';

export function folderType(
  mailbox: ListResponse,
): NormalizedMailFolder['type'] {
  const specialUse = mailbox.specialUse?.toLowerCase();
  if (specialUse === '\\inbox' || mailbox.path.toLowerCase() === 'inbox')
    return 'inbox';
  if (specialUse === '\\sent') return 'sent';
  if (specialUse === '\\drafts') return 'drafts';
  if (specialUse === '\\trash') return 'trash';
  if (specialUse === '\\junk') return 'junk';
  if (specialUse === '\\archive') return 'archive';
  return 'custom';
}

export function folderTypeFromPath(path: string): NormalizedMailFolder['type'] {
  const normalized = path.toLowerCase();
  if (normalized === 'inbox') return 'inbox';
  if (normalized.includes('draft')) return 'drafts';
  return 'custom';
}
