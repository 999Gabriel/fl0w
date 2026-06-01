// ===========================================================================
// i18n.ts — minimal German/English string table + context hook.
// No dependency; just a typed dictionary and a React context.
// ===========================================================================
import { createContext, useContext } from "react";

export type LangCode = "de" | "en";

export const STRINGS = {
  de: {
    mode_single: "EINZELDATEI",
    mode_project: "PROJEKT",

    single_hint:
      "Code einfügen — der Graph zeigt live, welche Funktion welche aufruft (durchgezogen, fließend) und welche Daten/State wohin fließen (gestrichelt).",
    lang_label: "SPRACHE",
    clear: "LEEREN",
    example: "BEISPIEL",
    selection_clear: "AUSWAHL ✕",
    nodes: "KNOTEN",
    calls: "AUFRUFE",
    dataflow: "DATENFLUSS",
    no_nodes: "— keine Knoten —",
    single_foot: "KLICK = Nachbarn hervorheben · single-file",
    languages: "Sprachen",
    nothing_detected: "NICHTS ERKANNT — Sprache prüfen",
    no_code: "KEIN CODE — füge links etwas ein",

    project_hint:
      "Ganzes Projekt analysieren — Abhängigkeiten & Datenfluss über Dateigrenzen. Bei großen Projekten erst die Ordner-Übersicht, dann reinzoomen.",
    src_github: "GITHUB",
    src_folder: "ORDNER",
    src_paste: "EINFÜGEN",
    gh_placeholder: "github.com/user/repo  oder  user/repo",
    gh_analyze: "REPO ANALYSIEREN",
    loading: "LÄDT…",
    gh_note: "Öffentliche Repos · GitHub-API (60 Anfragen/h ohne Token).",
    drop_hint: "Ordner hierher ziehen oder klicken zum Auswählen",
    local_note: "Alles läuft lokal im Browser — nichts wird hochgeladen.",
    analyze: "ANALYSIEREN",
    files: "DATEIEN",
    crossfile: "DATEIÜBERGREIFEND",
    level_folder: "ORDNER",
    level_file: "DATEIEN",
    level_symbol: "SYMBOLE",
    level_label: "EBENE",
    files_focus: "DATEIEN — klick zum Fokus",
    focus_clear: "FOKUS ✕",
    back: "◂ ZURÜCK",
    project_foot: "PROJEKT-MODUS · mehrstufige Analyse",
    no_project: "KEIN PROJEKT — wähle links eine Quelle",
    no_sources_found: "Keine analysierbaren Quelldateien gefunden.",
    no_headers:
      "Keine Datei-Header erkannt. Trenne Dateien mit Zeilen wie  // ==== src/api.ts ====",
    drill_hint: "Doppelklick auf einen Knoten zum Reinzoomen.",
    showing_top: (shown: number, total: number) =>
      `Zeige Top ${shown} von ${total} (nach Verknüpfung gefiltert)`,
    scope: "BEREICH",
    deps_in: "Abhängig von dieser",
    deps_out: "Importiert",
    files_in_folder: "Dateien",
    weight_loc: "Zeilen",
    coverage: "ABDECKUNG",
  },
  en: {
    mode_single: "SINGLE FILE",
    mode_project: "PROJECT",

    single_hint:
      "Paste code — the graph shows live which function calls which (solid, flowing) and which data/state flows where (dashed).",
    lang_label: "LANGUAGE",
    clear: "CLEAR",
    example: "EXAMPLE",
    selection_clear: "SELECTION ✕",
    nodes: "NODES",
    calls: "CALLS",
    dataflow: "DATA FLOW",
    no_nodes: "— no nodes —",
    single_foot: "CLICK = highlight neighbours · single-file",
    languages: "languages",
    nothing_detected: "NOTHING DETECTED — check language",
    no_code: "NO CODE — paste something on the left",

    project_hint:
      "Analyze a whole project — dependencies & data flow across files. For big projects start with the folder overview, then zoom in.",
    src_github: "GITHUB",
    src_folder: "FOLDER",
    src_paste: "PASTE",
    gh_placeholder: "github.com/user/repo  or  user/repo",
    gh_analyze: "ANALYZE REPO",
    loading: "LOADING…",
    gh_note: "Public repos · GitHub API (60 requests/h without a token).",
    drop_hint: "Drag a folder here or click to choose",
    local_note: "Everything runs locally in your browser — nothing is uploaded.",
    analyze: "ANALYZE",
    files: "FILES",
    crossfile: "CROSS-FILE",
    level_folder: "FOLDERS",
    level_file: "FILES",
    level_symbol: "SYMBOLS",
    level_label: "LEVEL",
    files_focus: "FILES — click to focus",
    focus_clear: "FOCUS ✕",
    back: "◂ BACK",
    project_foot: "PROJECT MODE · multi-level analysis",
    no_project: "NO PROJECT — pick a source on the left",
    no_sources_found: "No analyzable source files found.",
    no_headers:
      "No file headers detected. Separate files with lines like  // ==== src/api.ts ====",
    drill_hint: "Double-click a node to zoom in.",
    showing_top: (shown: number, total: number) =>
      `Showing top ${shown} of ${total} (filtered by connectivity)`,
    scope: "SCOPE",
    deps_in: "Depended on by",
    deps_out: "Imports",
    files_in_folder: "files",
    weight_loc: "lines",
    coverage: "COVERAGE",
  },
} as const;

// Widen literal types so `de` and `en` share one assignable shape.
type Widen<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : string;
};
export type Dict = Widen<(typeof STRINGS)["de"]>;

export const I18nContext = createContext<{ lang: LangCode; t: Dict; setLang: (l: LangCode) => void }>({
  lang: "de",
  t: STRINGS.de as Dict,
  setLang: () => {},
});

export const useI18n = () => useContext(I18nContext);
