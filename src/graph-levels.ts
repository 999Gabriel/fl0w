// ===========================================================================
// graph-levels.ts — scalable, multi-resolution project graphs
//
// VERY large projects (10k+ files) cannot be drawn symbol-by-symbol — the
// browser dies. So we offer three zoom levels, all bounded:
//
//   FOLDER  — one node per directory, edges = aggregated imports between dirs
//   FILE    — one node per file,      edges = file -> file imports
//   SYMBOL  — the detailed per-symbol graph (only for a small drilled scope)
//
// FOLDER/FILE graphs are built from a cheap regex import scan (no AST), so they
// stay fast even on a 16k-file monorepo. SYMBOL detail reuses analyzeProject()
// but only on a bounded scope (one folder / one file), never the whole repo.
// ===========================================================================
import type { ProjectFile } from "./project";
import { shouldAnalyze } from "./project";

export type GraphLevel = "folder" | "file" | "symbol";

export interface LevelNode {
  id: string;
  label: string;
  kind: "folder" | "file";
  path: string; // folder path or file path
  weight: number; // size signal (files in folder, or symbols/loc in file)
  fanIn: number; // incoming dependency count
  fanOut: number; // outgoing dependency count
}

export interface LevelEdge {
  id: string;
  from: string;
  to: string;
  weight: number; // number of underlying imports aggregated into this edge
}

export interface LevelGraph {
  level: GraphLevel;
  nodes: LevelNode[];
  edges: LevelEdge[];
  truncated: boolean; // true if we capped the rendered node set
  totalNodes: number; // before any cap
  totalEdges: number;
}

// Hard render ceiling so React Flow is never handed an unbounded graph.
export const RENDER_CAP = 300;

// ---------------------------------------------------------------------------
// cheap import extraction (regex only — no AST)
// ---------------------------------------------------------------------------
const IMPORT_RES: RegExp[] = [
  /import\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g, // ES import ... from "x"
  /import\s*\(\s*["']([^"']+)["']\s*\)/g, // dynamic import("x")
  /require\(\s*["']([^"']+)["']\s*\)/g, // require("x")
  /export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g, // re-export
  /from\s+([.\w]+)\s+import\s+/g, // python: from x import y
  /^\s*import\s+([.\w]+)/gm, // python: import x
  /#\s*include\s*["<]([^">]+)[">]/g, // c/c++
];

function extractImports(content: string): string[] {
  const out: string[] = [];
  // only scan the head of huge files — imports live at the top
  const text = content.length > 60_000 ? content.slice(0, 60_000) : content;
  for (const re of IMPORT_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (m[1]) out.push(m[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// resolve a module specifier to a file path in the project (relative + aliases)
// ---------------------------------------------------------------------------
function normalize(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out;
}

const EXT_CANDIDATES = [
  "", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue",
  ".py", ".dart", ".cs", ".java", ".h", ".hpp", ".c", ".cpp",
  "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/__init__.py",
];

function resolveTo(
  fromPath: string,
  source: string,
  fileSet: Set<string>,
  basenameIndex: Map<string, string[]>
): string | null {
  const isRelative = source.startsWith(".");
  let target: string[];
  if (isRelative) {
    const baseDir = fromPath.split("/").slice(0, -1);
    target = normalize([...baseDir, ...source.split("/")]);
  } else {
    const stripped = source.replace(/^(@\/|~\/|@app\/|@\w+\/)/, "");
    target = normalize(stripped.split(/[\/.]/));
  }
  const joined = target.join("/");
  for (const ext of EXT_CANDIDATES) if (fileSet.has(joined + ext)) return joined + ext;

  // python "pkg.mod" / unique-basename fallback
  const base = target[target.length - 1];
  if (base) {
    const matches = basenameIndex.get(base);
    if (matches && matches.length === 1) return matches[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// build the file-level dependency graph (the source of truth for aggregation)
// ---------------------------------------------------------------------------
interface FileDep {
  files: string[];
  edges: { from: string; to: string }[];
  loc: Map<string, number>;
}

function buildFileDeps(files: ProjectFile[]): FileDep {
  const usable = files.filter((f) => shouldAnalyze(f.path));
  const fileSet = new Set(usable.map((f) => f.path));
  const basenameIndex = new Map<string, string[]>();
  for (const f of usable) {
    const b = f.path.split("/").pop()!.replace(/\.[^.]+$/, "");
    (basenameIndex.get(b) ?? basenameIndex.set(b, []).get(b)!).push(f.path);
  }

  const edgeSet = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  const loc = new Map<string, number>();

  for (const f of usable) {
    loc.set(f.path, f.content.split("\n").length);
    const specs = extractImports(f.content);
    for (const s of specs) {
      const target = resolveTo(f.path, s, fileSet, basenameIndex);
      if (!target || target === f.path) continue;
      const key = f.path + "\u0000" + target;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: f.path, to: target });
    }
  }
  return { files: usable.map((f) => f.path), edges, loc };
}

// ---------------------------------------------------------------------------
// degree-based pruning: keep the most-connected nodes when over the cap
// ---------------------------------------------------------------------------
function prune<T extends { id: string; fanIn: number; fanOut: number }>(
  nodes: T[],
  edges: LevelEdge[],
  cap: number
): { nodes: T[]; edges: LevelEdge[]; truncated: boolean } {
  if (nodes.length <= cap) return { nodes, edges, truncated: false };
  const ranked = [...nodes].sort(
    (a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut)
  );
  const keep = new Set(ranked.slice(0, cap).map((n) => n.id));
  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// FILE graph
// ---------------------------------------------------------------------------
export function buildFileGraph(files: ProjectFile[], cap = RENDER_CAP): LevelGraph {
  const dep = buildFileDeps(files);
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const e of dep.edges) {
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  }
  let nodes: LevelNode[] = dep.files.map((p) => ({
    id: p,
    label: p.split("/").pop() ?? p,
    kind: "file",
    path: p,
    weight: dep.loc.get(p) ?? 1,
    fanIn: fanIn.get(p) ?? 0,
    fanOut: fanOut.get(p) ?? 0,
  }));
  let edges: LevelEdge[] = dep.edges.map((e) => ({
    id: `${e.from}\u2192${e.to}`,
    from: e.from,
    to: e.to,
    weight: 1,
  }));
  const totalNodes = nodes.length;
  const totalEdges = edges.length;
  const pr = prune(nodes, edges, cap);
  return {
    level: "file",
    nodes: pr.nodes,
    edges: pr.edges,
    truncated: pr.truncated,
    totalNodes,
    totalEdges,
  };
}

// ---------------------------------------------------------------------------
// FOLDER graph — aggregate the file graph up to directories
//   depth controls how deep folders are grouped (e.g. depth 2 => "src/agents")
// ---------------------------------------------------------------------------
function folderOf(path: string, depth: number): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "(root)";
  return parts.slice(0, Math.min(depth, parts.length - 1)).join("/");
}

export function buildFolderGraph(
  files: ProjectFile[],
  depth = 2,
  cap = RENDER_CAP
): LevelGraph {
  const dep = buildFileDeps(files);
  const fileCount = new Map<string, number>();
  for (const f of dep.files) {
    const fo = folderOf(f, depth);
    fileCount.set(fo, (fileCount.get(fo) ?? 0) + 1);
  }

  const edgeWeights = new Map<string, number>();
  for (const e of dep.edges) {
    const a = folderOf(e.from, depth);
    const b = folderOf(e.to, depth);
    if (a === b) continue; // skip intra-folder imports at this level
    const key = a + "\u0000" + b;
    edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
  }

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  const edges: LevelEdge[] = [];
  for (const [key, w] of edgeWeights) {
    const [from, to] = key.split("\u0000");
    edges.push({ id: `${from}\u2192${to}`, from, to, weight: w });
    fanOut.set(from, (fanOut.get(from) ?? 0) + w);
    fanIn.set(to, (fanIn.get(to) ?? 0) + w);
  }

  const nodes: LevelNode[] = [...fileCount.entries()].map(([path, count]) => ({
    id: path,
    label: path === "(root)" ? "(root)" : path.split("/").pop() ?? path,
    kind: "folder",
    path,
    weight: count,
    fanIn: fanIn.get(path) ?? 0,
    fanOut: fanOut.get(path) ?? 0,
  }));

  const totalNodes = nodes.length;
  const totalEdges = edges.length;
  const pr = prune(nodes, edges, cap);
  return {
    level: "folder",
    nodes: pr.nodes,
    edges: pr.edges,
    truncated: pr.truncated,
    totalNodes,
    totalEdges,
  };
}

// list files under a folder prefix (for drill-down into SYMBOL level)
export function filesUnder(files: ProjectFile[], folderPath: string): ProjectFile[] {
  if (folderPath === "(root)")
    return files.filter((f) => shouldAnalyze(f.path) && !f.path.includes("/"));
  const pfx = folderPath.endsWith("/") ? folderPath : folderPath + "/";
  return files.filter((f) => shouldAnalyze(f.path) && f.path.startsWith(pfx));
}

// suggest a sensible default level given project size
export function suggestLevel(fileCount: number): GraphLevel {
  if (fileCount > 60) return "folder";
  if (fileCount > 12) return "file";
  return "symbol";
}
