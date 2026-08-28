/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context } from '../context.js';
import type { AIFileAttachment } from '@nocobase/ai-employee';
import type { DatabaseRepositoryFactory } from '../repository/index.js';

export type AttachmentId = string | number;

export type AttachmentSource = {
  collectionName?: string;
  field?: string;
  documentCache?: boolean;
  trustworthy?: boolean;
};

type AttachmentLookup = {
  id: AttachmentId;
  source: AttachmentSource;
};

const AI_FILES_ATTACHMENT_SOURCE = {
  collectionName: 'aiFiles',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function appendSourceToAttachmentRecord(record: unknown) {
  if (!isRecord(record)) {
    return;
  }
  const meta = {
    ...(isRecord(record.meta) ? record.meta : {}),
    source: AI_FILES_ATTACHMENT_SOURCE,
  };
  record.meta = meta;
}

export function appendAIFileAttachmentSource(body: unknown) {
  if (!isRecord(body)) {
    return;
  }
  if (body.data) {
    appendSourceToAttachmentRecord(body.data);
    return;
  }
  appendSourceToAttachmentRecord(body);
}

export function getAttachmentId(attachment: unknown): AttachmentId | null {
  if (!isRecord(attachment)) {
    return null;
  }
  const id = attachment.id;
  if (typeof id === 'string' || typeof id === 'number') {
    return id;
  }
  return null;
}

export function shouldSkipAttachmentSourceLookup(
  source: AttachmentSource | null,
) {
  return source?.trustworthy === true;
}

export function getAttachmentSource(
  attachment: unknown,
): AttachmentSource | null {
  if (!isRecord(attachment) || !isRecord(attachment.source)) {
    return null;
  }
  const { collectionName, field, documentCache, trustworthy } =
    attachment.source;
  const source = {
    ...(typeof collectionName === 'string' && collectionName
      ? { collectionName }
      : {}),
    ...(typeof field === 'string' ? { field } : {}),
    ...(typeof documentCache === 'boolean' ? { documentCache } : {}),
    ...(trustworthy === true ? { trustworthy } : {}),
  };
  if (!source.trustworthy && !source.collectionName) {
    return null;
  }
  return source;
}

function getLookupKey(lookup: AttachmentLookup) {
  return `${lookup.source.collectionName}:${lookup.id}`;
}

function isValidFileCollectionSource(lookup: AttachmentLookup): boolean {
  const collectionName = lookup.source.collectionName;
  if (!collectionName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(collectionName)) {
    return false;
  }
  return collectionName === 'aiFiles' || Boolean(lookup.source.field);
}

async function findSourceAttachments(
  ctx: Context<DatabaseRepositoryFactory>,
  lookups: AttachmentLookup[],
) {
  const attachmentsByLookup = new Map<string, AIFileAttachment>();
  const groups = new Map<string, AttachmentLookup[]>();
  for (const lookup of lookups) {
    const groupKey = lookup.source.collectionName;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), lookup]);
  }

  for (const [collectionName, groupLookups] of groups.entries()) {
    const validLookups = groupLookups.filter(isValidFileCollectionSource);
    if (!validLookups.length) {
      continue;
    }

    const filter: Record<string, unknown> = {
      id: {
        $in: [...new Set(validLookups.map((lookup) => lookup.id))],
      },
    };
    if (collectionName === 'aiFiles') {
      filter.createdById = ctx.auth.user.id;
    }

    const records = await ctx.repositories
      .collectionRepository<AIFileAttachment>(collectionName)
      .find({ filter });
    for (const attachment of records) {
      attachmentsByLookup.set(`${collectionName}:${attachment.id}`, attachment);
    }
  }

  return attachmentsByLookup;
}

export async function findMessageAttachments(
  ctx: Context,
  attachments: unknown[],
) {
  const lookups: AttachmentLookup[] = [];
  for (const attachment of attachments) {
    const source = getAttachmentSource(attachment);
    if (!source || shouldSkipAttachmentSourceLookup(source)) {
      continue;
    }
    const id = getAttachmentId(attachment);
    if (id == null) {
      continue;
    }
    lookups.push({
      id,
      source,
    });
  }

  return findSourceAttachments(ctx, lookups);
}

export function getMessageAttachmentLookupKey(attachment: unknown) {
  const source = getAttachmentSource(attachment);
  if (!source || shouldSkipAttachmentSourceLookup(source)) {
    return null;
  }
  const id = getAttachmentId(attachment);
  if (id == null) {
    return null;
  }
  return getLookupKey({
    id,
    source,
  });
}
