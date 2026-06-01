import { useMemo, useState } from "react";
import SingleFileView from "./components/SingleFileView";
import ProjectView from "./components/ProjectView";
import { I18nContext, STRINGS, type LangCode, type Dict } from "./i18n";

type Mode = "single" | "project";

export default function App() {
  const [mode, setMode] = useState<Mode>("single");
  const [lang, setLang] = useState<LangCode>("de");

  const i18n = useMemo(
    () => ({ lang, t: STRINGS[lang] as Dict, setLang }),
    [lang]
  );

  return (
    <I18nContext.Provider value={i18n}>
      <div className="app-shell">
        <div className="topbar">
          <div className="mode-switch">
            <button
              className={`mode-btn${mode === "single" ? " active" : ""}`}
              onClick={() => setMode("single")}
            >
              {STRINGS[lang].mode_single}
            </button>
            <button
              className={`mode-btn${mode === "project" ? " active" : ""}`}
              onClick={() => setMode("project")}
            >
              {STRINGS[lang].mode_project}
            </button>
          </div>
          <div className="lang-switch" title={STRINGS[lang].lang_label}>
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
        </div>
        {mode === "single" ? <SingleFileView /> : <ProjectView />}
      </div>
    </I18nContext.Provider>
  );
}
