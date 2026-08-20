import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseManager, type DatabaseManager, type Row } from '@nocobase/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionInstruction, createWorkflowCollections, loadWorkflow, resolveWorkflowInput, WORKFLOW_COLLECTIONS, WorkflowRuntime, WorkflowSourceLoader, type WorkflowInstruction } from '../src/index.js';
import { createTraceInstruction } from './fixtures/instructions.js';

const dslImport = fileURLToPath(new URL('../src/workflow-source/index.ts', import.meta.url));
const triggerImport = fileURLToPath(new URL('../src/workflow-source/triggers/index.ts', import.meta.url));

function workflowSource(title: string, defaultValue: number = 100): string {
  return `import { defineWorkflow, condition, run } from ${JSON.stringify(dslImport)};
import { custom } from ${JSON.stringify(triggerImport)};
export default defineWorkflow({ title: ${JSON.stringify(title)},
  inputs: { limit: { type: 'number', default: 100 }, threshold: { type: 'number', default: ${defaultValue} }, flag: { type: 'boolean', default: true }, label: { type: 'string', default: 'default' } },
  trigger: custom({ config: {} }), nodes: [
    condition({ key: 'condition', config: { calculation: { calculator: 'gt', operands: ['{{$input.limit}}', 0] } } }).branch({ yes: [run({ key: 'branchAction', config: { script: './server/action.ts' } })], no: [] }),
    run({ key: 'finalAction', config: { script: './server/final.ts' } }),
  ] });`;
}

async function writeSource(rootPath: string, key: string, source: string): Promise<void> {
  const packagePath = path.join(rootPath, key);
  await fs.mkdir(packagePath, { recursive: true });
  await fs.writeFile(path.join(packagePath, 'workflow.ts'), source);
}

describe('workflow TypeScript source loader', () => {
  let database: DatabaseManager;
  let rootPath: string;
  let loader: WorkflowSourceLoader;

  beforeEach(async () => {
    database = createDatabaseManager({ connections: { main: { dialect: 'sqlite', filename: ':memory:' } } });
    await createWorkflowCollections(database.builder());
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nocobase3-workflow-source-'));
    const instruction: WorkflowInstruction = { async run() { return { status: 1 }; }, validateConfig: () => null };
    loader = new WorkflowSourceLoader({ database, autoActivate: true, instructions: new Map([['condition', instruction], ['run', instruction]]), triggers: new Map([['custom', { validateConfig: () => null }]]) });
  });

  afterEach(async () => { await database.destroy(); await fs.rm(rootPath, { recursive: true, force: true }); });

  it('loads a one-level workflow.ts package and materializes tree topology', async () => {
    await writeSource(rootPath, 'quotation', workflowSource('Quotation'));
    await expect(loader.load(rootPath)).resolves.toEqual({ created: 1, replaced: 0 });
    const workflow = await database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows).selectAll().where('key', '=', 'quotation').executeTakeFirstOrThrow<Row>();
    expect(workflow).toMatchObject({ version: 'version-1', title: 'Quotation', current: 1 });
    const nodes = await database.query().selectFrom(WORKFLOW_COLLECTIONS.nodes).select(['key', 'upstreamKey', 'downstreamKey', 'branchKey']).where('workflowId', '=', workflow.id).orderBy('id').execute<Row>();
    expect(nodes).toEqual([
      { key: 'condition', upstreamKey: null, downstreamKey: 'finalAction', branchKey: null },
      { key: 'branchAction', upstreamKey: 'condition', downstreamKey: null, branchKey: 'yes' },
      { key: 'finalAction', upstreamKey: 'condition', downstreamKey: null, branchKey: null },
    ]);

    const definition = await loadWorkflow(database.query(), String(workflow.id));
    const trace: string[] = [];
    const runtime = new WorkflowRuntime({
      database,
      instructions: new Map([['condition', conditionInstruction], ['run', createTraceInstruction(trace)]]),
      timeoutReaper: false,
    });
    await runtime.start();
    if (!definition) throw new Error('Expected the materialized workflow definition');
    await runtime.trigger(definition, {}, { manually: true, eventKey: 'dsl-integration' });
    await runtime.stop();
    expect(trace).toEqual(['branchAction', 'finalAction']);
  });

  it('registers without deactivating current, preserves falsey overrides, and activates explicitly', async () => {
    await writeSource(rootPath, 'quotation', workflowSource('V1'));
    await loader.load(rootPath);
    const first = await database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows).selectAll().where('key', '=', 'quotation').executeTakeFirstOrThrow<Row>();
    await database.query().updateTable(WORKFLOW_COLLECTIONS.workflows).set({ enabled: true, inputValues: JSON.stringify({ limit: 0, flag: false, label: '' }) }).where('id', '=', first.id).execute();
    const instruction: WorkflowInstruction = { async run() { return { status: 1 }; }, validateConfig: () => null };
    loader = new WorkflowSourceLoader({
      database,
      instructions: new Map([['condition', instruction], ['run', instruction]]),
      triggers: new Map([['custom', { validateConfig: () => null }]]),
    });
    await writeSource(rootPath, 'quotation', workflowSource('V2', 200));
    await loader.load(rootPath);
    const revisions = await database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows).selectAll().where('key', '=', 'quotation').orderBy('id').execute<Row>();
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({ current: 1, enabled: 1 });
    expect(revisions[1]).toMatchObject({ current: null, enabled: 0, inputValues: JSON.stringify({ limit: 0, flag: false, label: '' }) });
    const second = await loadWorkflow(database.query(), String(revisions[1].id));
    expect(resolveWorkflowInput(second?.inputSchema, second?.inputValues)).toEqual({ limit: 0, threshold: 200, flag: false, label: '' });
    await loader.activate(String(revisions[1].id));
    const activated = await database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows).selectAll().where('id', '=', revisions[1].id).executeTakeFirstOrThrow<Row>();
    expect(activated).toMatchObject({ current: 1, enabled: 1 });
  });

  it('stores no DSL defaults when there are no administrator overrides', async () => {
    await writeSource(rootPath, 'quotation', workflowSource('Defaults'));
    await loader.load(rootPath);
    await expect(database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows).where('key', '=', 'quotation').value('inputValues')).resolves.toBe('{}');
  });

  it('reports undeclared input references with structured semantic diagnostics', async () => {
    await writeSource(rootPath, 'bad', workflowSource('Bad').replace('$input.limit', '$input.missing'));
    await expect(loader.load(rootPath)).rejects.toMatchObject({ issues: [expect.objectContaining({ phase: 'semantic', code: 'INVALID_INPUT_REFERENCE', file: expect.stringContaining('workflow.ts'), nodeKey: 'condition', contractType: 'condition' })] });
  });
});
