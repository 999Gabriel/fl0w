import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { AnalysisResult } from "./analyzer";
import { KIND_META } from "./analyzer";

const NODE_W = 190;
const NODE_H = 56;

export function buildFlow(result: AnalysisResult): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 92, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of result.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of result.edges) g.setEdge(e.from, e.to);

  dagre.layout(g);

  const nodes: Node[] = result.nodes.map((n, idx) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "code",
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
      data: { label: n.label, kind: n.kind, meta: n.meta, calls: n.calls, calledBy: n.calledBy },
      width: NODE_W,
      height: NODE_H,
      style: { animationDelay: `${Math.min(idx, 24) * 28}ms` },
    };
  });

  const edges: Edge[] = result.edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    className: e.kind === "uses" ? "edge-uses" : "edge-call",
    style: { stroke: "#0a0a0a", strokeWidth: 1.6 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#0a0a0a", width: 13, height: 13 },
    data: { kind: e.kind },
  }));

  return { nodes, edges };
}

export { KIND_META };
