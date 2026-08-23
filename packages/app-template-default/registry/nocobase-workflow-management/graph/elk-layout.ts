import ELK from 'elkjs/lib/elk.bundled.js';
import type {
  WorkflowLayoutInput,
  WorkflowLayoutResult,
} from '@nocobase/app-plugin-workflow/client';

const elk = new ELK();
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
