import { describe, expect, it } from 'vitest';
import { compileToFlatIr, defineNode, defineTrigger, defineWorkflow, restoreFromFlatIr, type NodeFactory } from '../src/workflow-source/core.js';

const leaf: NodeFactory<'leaf', { value: string }> = defineNode({ type: 'leaf', branches: null, validateConfig: () => [] });
const branch: NodeFactory<'branch', { enabled: boolean }, 'yes' | 'no'> = defineNode({ type: 'branch', branches: ['yes', 'no'], validateConfig: () => [] });
const manual = defineTrigger({ type: 'manual', validateConfig: () => [] });

describe('workflow source authoring', () => {
  it('builds an immutable canonical AST and omits empty branches', () => {
    const original = branch({ key: 'choose', config: { enabled: true } });
    const expression = original.branch({ no: [], yes: [leaf({ key: 'inside', config: { value: 'branch' } })] });
    const ast = defineWorkflow({ title: 'Example', trigger: manual({ config: {} }), nodes: [expression, leaf({ key: 'after', config: { value: 'common' } })] });
    expect(Object.hasOwn(original, 'branches')).toBe(false);
    expect(ast.nodes[0].branches).toEqual({ yes: [{ key: 'inside', type: 'leaf', config: { value: 'branch' } }] });
  });

  it('compiles tree blocks to deterministic flat IR without mutating the AST', () => {
    const ast = defineWorkflow({ title: 'Example', trigger: manual({ config: {} }), nodes: [branch({ key: 'choose', config: { enabled: true } }).branch({ yes: [leaf({ key: 'inside', config: { value: 'x' } })] }), leaf({ key: 'after', config: { value: 'y' } })] });
    const before = JSON.stringify(ast);
    expect(compileToFlatIr(ast).nodes).toEqual([
      { key: 'choose', type: 'branch', config: { enabled: true }, upstreamKey: null, downstreamKey: 'after', branchKey: null },
      { key: 'inside', type: 'leaf', config: { value: 'x' }, upstreamKey: 'choose', downstreamKey: null, branchKey: 'yes' },
      { key: 'after', type: 'leaf', config: { value: 'y' }, upstreamKey: 'choose', downstreamKey: null, branchKey: null },
    ]);
    expect(JSON.stringify(ast)).toBe(before);
    expect(restoreFromFlatIr(compileToFlatIr(ast))).toEqual(ast);
  });

  it.each([new Date(), new Map(), { bad: () => true }])('rejects non-JSON config %#', (bad) => {
    expect(() => defineWorkflow({ title: 'Bad', trigger: manual({ config: {} }), nodes: [leaf({ key: 'bad', config: { value: bad } as never })] })).toThrow(/JSON-compatible|class instances/);
  });

  it('rejects duplicate keys while compiling', () => {
    const ast = defineWorkflow({ title: 'Bad', trigger: manual({ config: {} }), nodes: [leaf({ key: 'same', config: { value: 'a' } }), leaf({ key: 'same', config: { value: 'b' } })] });
    expect(() => compileToFlatIr(ast)).toThrow('Duplicate workflow node key');
  });
});
