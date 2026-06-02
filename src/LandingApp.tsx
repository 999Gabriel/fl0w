import { useMemo, useState } from "react";
import { LANDING_STRINGS, type LangCode, type LandingDict } from "./landing-i18n";

// app lives one level down from the landing root; BASE_URL is "/" in dev and
// "/fl0w/" in the GitHub Pages build, so "<base>app/" resolves correctly both ways.
const APP_URL = `${import.meta.env.BASE_URL}app/`;
const REPO_URL = "https://github.com/999gabriel/fl0w";
const COFFEE_URL = "https://buymeacoffee.com/the999gabriel";

// The full node palette, copied from analyzer.ts KIND_META so the landing bundle
// stays independent of the parser. Order matches how often a kind shows up.
const KINDS = [
  { key: "k_function", color: "#3b82f6" },
  { key: "k_method", color: "#a855f7" },
  { key: "k_class", color: "#f59e0b" },
  { key: "k_import", color: "#22c55e" },
  { key: "k_data", color: "#ef4444" },
  { key: "k_state", color: "#14b8a6" },
  { key: "k_element", color: "#ec4899" },
  { key: "k_style", color: "#0ea5e9" },
] as const;

// the 10 languages the analyzer dispatches on (feat_lang_d lists the same set)
const LANGS = ["JS / TS", "React", "Vue", "Python", "Java", "C / C++", "Arduino", "C#", "Dart", "HTML"];

// ---------------------------------------------------------------------------
// A static, honest mini call-graph built from the app's own .code-node markup.
// It is not interactive and claims nothing — it just shows the shape of output.
// On load it builds itself node-by-node (staggered nodeIn) so the hero shows the
// real product behaviour instead of a frozen picture.
// ---------------------------------------------------------------------------
function MiniNode({
  kind,
  kindLabel,
  label,
  calledBy,
  calls,
}: {
  kind: string;
  kindLabel: string;
  label: string;
  calledBy?: number;
  calls?: number;
}) {
  const color = KINDS.find((k) => k.key === kind)?.color ?? "#3b82f6";
  return (
    <div className="code-node lp-node">
      <span className="cn-dot" style={{ background: color }} />
      <div className="cn-body">
        <div className="cn-kind">{kindLabel}</div>
        <div className="cn-label">{label}</div>
      </div>
      <div className="cn-stats">
        {calledBy ? <span className="cn-stat">←{calledBy}</span> : null}
        {calls ? <span className="cn-stat">{calls}→</span> : null}
      </div>
    </div>
  );
}

function MiniGraph({ t }: { t: LandingDict }) {
  // four nodes in a fork: parseFile (entry) calls analyze and reads the `lang`
  // state; analyze builds the `nodes` data. Shows all three accent colours.
  // Edges sit in one <g> that fades in after the nodes start appearing.
  return (
    <div className="lp-graph" aria-hidden="true">
      <svg className="lp-edges" viewBox="0 0 520 240" preserveAspectRatio="none">
        <g className="lp-edge-group">
          {/* parseFile -> analyze (call) */}
          <path className="lp-edge lp-edge-call" d="M168 122 C 184 108, 168 82, 176 68" />
          {/* parseFile -> lang (uses) */}
          <path className="lp-edge lp-edge-uses" d="M168 134 C 184 152, 168 182, 176 196" />
          {/* analyze -> nodes (call) */}
          <path className="lp-edge lp-edge-call" d="M344 66 C 362 84, 346 112, 352 126" />
        </g>
      </svg>
      <div className="lp-node-wrap lp-pos-a" style={{ animationDelay: "0.1s" }}>
        <MiniNode kind="k_function" kindLabel={t.k_function} label="parseFile" calls={2} />
      </div>
      <div className="lp-node-wrap lp-pos-b" style={{ animationDelay: "0.4s" }}>
        <MiniNode kind="k_function" kindLabel={t.k_function} label="analyze" calledBy={1} calls={1} />
      </div>
      <div className="lp-node-wrap lp-pos-c" style={{ animationDelay: "0.7s" }}>
        <MiniNode kind="k_data" kindLabel={t.k_data} label="nodes" calledBy={1} />
      </div>
      <div className="lp-node-wrap lp-pos-d" style={{ animationDelay: "0.4s" }}>
        <MiniNode kind="k_state" kindLabel={t.k_state} label="lang" calledBy={1} />
      </div>
    </div>
  );
}

export default function LandingApp() {
  const [lang, setLang] = useState<LangCode>("de");
  const t = useMemo<LandingDict>(() => LANDING_STRINGS[lang], [lang]);

  const features = [
    { t: t.feat_single_t, d: t.feat_single_d },
    { t: t.feat_project_t, d: t.feat_project_d },
    { t: t.feat_lang_t, d: t.feat_lang_d },
    { t: t.feat_local_t, d: t.feat_local_d },
  ];

  const stats = [
    { n: "10", l: t.stat_lang },
    { n: "8", l: t.stat_kinds },
    { n: "2", l: t.stat_modes },
    { n: "0", l: t.stat_backend },
  ];

  return (
    <div className="lp">
      <div className="scanline" />

      <header className="lp-top">
        <div className="brand">
          <span className="brand-mark" />
          <h1>
            fl0w<span className="caret">_</span>
          </h1>
        </div>
        <div className="lang-switch">
          {(["de", "en"] as LangCode[]).map((l) => (
            <button
              key={l}
              className={`lang-btn${lang === l ? " active" : ""}`}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="lp-main">
        <section className="lp-hero">
          <div className="lp-hero-text">
            <h2 className="lp-tagline">{t.tagline}</h2>
            <p className="lp-lede">{t.lede}</p>
            <div className="lp-cta">
              <a className="btn lp-launch" href={APP_URL}>
                {t.launch} →
              </a>
              <a className="btn ghost" href={REPO_URL} target="_blank" rel="noreferrer">
                {t.source}
              </a>
            </div>
          </div>
          <MiniGraph t={t} />
        </section>

        <section className="lp-stats">
          {stats.map((s) => (
            <div className="lp-stat" key={s.l}>
              <div className="lp-stat-n">{s.n}</div>
              <div className="lp-stat-l">{s.l}</div>
            </div>
          ))}
        </section>

        <section className="lp-features">
          {features.map((f) => (
            <div className="lp-feature" key={f.t}>
              <div className="lp-feature-t">{f.t}</div>
              <div className="lp-feature-d">{f.d}</div>
            </div>
          ))}
        </section>

        <section className="lp-langs">
          <div className="lp-section-head">{t.langs_t}</div>
          <div className="lp-chips">
            {LANGS.map((l) => (
              <span className="lp-chip" key={l}>
                {l}
              </span>
            ))}
          </div>
        </section>

        <section className="lp-legend">
          <div className="lp-section-head">{t.legend_t}</div>
          <p className="lp-legend-lede">{t.legend_d}</p>
          <div className="lp-legend-grid">
            {KINDS.map((k) => (
              <div className="lp-legend-item" key={k.key}>
                <span className="lp-swatch" style={{ background: k.color }} />
                <span className="lp-legend-label">{t[k.key]}</span>
              </div>
            ))}
          </div>
          <div className="lp-edge-legend">
            <div className="lp-edge-row">
              <svg className="lp-edge-sample" viewBox="0 0 60 12" preserveAspectRatio="none">
                <path className="lp-edge lp-edge-call" d="M2 6 H58" />
              </svg>
              <span className="lp-edge-name">{t.e_call}</span>
              <span className="lp-edge-desc">{t.e_call_d}</span>
            </div>
            <div className="lp-edge-row">
              <svg className="lp-edge-sample" viewBox="0 0 60 12" preserveAspectRatio="none">
                <path className="lp-edge lp-edge-uses" d="M2 6 H58" />
              </svg>
              <span className="lp-edge-name">{t.e_uses}</span>
              <span className="lp-edge-desc">{t.e_uses_d}</span>
            </div>
          </div>
        </section>

        <section className="lp-how">
          <div className="lp-section-head">{t.how_t}</div>
          <ol className="lp-how-list">
            <li>{t.how_1}</li>
            <li>{t.how_2}</li>
            <li>{t.how_3}</li>
          </ol>
        </section>

        <section className="lp-final">
          <h2 className="lp-final-t">{t.cta_t}</h2>
          <p className="lp-final-d">{t.cta_d}</p>
          <a className="btn lp-launch" href={APP_URL}>
            {t.launch} →
          </a>
        </section>
      </main>

      <footer className="lp-foot">
        <span>{t.foot}</span>
        <span className="lp-foot-links">
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            github
          </a>
          <a href={COFFEE_URL} target="_blank" rel="noreferrer">
            buy me a coffee
          </a>
        </span>
      </footer>
    </div>
  );
}
