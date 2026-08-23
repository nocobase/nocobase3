import type { QueryAdapter, Row } from '@nocobase/database';
import type { WorkflowFlatIr } from '../workflow-source/core.js';

import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import type { WorkflowId } from './types.js';
import { asId, hydrateWorkflow, serializeJson } from './utils.js';
import { retainCompatibleWorkflowInputValues } from './workflow-inputs.js';

export interface MaterializedWorkflowSource {
  key: string;
  hash: string;
  filePath: string;
  ir: WorkflowFlatIr;
}
export interface WorkflowSourceMaterializeResult {
  action: 'created' | 'unchanged';
  workflowId: WorkflowId;
}

function nextVersion(rows: readonly Row[]): string {
  const highest = rows.reduce((maximum, row) => {
    const match = /^(?:version-)?(\d+)$/.exec(String(row.version ?? ''));
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0);
  return `version-${highest + 1}`;
}

export async function materializeWorkflowSource(
  loaded: MaterializedWorkflowSource,
  query: QueryAdapter,
): Promise<WorkflowSourceMaterializeResult> {
  const revisions = await query
    .selectFrom(WORKFLOW_COLLECTIONS.workflows)
    .selectAll()
    .where('key', '=', loaded.key)
    .orderBy('id', 'desc')
    .execute<Row>();
  const unchanged = revisions.find((row) => row.hash === loaded.hash);
  if (unchanged) return { action: 'unchanged', workflowId: asId(unchanged.id) };
  const currentRow = revisions.find((row) => Boolean(row.current));
  const current = currentRow ? hydrateWorkflow(currentRow) : null;
  const inputSchema = loaded.ir.inputs ?? {};
  const inheritedInputValues = retainCompatibleWorkflowInputValues(
    inputSchema,
    current?.inputValues,
  );
  await query
    .insertInto(WORKFLOW_COLLECTIONS.workflows)
    .values({
      key: loaded.key,
      hash: loaded.hash,
      version: nextVersion(revisions),
      title: loaded.ir.title,
      description: loaded.ir.description ?? null,
      options: serializeJson(loaded.ir.options ?? {}),
      contextSchema: serializeJson(loaded.ir.contextSchema),
      inputSchema: serializeJson(inputSchema),
      inputValues: serializeJson(inheritedInputValues),
      enabled: false,
      current: null,
    })
    .execute();
  const inserted = await query
    .selectFrom(WORKFLOW_COLLECTIONS.workflows)
    .select('id')
    .where('key', '=', loaded.key)
    .where('hash', '=', loaded.hash)
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow<Row>();
  const workflowId = asId(inserted.id);
  if (loaded.ir.nodes.length) {
    await query
      .insertInto(WORKFLOW_COLLECTIONS.nodes)
      .values(
        loaded.ir.nodes.map((node) => ({
          workflowId,
          key: node.key,
          title: node.title ?? null,
          description: node.description ?? null,
          type: node.type,
          config: serializeJson(node.config),
          ...(node.options === undefined
            ? {}
            : { options: serializeJson(node.options) }),
          upstreamKey: node.upstreamKey,
          downstreamKey: node.downstreamKey,
          branchKey: node.branchKey,
        })),
      )
      .execute();
  }
  return { action: 'created', workflowId };
}

export async function activateWorkflowSource(
  query: QueryAdapter,
  workflowId: WorkflowId,
): Promise<void> {
  const selected = await query
    .selectFrom(WORKFLOW_COLLECTIONS.workflows)
    .selectAll()
    .where('id', '=', workflowId)
    .executeTakeFirstOrThrow<Row>();
  const previous = await query
    .selectFrom(WORKFLOW_COLLECTIONS.workflows)
    .selectAll()
    .where('key', '=', String(selected.key))
    .where('current', '=', true)
    .executeTakeFirst<Row>();
  const inheritedEnabled = previous ? Boolean(previous.enabled) : false;
  if (previous && previous.id !== selected.id) {
    await query
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ current: null })
      .where('id', '=', previous.id)
      .execute();
  }
  await query
    .updateTable(WORKFLOW_COLLECTIONS.workflows)
    .set({ current: true, enabled: inheritedEnabled })
    .where('id', '=', workflowId)
    .execute();
}
