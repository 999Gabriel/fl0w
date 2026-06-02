# fl0w · Claude Code Guide

## Project Overview

**fl0w** is a single-page web app that visualizes code structure in a single file. Paste code → get an interactive graph of function calls and data flows. No backend, no build step required—everything runs in the browser.

- **Live**: https://999gabriel.github.io/fl0w/
- **Type**: React 18 + TypeScript + Vite SPA
- **Core**: Real AST parsing (Babel for JS/TS; custom analyzers for 8+ other languages)

## Before You Start

1. **Node + npm** required (`npm install && npm run dev`)
2. **Port 5173**: Vite dev server runs here
3. **Automatic deploy**: Push to `main` → GitHub Actions builds and deploys to `gh-pages`
4. **Package manager**: `npm` (not yarn/pnpm)

## Key Files & Responsibilities

| File | Role |
|------|------|
| `src/analyzer.ts` | Core parsing engine—dispatches by language, builds `{nodes, edges}`. **700+ lines; touch with care.** |
| `src/layout.ts` | Graph layout—wraps `dagre` for left-to-right auto-layout. Small. |
| `src/App.tsx` | Root component—mode switcher (single/project), i18n provider. |
| `src/components/SingleFileView.tsx` | Single-file mode UI: editor, language selector, error display. |
| `src/components/ProjectView.tsx` | Project-wide mode UI: file picker, multi-file analysis. |
| `src/project.ts` | Multi-file project analyzer (cross-file imports). |
| `src/i18n.ts` | i18n strings (German `de` + English `en`). |
| `src/styles.css` | Global styles (pixel-terminal black/white aesthetic). |
| `vite.config.ts` | Build config; `base: "/fl0w/"` for GitHub Pages deployment. |
| `.github/workflows/deploy.yml` | CI/CD: builds & deploys to `gh-pages` on push to `main`. |

## Language Analyzers

All emit the same `{ nodes, edges }` shape:

- **JS / TS / React / Vue** (`analyzeJS`) — Real Babel AST parser. Catches async, classes, imports, hooks (`useState`, `useRef`, etc.).
- **Python** (`analyzePython`) — Indentation-based parser. Handles `def`, `class`, `import`.
- **C / C++ / Arduino / C# / Java / Dart** (`analyzeCLike`) — Regex + brace matching. Detects `#include`, `import`, classes, functions, global data.
- **Web (HTML + CSS + JS)** (`analyzeWeb`) — Extracts `<script>` blocks, `<style>` rules, HTML tags with handlers (`onclick`, etc.).

## Node Types & Edge Types

**Nodes**:
- `function`, `method`, `class` — code structures
- `import` — external module reference
- `data` — global/field variables
- `state` — React hooks (`useState`, etc.) or Vue/Svelte reactive
- `element` — HTML tags (Web mode only)
- `style` — CSS selectors (Web mode only)

**Edges**:
- `call` (solid, animated) — function → function or element → handler
- `uses` (dashed) — function → data/state variable

## Graph Layout

- **Engine**: `dagre` (deterministic left-to-right layout)
- **Canvas**: React Flow (`@xyflow/react`)
- **Interaction**: Click node → highlight neighbors, dim rest
- **Animation**: Respects `prefers-reduced-motion`

## Workflow for Making Changes

### 1. Local Dev
```bash
npm install
npm run dev          # http://localhost:5173
# edit src/... and watch live updates
```

### 2. Type Check + Build
```bash
npm run build        # runs `tsc -b` then Vite build
npm run preview      # serve production build locally
```

### 3. Deploy
Push to `main` → `.github/workflows/deploy.yml` auto-runs:
- Builds with `npm run build`
- Deploys `dist/` to `gh-pages` branch
- **Live within ~2 min**

## Common Tasks

### Add a new language analyzer
1. Add entry to `LANGUAGES` array in `analyzer.ts`
2. Create `analyze${Lang}()` function (should return `AnalysisResult`)
3. Add dispatch case in `analyze()`
4. Add auto-detect pattern in `detectLang()`
5. Test with sample file in dev mode

### Fix a parsing bug
1. Locate the buggy language's analyzer in `analyzer.ts`
2. Add test case (paste code in dev mode; verify expected nodes/edges)
3. Adjust regex/AST walk logic
4. Re-test

### Update i18n strings
1. Edit `src/i18n.ts` (`de` and `en` branches)
2. Reference in components via `useContext(I18nContext)` → `.t.{key}`

### Adjust colors / styling
1. CSS in `src/styles.css`
2. Node kind colors in `src/analyzer.ts` → `KIND_META`
3. React Flow theme in `src/components/SingleFileView.tsx`

## Known Limits (by Design)

- **Single file only** — no cross-file imports yet (ProjectView is WIP)
- **Library calls hidden** — `console.log`, `React.useState` etc. don't show unless defined locally
- **Non-AST languages are heuristic** — C-like, Python use regex + brace/indent matching; exotic syntax may not parse perfectly
- **Max 600 nodes** — enforced to keep rendering fast

## Debugging Tips

1. **Parse errors?** Check `AnalysisResult.error` (logged in console)
2. **Missing nodes?** Verify the symbol is in `b.addNode()` call
3. **Wrong edges?** Check `scanBody()` (regex for calls) and identifier walk
4. **Layout weird?** Tweak `dagre` margin/spacing in `layout.ts` or React Flow config
5. **i18n not updating?** Restart dev server (i18n is singleton)

## Performance Notes

- **Parser**: Babel is ~10ms for ~1000-line JS file
- **Layout**: Dagre is ~50ms for ~200 nodes
- **Render**: React Flow + Canvas ~280ms after user stops typing
- **Limits**: 600 nodes before adding becomes a no-op (performance cliff)

## Code Style

- **TypeScript**: Strict mode; interfaces for data shapes
- **React**: Hooks only (no class components)
- **CSS**: Minimal; pixel aesthetic (Silkscreen for UI, Space Mono for code)
- **Comments**: Only when WHY is non-obvious (parsing hacks, async edge cases)
- **No external UI libs** beyond React Flow + Dagre

## Testing

No test suite yet. Manual testing in dev mode is the norm:
1. Paste code (JS, Python, etc.) in dev
2. Verify expected nodes appear
3. Verify edges (calls, uses) are correct
4. Check UI responsiveness (click nodes, toggle language, switch modes)
5. Test in both `de` and `en`

For regression testing before deploy:
- Paste a few sample files in each language
- Verify graph matches expected output
- Check deploy preview before merging `main`

## Git Workflow

- **Branch**: `main` is production (deployed on push)
- **Commits**: Clear, atomic (e.g., "add Rust analyzer", "fix Vue import detection")
- **CI/CD**: Auto-deploys on push to `main` (no manual deploy needed)

## Resources

- **Babel Parser Docs**: https://babeljs.io/docs/babel-parser
- **React Flow Docs**: https://reactflow.dev/
- **Dagre Docs**: https://github.com/dagrejs/dagre/wiki
- **Vite Docs**: https://vitejs.dev/

---

**Questions?** Check the README for feature overview or dive into `src/analyzer.ts` for the guts of parsing.
