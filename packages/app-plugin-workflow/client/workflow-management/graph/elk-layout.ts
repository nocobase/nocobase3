import * as ElkModule from 'elkjs/lib/elk.bundled.js';
import type { ELK, ELKConstructorArguments } from 'elkjs/lib/elk-api.js';
import type {
  WorkflowLayoutInput,
  WorkflowLayoutResult,
} from '@nocobase/app-plugin-workflow/client';

type ElkConstructor = new (args?: ELKConstructorArguments) => ELK;

function normalizeElkConstructor(
  imported: ElkConstructor | { default: ElkConstructor },
): ElkConstructor {
  return typeof imported === 'function' ? imported : imported.default;
}

const elk = new (normalizeElkConstructor(ElkModule.default))();
export async function layoutWithElk(
  input: WorkflowLayoutInput,
): Promise<WorkflowLayoutResult> {
  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': input.direction,
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '104',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children: input.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
    edges: input.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });
  return {
    positions: (result.children ?? []).map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: node.y ?? 0,
    })),
  };
}
