import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { KIND_META, type NodeKind } from "../analyzer";
import { analyzeProject, type ProjectFile, type ProjectResult } from "../project";
import {
  buildFileGraph,
  buildFolderGraph,
  filesUnder,
  suggestLevel,
  RENDER_CAP,
  type GraphLevel,
  type LevelGraph,
} from "../graph-levels";
import { buildProjectFlow, buildLevelFlow, fileColorMap, folderColorMap } from "../layout";
import CodeNode from "./CodeNode";
import LevelNode from "./LevelNode";
import { useI18n } from "../i18n";
import {
  fetchGitHubRepo,
  parsePastedProject,
  readFileList,
} from "../sources";

const nodeTypes = { code: CodeNode, level: LevelNode };

type Source = "github" | "folder" | "paste";

export default function ProjectView() {
  const { t } = useI18n();
  const [source, setSource] = useState<Source>("github");
  const [ghUrl, setGhUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [coverage, setCoverage] = useState<string>("");

  // navigation state
  const [level, setLevel] = useState<GraphLevel>("file");
  const [scope, setScope] = useState<string | null>(null); // folder/file path drilled into
  const [selected, setSelected] = useState<string | null>(null);

  const folderRef = useRef<HTMLInputElement>(null);

  // ---- load ----
  const run = useCallback((loaded: ProjectFile[]) => {
    const usable = loaded.filter((f) => f.content && f.content.trim());
    setFiles(usable);
    setSelected(null);
    setScope(null);
    if (usable.length === 0) {
      setError(t.no_sources_found);
      return;
    }
    setError("");
    setLevel(suggestLevel(usable.length));
  }, [t]);

  const onGitHub = useCallback(async () => {
    if (!ghUrl.trim()) return;
    setBusy(true);
    setError("");
    setCoverage("");
    setStatus("GitHub…");
    try {
      const res = await fetchGitHubRepo(ghUrl, setStatus);
      run(res.files);
      if (res.fetched < res.totalCandidates)
        setCoverage(`${res.fetched} / ${res.totalCandidates}`);
      setStatus("");
    } catch (e: any) {
      setError(e?.message ?? "GitHub error");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [ghUrl, run]);

  const onFolder = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      setBusy(true);
      setError("");
      setCoverage("");
      setStatus("…");
      try {
        run(await readFileList(list));
      } catch (e: any) {
        setError(e?.message ?? "read error");
      } finally {
        setBusy(false);
        setStatus("");
      }
    },
    [run]
  );

  const onPaste = useCallback(() => {
    const loaded = parsePastedProject(pasteText);
    if (loaded.length === 0) {
      setError(t.no_headers);
      return;
    }
    run(loaded);
  }, [pasteText, run, t]);

  // ---- the files currently in scope (whole project, or a drilled folder) ----
  const scopedFiles = useMemo(() => {
    if (!scope) return files;
    if (level === "symbol" && scope.includes(".")) {
      // single-file scope
      const one = files.find((f) => f.path === scope);
      return one ? [one] : files;
    }
    return filesUnder(files, scope);
  }, [files, scope, level]);

  // ---- folder / file level graphs (cheap import scan) ----
  const levelGraph: LevelGraph | null = useMemo(() => {
    if (files.length === 0) return null;
    if (level === "folder") return buildFolderGraph(files, 2, RENDER_CAP);
    if (level === "file") return buildFileGraph(scopedFiles, RENDER_CAP);
    return null;
  }, [files, scopedFiles, level]);

  // ---- symbol level graph (full analyze, bounded scope only) ----
  const symbolResult: ProjectResult | null = useMemo(() => {
    if (level !== "symbol") return null;
    if (scopedFiles.length === 0) return null;
    return analyzeProject(scopedFiles);
  }, [level, scopedFiles]);

  // ---- colors ----
  const colors = useMemo(() => {
    if (level === "folder")
      return folderColorMap(levelGraph ? levelGraph.nodes.map((n) => n.path) : []);
    return fileColorMap(
      level === "symbol"
        ? symbolResult?.files.map((f) => f.path) ?? []
        : levelGraph?.nodes.map((n) => n.path) ?? []
    );
  }, [level, levelGraph, symbolResult]);

  // ---- build react-flow graph for the active level ----
  const flow = useMemo(() => {
    if (level === "symbol")
      return symbolResult ? buildProjectFlow(symbolResult, colors) : { nodes: [], edges: [] };
    return levelGraph ? buildLevelFlow(levelGraph, colors) : { nodes: [], edges: [] };
  }, [level, symbolResult, levelGraph, colors]);

  // ---- selection highlight ----
  const edgeList = level === "symbol" ? symbolResult?.edges ?? [] : levelGraph?.edges ?? [];
  const neighbors = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of edgeList as any[]) {
      if (e.from === selected) set.add(e.to);
      if (e.to === selected) set.add(e.from);
    }
    return set;
  }, [selected, edgeList]);

  const nodes: Node[] = useMemo(
    () =>
      flow.nodes.map((n) => {
        const dim = neighbors && !neighbors.has(n.id);
        return { ...n, className: dim ? "dim" : neighbors?.has(n.id) ? "hl" : "" };
      }),
    [flow.nodes, neighbors]
  );

  const edges: Edge[] = useMemo(() => {
    if (!selected) return flow.edges;
    return flow.edges.map((e) => {
      const on = e.source === selected || e.target === selected;
      return { ...e, style: { ...e.style, opacity: on ? 1 : 0.07 } };
    });
  }, [flow.edges, selected]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelected((cur) => (cur === node.id ? null : node.id));
  }, []);

  // double-click → drill in one level
  const onNodeDoubleClick = useCallback(
    (_: unknown, node: Node) => {
      const path = (node.data as any).path as string | undefined;
      if (level === "folder" && path) {
        setScope(path);
        setLevel("file");
        setSelected(null);
      } else if (level === "file" && path) {
        setScope(path);
        setLevel("symbol");
        setSelected(null);
      }
    },
    [level]
  );

  const goLevel = useCallback((l: GraphLevel) => {
    setLevel(l);
    setSelected(null);
    if (l === "folder") setScope(null);
  }, []);

  const back = useCallback(() => {
    setSelected(null);
    if (level === "symbol") {
      setLevel("file");
      // keep folder scope if the symbol scope was a file inside it
      setScope((s) => (s && s.includes("/") ? s.split("/").slice(0, 2).join("/") : null));
    } else if (level === "file" && scope) {
      setLevel("folder");
      setScope(null);
    }
  }, [level, scope]);

  // ---- counts ----
  const counts = useMemo(() => {
    const c = {} as Record<NodeKind, number>;
    for (const k of Object.keys(KIND_META) as NodeKind[]) c[k] = 0;
    if (symbolResult) for (const n of symbolResult.nodes) c[n.kind]++;
    return c;
  }, [symbolResult]);

  const hasGraph = nodes.length > 0;
  const truncated = level !== "symbol" && levelGraph?.truncated;

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <span className="brand-mark" />
          <h1>
            fl0w<span className="caret">_</span>
          </h1>
        </header>
        <p className="hint">{t.project_hint}</p>

        {/* source picker */}
        <div className="src-tabs">
          {(["github", "folder", "paste"] as Source[]).map((s) => (
            <button
              key={s}
              className={`src-tab${source === s ? " active" : ""}`}
              onClick={() => setSource(s)}
            >
              {s === "github" ? t.src_github : s === "folder" ? t.src_folder : t.src_paste}
            </button>
          ))}
        </div>

        {source === "github" && (
          <div className="src-body">
            <input
              className="gh-input"
              placeholder={t.gh_placeholder}
              value={ghUrl}
              onChange={(e) => setGhUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onGitHub()}
              spellCheck={false}
            />
            <button className="btn" disabled={busy} onClick={onGitHub}>
              {busy ? t.loading : t.gh_analyze}
            </button>
            <span className="src-note">{t.gh_note}</span>
          </div>
        )}

        {source === "folder" && (
          <div className="src-body">
            <input
              ref={folderRef}
              type="file"
              // @ts-expect-error nonstandard but widely supported
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: "none" }}
              onChange={(e) => onFolder(e.target.files)}
            />
            <div
              className="dropzone"
              onClick={() => folderRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFolder(e.dataTransfer.files);
              }}
            >
              <span className="dz-mark" />
              {t.drop_hint}
            </div>
            <span className="src-note">{t.local_note}</span>
          </div>
        )}

        {source === "paste" && (
          <div className="src-body">
            <textarea
              className="editor paste-area"
              spellCheck={false}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"// ==== src/api.ts ====\nexport function get() {}\n\n// ==== src/app.ts ====\nimport { get } from './api';\nget();"}
            />
            <button className="btn" onClick={onPaste}>
              {t.analyze}
            </button>
          </div>
        )}

        {status && <div className="status-line">{status}</div>}
        {error && (
          <div className="error">
            <span className="error-dot" /> {error}
          </div>
        )}

        {files.length > 0 && (
          <>
            {/* level switch */}
            <div className="level-switch">
              <span className="level-label">{t.level_label}</span>
              <div className="level-tabs">
                {(["folder", "file", "symbol"] as GraphLevel[]).map((l) => (
                  <button
                    key={l}
                    className={`level-tab${level === l ? " active" : ""}`}
                    onClick={() => goLevel(l)}
                    disabled={l === "symbol" && !scope && files.length > 120}
                    title={
                      l === "symbol" && !scope && files.length > 120
                        ? t.drill_hint
                        : undefined
                    }
                  >
                    {l === "folder" ? t.level_folder : l === "file" ? t.level_file : t.level_symbol}
                  </button>
                ))}
              </div>
            </div>

            {scope && (
              <div className="scope-bar">
                <button className="btn ghost tiny" onClick={back}>
                  {t.back}
                </button>
                <span className="scope-path" title={scope}>
                  {t.scope}: {scope}
                </span>
              </div>
            )}

            <div className="stats">
              <div className="stat-row">
                <span>{t.files}</span>
                <b>{files.length}</b>
              </div>
              {coverage && (
                <div className="stat-row">
                  <span>{t.coverage}</span>
                  <b>{coverage}</b>
                </div>
              )}
              {level === "symbol" && symbolResult && (
                <>
                  <div className="stat-row">
                    <span>{t.nodes}</span>
                    <b>{symbolResult.nodes.length}</b>
                  </div>
                  <div className="stat-row">
                    <span>{t.crossfile}</span>
                    <b>{symbolResult.crossFileEdges}</b>
                  </div>
                </>
              )}
              {level !== "symbol" && levelGraph && (
                <>
                  <div className="stat-row">
                    <span>{level === "folder" ? t.level_folder : t.level_file}</span>
                    <b>{levelGraph.totalNodes}</b>
                  </div>
                  <div className="stat-row">
                    <span>{t.crossfile}</span>
                    <b>{levelGraph.totalEdges}</b>
                  </div>
                </>
              )}
            </div>

            {truncated && levelGraph && (
              <div className="cap-banner">
                {t.showing_top(levelGraph.nodes.length, levelGraph.totalNodes)}
              </div>
            )}

            {level === "symbol" && symbolResult && (
              <div className="legend">
                {(Object.keys(KIND_META) as NodeKind[])
                  .filter((k) => counts[k] > 0)
                  .map((k) => (
                    <div className="legend-item" key={k}>
                      <span className="legend-banner">
                        <span
                          className="legend-dot"
                          style={{ background: KIND_META[k].color }}
                        />
                        {KIND_META[k].label}
                      </span>
                      <span className="legend-count">{counts[k]}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        <footer className="foot">
          <span>
            {selected && (
              <button className="btn ghost" onClick={() => setSelected(null)}>
                {t.selection_clear}
              </button>
            )}
          </span>
          <span>{t.project_foot}</span>
        </footer>
      </aside>

      <main className="canvas dotted">
        <div className="scanline" />
        {!hasGraph ? (
          <div className="empty">
            <span className="empty-dot" />
            {busy ? t.loading : t.no_project}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} color="#c4c4c4" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
        {hasGraph && level !== "symbol" && (
          <div className="drill-tip">{t.drill_hint}</div>
        )}
      </main>
    </div>
  );
}
