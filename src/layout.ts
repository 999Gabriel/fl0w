import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { AnalysisResult } from "./analyzer";
import { KIND_META } from "./analyzer";
import type { ProjectResult } from "./project";
import type { LevelGraph } from "./graph-levels";

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

// ---------------------------------------------------------------------------
// project-level layout: same dagre LR layout, but nodes carry their file and a
// per-file accent color, and cross-file edges are drawn thicker / darker.
// ---------------------------------------------------------------------------
const FILE_PALETTE = [
  "#0a0a0a", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444",
  "#14b8a6", "#ec4899", "#0ea5e9", "#22c55e", "#8b5cf6",
  "#f97316", "#06b6d4", "#d946ef", "#65a30d", "#e11d48",
];

export function fileColorMap(files: string[]): Map<string, string> {
  const m = new Map<string, string>();
  files.forEach((f, i) => m.set(f, FILE_PALETTE[i % FILE_PALETTE.length]));
  return m;
}

// folder color map — same palette, keyed by folder path
export function folderColorMap(folders: string[]): Map<string, string> {
  const m = new Map<string, string>();
  folders.forEach((f, i) => m.set(f, FILE_PALETTE[i % FILE_PALETTE.length]));
  return m;
}

export function buildProjectFlow(
  result: ProjectResult,
  colors: Map<string, string>
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of result.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of result.edges) g.setEdge(e.from, e.to);

  dagre.layout(g);

  const nodeFile = new Map(result.nodes.map((n) => [n.id, n.file]));
  const fileName = (p: string) => p.split("/").pop() ?? p;

  const nodes: Node[] = result.nodes.map((n, idx) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: "code",
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
      data: {
        label: n.label,
        kind: n.kind,
        meta: n.meta,
        calls: n.calls,
        calledBy: n.calledBy,
        file: fileName(n.file),
        filePath: n.file,
        fileColor: colors.get(n.file) ?? "#0a0a0a",
      },
      width: NODE_W,
      height: NODE_H,
      style: { animationDelay: `${Math.min(idx, 24) * 24}ms` },
    };
  });

  const edges: Edge[] = result.edges.map((e) => {
    const cross = nodeFile.get(e.from) !== nodeFile.get(e.to);
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      className:
        (e.kind === "uses" ? "edge-uses" : "edge-call") + (cross ? " edge-cross" : ""),
      style: {
        stroke: cross ? "#0a0a0a" : "#9a9a9a",
        strokeWidth: cross ? 2.4 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: cross ? "#0a0a0a" : "#9a9a9a",
        width: 13,
        height: 13,
      },
      data: { kind: e.kind, cross },
    };
  });

  return { nodes, edges };
}

export { KIND_META };

// ===========================================================================
// LEVEL graph layout (folder / file overview). Node size scales with weight,
// edge thickness scales with aggregated import count. Sized-up sizing helps
// big hubs stand out so large projects stay readable.
// ===========================================================================
const LV_W = 200;
const LV_H = 60;

export function buildLevelFlow(
  graph: LevelGraph,
  colors: Map<string, string>
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: graph.nodes.length > 120 ? 18 : 34,
    ranksep: graph.nodes.length > 120 ? 70 : 100,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const maxW = Math.max(1, ...graph.nodes.map((n) => n.weight));
  const sizeFor = (w: number) => {
    const t = Math.sqrt(w / maxW); // sublinear so huge folders don't dominate
    return { width: Math.round(LV_W * (0.8 + t * 0.6)), height: LV_H };
  };

  for (const n of graph.nodes) {
    const s = sizeFor(n.weight);
    g.setNode(n.id, { width: s.width, height: s.height });
  }
  for (const e of graph.edges) g.setEdge(e.from, e.to);
  dagre.layout(g);

  const maxEW = Math.max(1, ...graph.edges.map((e) => e.weight));

  const nodes: Node[] = graph.nodes.map((n, idx) => {
    const pos = g.node(n.id);
    const s = sizeFor(n.weight);
    return {
      id: n.id,
      type: "level",
      position: { x: (pos?.x ?? 0) - s.width / 2, y: (pos?.y ?? 0) - s.height / 2 },
      data: {
        label: n.label,
        path: n.path,
        kind: n.kind,
        weight: n.weight,
        fanIn: n.fanIn,
        fanOut: n.fanOut,
        color: colors.get(n.path) ?? "#0a0a0a",
      },
      width: s.width,
      height: s.height,
      style: { animationDelay: `${Math.min(idx, 30) * 18}ms` },
    };
  });

  const edges: Edge[] = graph.edges.map((e) => {
    const t = e.weight / maxEW;
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      className: "edge-call edge-cross",
      style: { stroke: "#0a0a0a", strokeWidth: 1.2 + t * 3.2, opacity: 0.5 + t * 0.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#0a0a0a", width: 12, height: 12 },
      data: { weight: e.weight },
    };
  });

  return { nodes, edges };
}
