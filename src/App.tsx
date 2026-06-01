import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  analyze,
  detectLang,
  KIND_META,
  LANGUAGES,
  type Lang,
  type NodeKind,
} from "./analyzer";
import { buildFlow } from "./layout";
import { SAMPLES } from "./samples";
import CodeNode from "./components/CodeNode";

const nodeTypes = { code: CodeNode };

export default function App() {
  const [lang, setLang] = useState<Lang>("auto");
  const [code, setCode] = useState<string>(SAMPLES.js!);
  const [debounced, setDebounced] = useState<string>(SAMPLES.js!);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(code), 280);
    return () => clearTimeout(t);
  }, [code]);

  const result = useMemo(() => analyze(debounced, lang), [debounced, lang]);
  const flow = useMemo(() => buildFlow(result), [result]);
  const resolved = useMemo(
    () => (debounced.trim() ? (lang === "auto" ? detectLang(debounced) : lang) : lang),
    [debounced, lang]
  );

  const neighbors = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of result.edges) {
      if (e.from === selected) set.add(e.to);
      if (e.to === selected) set.add(e.from);
    }
    return set;
  }, [selected, result.edges]);

  const nodes: Node[] = useMemo(() => {
    if (!neighbors) return flow.nodes;
    return flow.nodes.map((n) => ({ ...n, className: neighbors.has(n.id) ? "hl" : "dim" }));
  }, [flow.nodes, neighbors]);

  const edges: Edge[] = useMemo(() => {
    if (!selected) return flow.edges;
    return flow.edges.map((e) => {
      const on = e.source === selected || e.target === selected;
      return {
        ...e,
        className: `${e.className ?? ""} ${on ? "edge-on" : "edge-off"}`.trim(),
        style: { ...e.style, opacity: on ? 1 : 0.1, strokeWidth: on ? 2.2 : 1.6 },
      };
    });
  }, [flow.edges, selected]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelected((cur) => (cur === node.id ? null : node.id));
  }, []);

  const counts = useMemo(() => {
    const c = {} as Record<NodeKind, number>;
    for (const k of Object.keys(KIND_META) as NodeKind[]) c[k] = 0;
    for (const n of result.nodes) c[n.kind]++;
    return c;
  }, [result.nodes]);

  const callEdges = result.edges.filter((e) => e.kind === "call").length;
  const usesEdges = result.edges.filter((e) => e.kind === "uses").length;
  const activeKinds = (Object.keys(KIND_META) as NodeKind[]).filter((k) => counts[k] > 0);
  const langLabel = LANGUAGES.find((l) => l.id === resolved)?.label ?? resolved.toUpperCase();

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <span className="brand-mark" />
          <h1>
            fl0w<span className="caret">_</span>
          </h1>
        </header>
        <p className="hint">
          Code einfügen — der Graph zeigt live, welche Funktion welche aufruft (durchgezogen,
          fließend) und welche Daten/State wohin fließen (gestrichelt).
        </p>

        <div className="lang-row">
          <label className="lang-label">SPRACHE</label>
          <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          {lang === "auto" && debounced.trim() && (
            <span className="lang-detected">→ {langLabel}</span>
          )}
        </div>

        <textarea
          className="editor"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="// Code hier einfügen"
        />

        <div className="toolbar">
          <button className="btn" onClick={() => setCode("")}>LEEREN</button>
          <button
            className="btn"
            onClick={() => {
              const key = (lang === "auto" ? "js" : lang) as Lang;
              setCode(SAMPLES[key] ?? SAMPLES.js!);
            }}
          >
            BEISPIEL
          </button>
          {selected && (
            <button className="btn ghost" onClick={() => setSelected(null)}>
              AUSWAHL ✕
            </button>
          )}
        </div>

        {result.error && (
          <div className="error">
            <span className="error-dot" /> {result.error}
          </div>
        )}

        <div className="stats">
          <div className="stat-row"><span>KNOTEN</span><b>{result.nodes.length}</b></div>
          <div className="stat-row"><span>AUFRUFE</span><b>{callEdges}</b></div>
          <div className="stat-row"><span>DATENFLUSS</span><b>{usesEdges}</b></div>
        </div>

        <div className="legend">
          {activeKinds.length === 0 && <div className="legend-empty">— keine Knoten —</div>}
          {activeKinds.map((k) => (
            <div className="legend-item" key={k}>
              <span className="legend-banner">
                <span className="legend-dot" style={{ background: KIND_META[k].color }} />
                {KIND_META[k].label}
              </span>
              <span className="legend-count">{counts[k]}</span>
            </div>
          ))}
        </div>

        <footer className="foot">
          <a
            className="coffee-link"
            href="https://buymeacoffee.com/the999gabriel"
            target="_blank"
            rel="noreferrer"
            aria-label="Buy Me a Coffee"
          >
            <img src="/assets/buy-me-a-coffee.png" alt="Buy Me a Coffee" />
          </a>
          <span>KLICK = Nachbarn hervorheben · single-file · {LANGUAGES.length - 1} Sprachen</span>
        </footer>
      </aside>

      <main className="canvas">
        <div className="scanline" />
        {result.nodes.length === 0 && !result.error ? (
          <div className="empty">
            <span className="empty-dot" />
            {debounced.trim() ? "NICHTS ERKANNT — Sprache prüfen" : "KEIN CODE — füge links etwas ein"}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d7d7d7" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </main>
    </div>
  );
}
