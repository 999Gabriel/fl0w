// ===========================================================================
// landing-i18n.ts — string table for the landing page (DE/EN).
// Same shape/pattern as src/i18n.ts; kept separate so the app bundle and the
// landing bundle don't drag each other's strings around.
// ===========================================================================
export type LangCode = "de" | "en";

export const LANDING_STRINGS = {
  de: {
    tagline: "Sieh, wie dein Code fließt.",
    lede:
      "fl0w liest eine Quelldatei oder ein ganzes Repository und zeichnet den Aufrufgraph: welche Funktion welche aufruft — und wohin Daten und State fließen.",
    launch: "APP ÖFFNEN",
    source: "QUELLCODE",

    // mini-graph + legend node kinds (mirror KIND_META labels)
    k_function: "FUNKTION",
    k_method: "METHODE",
    k_class: "KLASSE",
    k_import: "IMPORT",
    k_data: "DATEN",
    k_state: "STATE",
    k_element: "ELEMENT",
    k_style: "STYLE",

    // stat band (numbers live in the component; only labels are translated)
    stat_lang: "Sprachen",
    stat_kinds: "Knotentypen",
    stat_modes: "Modi",
    stat_backend: "Backend-Calls",

    feat_single_t: "EINZELDATEI",
    feat_single_d: "Code einfügen, Graph erscheint live beim Tippen.",
    feat_project_t: "PROJEKT",
    feat_project_d: "Ganze Repos per GitHub-Link, Ordner oder Einfügen — über Dateigrenzen hinweg.",
    feat_lang_t: "10 SPRACHEN",
    feat_lang_d: "JS/TS, React, Vue, Python, Java, C/C++, Arduino, C#, Dart, HTML.",
    feat_local_t: "IM BROWSER",
    feat_local_d: "Kein Backend, kein Upload. Echtes AST-Parsing läuft lokal.",

    langs_t: "UNTERSTÜTZTE SPRACHEN",

    legend_t: "WAS DER GRAPH ZEIGT",
    legend_d: "Jeder Knoten ist ein Stück Struktur, jede Kante eine Beziehung.",
    e_call: "ruft auf",
    e_call_d: "Funktion ruft Funktion — durchgezogen, animiert.",
    e_uses: "nutzt",
    e_uses_d: "Funktion liest Daten oder State — gestrichelt.",

    how_t: "WIE ES LIEST",
    how_1: "Babel-AST für JS/TS/React/Vue — Funktionen, Klassen, Hooks, Imports.",
    how_2: "Heuristische Parser für Python und C-artige Sprachen.",
    how_3: "dagre legt den Graph von links nach rechts aus, React Flow rendert ihn.",

    cta_t: "Wirf eine Datei rein.",
    cta_d: "Kein Setup, kein Login. Quellcode einfügen und den Graphen sofort sehen.",

    foot: "single-file & projektweit · läuft im Browser",
  },
  en: {
    tagline: "See how your code flows.",
    lede:
      "fl0w reads a source file or a whole repository and draws the call graph: which function calls which — and where data and state flow.",
    launch: "OPEN APP",
    source: "SOURCE",

    k_function: "FUNCTION",
    k_method: "METHOD",
    k_class: "CLASS",
    k_import: "IMPORT",
    k_data: "DATA",
    k_state: "STATE",
    k_element: "ELEMENT",
    k_style: "STYLE",

    stat_lang: "languages",
    stat_kinds: "node types",
    stat_modes: "modes",
    stat_backend: "backend calls",

    feat_single_t: "SINGLE FILE",
    feat_single_d: "Paste code, the graph appears live as you type.",
    feat_project_t: "PROJECT",
    feat_project_d: "Whole repos via GitHub link, folder or paste — across file boundaries.",
    feat_lang_t: "10 LANGUAGES",
    feat_lang_d: "JS/TS, React, Vue, Python, Java, C/C++, Arduino, C#, Dart, HTML.",
    feat_local_t: "IN-BROWSER",
    feat_local_d: "No backend, no upload. Real AST parsing runs locally.",

    langs_t: "SUPPORTED LANGUAGES",

    legend_t: "WHAT THE GRAPH SHOWS",
    legend_d: "Every node is a piece of structure, every edge a relationship.",
    e_call: "calls",
    e_call_d: "function calls function — solid, animated.",
    e_uses: "uses",
    e_uses_d: "function reads data or state — dashed.",

    how_t: "HOW IT READS",
    how_1: "Babel AST for JS/TS/React/Vue — functions, classes, hooks, imports.",
    how_2: "Heuristic parsers for Python and C-like languages.",
    how_3: "dagre lays the graph out left-to-right, React Flow renders it.",

    cta_t: "Throw a file at it.",
    cta_d: "No setup, no login. Paste source and see the graph instantly.",

    foot: "single-file & project-wide · runs in the browser",
  },
} as const;

// Widen literal types so `de` and `en` share one assignable shape.
type Widen<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : string;
};
export type LandingDict = Widen<(typeof LANDING_STRINGS)["de"]>;
