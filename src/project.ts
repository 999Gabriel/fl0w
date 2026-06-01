// ===========================================================================
// project.ts — multi-file / whole-project analysis
//
// Runs every source file through the existing single-file analyzers, namespaces
// each file's nodes by its path, then resolves cross-file imports so that a call
// to an imported symbol links through to the real definition in another file.
//
// Emits the SAME { nodes, edges } shape as the single-file analyzer (plus a
// `file` field per node), so layout.ts and the UI stay shared.
// ===========================================================================
import {
  analyze,
  detectLang,
  type AnalysisResult,
  type GraphEdge,
  type GraphNode,
  type ImportRef,
  type Lang,
} from "./analyzer";

export interface ProjectFile {
  path: string; // repo-relative path, e.g. "src/api/user.ts"
  content: string;
}

export interface ProjectNode extends GraphNode {
  file: string; // which file this node belongs to
}

export interface ProjectResult {
  nodes: ProjectNode[];
  edges: GraphEdge[];
  files: { path: string; lang: Lang; nodes: number; error?: string }[];
  /** number of edges that cross a file boundary */
  crossFileEdges: number;
  error?: string;
}

// File extensions we attempt to analyze. Everything else is ignored.
const CODE_EXT = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue",
  "py", "java", "c", "h", "cpp", "cc", "hpp", "cs", "dart", "ino",
  "html", "htm",
]);

// Directories we never descend into.
const IGNORE_DIR = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "vendor", "venv", ".venv", "__pycache__", ".cache", "coverage",
  "target", "bin", "obj", ".idea", ".vscode",
]);

export function isCodeFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CODE_EXT.has(ext);
}

export function isIgnoredPath(path: string): boolean {
  return path.split("/").some((seg) => IGNORE_DIR.has(seg));
}

export function shouldAnalyze(path: string): boolean {
  return isCodeFile(path) && !isIgnoredPath(path);
}

const MAX_FILES = 120;
const MAX_TOTAL_NODES = 700;

const nsId = (file: string, id: string) => `${file}\u241F${id}`;

// ---------------------------------------------------------------------------
// import path resolution: resolve a module specifier from an importing file
// to one of the project's actual file paths.
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

function resolveImport(
  fromPath: string,
  source: string,
  fileSet: Set<string>
): string | null {
  // only resolve relative imports (./ ../) — bare specifiers are external pkgs
  const isRelative = source.startsWith(".");
  const baseDir = fromPath.split("/").slice(0, -1);
  let target: string[];
  if (isRelative) {
    target = normalize([...baseDir, ...source.split("/")]);
  } else {
    // try a couple of project-root / alias-ish resolutions for non-relative
    const stripped = source.replace(/^(@\/|~\/|src\/|@app\/)/, "");
    target = normalize(stripped.split("/"));
  }
  const joined = target.join("/");

  const candidates = [
    joined,
    `${joined}.ts`, `${joined}.tsx`, `${joined}.js`, `${joined}.jsx`,
    `${joined}.mjs`, `${joined}.cjs`, `${joined}.vue`,
    `${joined}.py`, `${joined}.dart`, `${joined}.cs`, `${joined}.java`,
    `${joined}.h`, `${joined}.hpp`, `${joined}.c`, `${joined}.cpp`,
    `${joined}/index.ts`, `${joined}/index.tsx`, `${joined}/index.js`, `${joined}/index.jsx`,
    `${joined}/__init__.py`,
  ];
  for (const c of candidates) if (fileSet.has(c)) return c;

  // last resort: a unique basename match (handles Python `from pkg.mod import x`)
  const base = target[target.length - 1];
  if (base) {
    const matches = [...fileSet].filter((f) => {
      const fb = f.split("/").pop()!.replace(/\.[^.]+$/, "");
      return fb === base;
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-file export table: label -> namespaced node id of a definition that the
// file exposes. For JS we trust analyzer `exports`; for other languages we
// expose all top-level functions/classes (heuristic — no real module system).
// ---------------------------------------------------------------------------
function buildExportTable(file: string, res: AnalysisResult): Map<string, string> {
  const table = new Map<string, string>();
  const exported = res.exports && res.exports.length ? new Set(res.exports) : null;
  let defaultId: string | null = null;

  for (const n of res.nodes) {
    if (n.kind !== "function" && n.kind !== "method" && n.kind !== "class") continue;
    const nid = nsId(file, n.id);
    // class methods are exposed under both "Class.method" and "method"
    const short = n.label.includes(".") ? n.label.split(".").pop()! : n.label;
    const expose = !exported || exported.has(n.label) || exported.has(short);
    if (expose) {
      if (!table.has(n.label)) table.set(n.label, nid);
      if (!table.has(short)) table.set(short, nid);
    }
    if (defaultId == null && (n.kind === "function" || n.kind === "class")) defaultId = nid;
  }
  if (exported?.has("default") && defaultId) table.set("default", defaultId);
  return table;
}

// ===========================================================================
// main entry
// ===========================================================================
export function analyzeProject(files: ProjectFile[]): ProjectResult {
  const usable = files
    .filter((f) => shouldAnalyze(f.path) && f.content.trim())
    .slice(0, MAX_FILES);

  if (usable.length === 0) {
    return {
      nodes: [],
      edges: [],
      files: [],
      crossFileEdges: 0,
      error: "Keine analysierbaren Quelldateien gefunden",
    };
  }

  const fileSet = new Set(usable.map((f) => f.path));
  const allNodes: ProjectNode[] = [];
  const allEdges: GraphEdge[] = [];
  const fileMeta: ProjectResult["files"] = [];
  const exportTables = new Map<string, Map<string, string>>();
  const fileImports = new Map<string, ImportRef[]>();
  // importLocalNodeId: per file, label of an import binding -> its namespaced node id
  const importBindings = new Map<string, Map<string, string>>();

  // ---- pass 1: analyze each file, namespace nodes/edges ----
  for (const f of usable) {
    if (allNodes.length >= MAX_TOTAL_NODES) break;
    const lang = detectLang(f.content);
    let res: AnalysisResult;
    try {
      res = analyze(f.content, lang);
    } catch (e: any) {
      fileMeta.push({ path: f.path, lang, nodes: 0, error: e?.message ?? "Analysefehler" });
      continue;
    }
    fileMeta.push({ path: f.path, lang: res.lang, nodes: res.nodes.length, error: res.error });

    const localImports = new Map<string, string>();
    for (const n of res.nodes) {
      const pn: ProjectNode = { ...n, id: nsId(f.path, n.id), file: f.path };
      allNodes.push(pn);
      if (n.kind === "import") localImports.set(n.label, pn.id);
    }
    for (const e of res.edges) {
      allEdges.push({
        id: nsId(f.path, e.id),
        from: nsId(f.path, e.from),
        to: nsId(f.path, e.to),
        kind: e.kind,
      });
    }

    exportTables.set(f.path, buildExportTable(f.path, res));
    importBindings.set(f.path, localImports);

    // imports: prefer analyzer-provided (JS); else derive from import nodes
    if (res.imports && res.imports.length) {
      fileImports.set(f.path, res.imports);
    } else {
      const derived: ImportRef[] = res.nodes
        .filter((n) => n.kind === "import")
        .map((n) => ({ local: n.label, imported: n.label, source: n.meta ?? "" }));
      fileImports.set(f.path, derived);
    }
  }

  // ---- pass 2: resolve cross-file imports ----
  // For each import binding, link the local "import" node to the real exported
  // definition in the target file. Because in-file calls already point at the
  // local import node, this stitches calls across the file boundary.
  let crossFileEdges = 0;
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));

  for (const f of usable) {
    const imports = fileImports.get(f.path) ?? [];
    const localImports = importBindings.get(f.path) ?? new Map();
    for (const imp of imports) {
      if (!imp.source || !imp.source.startsWith(".")) {
        // also allow alias roots handled by resolveImport
        if (!/^(@\/|~\/|src\/|@app\/)/.test(imp.source)) continue;
      }
      const targetFile = resolveImport(f.path, imp.source, fileSet);
      if (!targetFile || targetFile === f.path) continue;
      const table = exportTables.get(targetFile);
      if (!table) continue;

      const wanted = imp.imported ?? imp.local;
      let targetId =
        table.get(wanted) ??
        table.get(imp.local) ??
        (imp.imported === "default" || !imp.imported ? table.get("default") : undefined);
      if (!targetId) continue;

      const localNodeId = localImports.get(imp.local);
      if (localNodeId && nodeById.has(targetId)) {
        // re-point the import placeholder at the real definition
        const eid = `${localNodeId}\u2192${targetId}:xcall`;
        if (!allEdges.find((e) => e.id === eid)) {
          allEdges.push({ id: eid, from: localNodeId, to: targetId, kind: "call" });
          crossFileEdges++;
          // recolor the local import node so it reads as a cross-file link
          const ln = nodeById.get(localNodeId);
          if (ln) ln.meta = `→ ${targetFile.split("/").pop()}`;
        }
      }
    }
  }

  // recompute call counts across the merged graph
  for (const n of allNodes) {
    n.calls = 0;
    n.calledBy = 0;
  }
  for (const e of allEdges) {
    if (e.kind !== "call") continue;
    const f = nodeById.get(e.from);
    const t = nodeById.get(e.to);
    if (f) f.calls++;
    if (t) t.calledBy++;
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    files: fileMeta,
    crossFileEdges,
  };
}

// the namespacing separator, exported so layout/UI can split file vs local id
export const NS_SEP = "\u241F";
