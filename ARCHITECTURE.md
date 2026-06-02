# fl0w Architecture

## System Overview

```
User Input (Code)
    ↓
[Language Detection] (detectLang)
    ↓
[Parser] ← Language-specific analyzer (analyzeJS, analyzePython, etc.)
    ↓
AnalysisResult {nodes, edges}
    ↓
[Layout Engine] (dagre)
    ↓
Graph {position, size, metadata}
    ↓
[React Flow] → Render canvas + UI
    ↓
Interactive Graph (click, pan, zoom)
```

## Data Flow: Single File Mode

1. **User pastes code** → `SingleFileView` captures input
2. **Language selector** (or auto-detect) → calls `detectLang(code)`
3. **Analysis** → `analyze(code, lang)` dispatches to language-specific parser
   - Returns `{ nodes: GraphNode[], edges: GraphEdge[], error?, lang, imports?, exports? }`
4. **Layout** → `buildFlow(analysisResult)` passes nodes through `dagre` for positioning
5. **Render** → React Flow canvas + `CodeNode` component for each node
6. **Interaction** → Click node → toggle highlight via React state

## Data Flow: Project Mode (WIP)

1. **User selects files** from a project directory
2. **Multi-file analysis** → `analyzeProject()` in `project.ts`
   - Parses each file independently
   - Tracks `imports` / `exports` per file
   - **Cross-file resolution**: resolves `import { Foo } from "./other"` → finds `Foo` in `other.ts`
   - Builds unified graph across all files
3. **Layout + Render** → Same as single-file from here on

## Core Modules

### `analyzer.ts` (700+ lines)

**Responsibilities**:
- Language detection
- Per-language parsing
- Node & edge building

**Key Classes**:
- `Builder` — accumulates nodes/edges, prevents duplicates, tracks usage counts
- Language analyzers — `analyzeJS`, `analyzePython`, `analyzeCLike`, `analyzeWeb`, `analyzeVue`

**Key Functions**:
- `maskCode()` — blanks out comments & strings (preserves length + braces)
- `scanBody()` — regex scan for calls + data references
- `walk()` — AST traversal (recursive descent)
- `analyze()` — main entry point (dispatch by language)

**Output Type**:
```typescript
interface AnalysisResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lang: Lang;
  error?: string;
  imports?: ImportRef[];
  exports?: string[];
}
```

### `layout.ts`

**Responsibility**: Graph layout positioning

**Key Function**:
- `buildFlow(result: AnalysisResult)` — wraps `dagre.layout(g)`, returns React Flow-compatible nodes + edges with `position` set

**Configuration**:
- `nodeWidth: 200, nodeHeight: 80` — dagre estimates
- Margin/padding → controls spread

### `App.tsx`

**Responsibility**: Root component + global state

**State**:
- `mode` — "single" or "project"
- `lang` — "de" or "en"
- `i18n` context provider

**UI**:
- Topbar: mode switch, language switcher
- Content: conditionally render `SingleFileView` or `ProjectView`

### `SingleFileView.tsx`

**Responsibility**: Single-file mode UI

**State**:
- `code` — user's pasted code
- `selectedLang` — language override (or "auto")
- `analysisResult` — output of `analyze()`
- `selectedNode` — for highlighting neighbors

**Rendering**:
- Textarea for code input
- Language selector dropdown
- React Flow canvas
- Error message (if parse failed)

### `ProjectView.tsx`

**Responsibility**: Project mode UI (WIP)

**State**:
- `files` — list of selected project files
- `analysisResult` — output of `analyzeProject()`
- `selectedFile` — current focus
- `selectedNode` — highlighting

**Rendering**:
- File picker / browser
- React Flow canvas (whole project graph)
- File-level filtering (optional)

### `project.ts` (WIP)

**Responsibility**: Multi-file analysis

**Key Function**:
- `analyzeProject(fileMap: Record<string, string>)` — analyze all files, resolve cross-file imports
- Returns unified `AnalysisResult` with all nodes/edges merged

**Cross-file resolution**:
- Track imports (`{ local, imported, source }`)
- Find target file from import path
- Look up `exported` names in target
- Link import node to definition

### `i18n.ts`

**Responsibility**: Internationalization

**Structure**:
```typescript
const STRINGS = {
  de: { /* German */ },
  en: { /* English */ }
}
```

**Usage**: `const { t } = useContext(I18nContext)` → `t.key`

## React Component Hierarchy

```
<App>
  ├─ <I18nContext.Provider>
  ├─ <SingleFileView> OR <ProjectView>
  │  └─ <ReactFlow>
  │     └─ <CodeNode> (repeated for each node)
  │        └─ <Handle> (connection ports)
  └─ UI: topbar, editor, controls
```

## Node Types & Metadata

```typescript
type NodeKind = 
  | "function" | "method" | "class"
  | "import" | "data" | "state"
  | "element" | "style"

interface GraphNode {
  id: string;              // e.g., "function:foo" or "method:MyClass.bar"
  label: string;           // "foo" or "MyClass.bar"
  kind: NodeKind;
  meta?: string;           // e.g., module name for imports, hook name for state
  calls: number;           // outgoing calls
  calledBy: number;        // incoming calls
}
```

## Edge Types

```typescript
type EdgeKind = "call" | "uses";

interface GraphEdge {
  id: string;              // e.g., "fn1->fn2:call"
  from: string;            // source node id
  to: string;              // target node id
  kind: EdgeKind;
}
```

## Language Parser Strategy

| Language | Method | Strengths | Limits |
|----------|--------|-----------|--------|
| JS/TS/React | Babel AST | Accurate, handles modern syntax | Large bundle (~300KB) |
| Vue | Extract `<script>` + Babel | Works for Vue 2/3 | Only JS part |
| Python | Indentation + regex | Small, fast | Exotic syntax approximated |
| C-like (6 langs) | Regex + brace matching | One parser for many | Comments/strings must be masked |
| Web | Tag regex + `<script>` + CSS selector | Captures handlers | Doesn't execute JS |

## Key Design Decisions

1. **Single-file by design**
   - Keeps parser simple (no module resolution)
   - Meets MVP requirement
   - Cross-file support (ProjectView) is planned but not blocking

2. **Real parsing where possible**
   - Babel for JS/TS (most common; users expect accuracy)
   - Regex + heuristics for others (fast, small bundle)

3. **Shared node/edge format**
   - All parsers emit `{ nodes, edges }`
   - Layout and UI are language-agnostic
   - New language = one parser function + dispatch case

4. **No backend / no build step**
   - Everything runs in browser
   - No server to maintain
   - Cold start is instant

5. **Minimalist UI**
   - Pixel-terminal aesthetic (fonts: Silkscreen, Space Mono)
   - Black + white + accent colors
   - Respects dark mode / reduced motion

## Performance Characteristics

| Stage | Typical Time | Bottleneck |
|-------|--------------|-----------|
| Parse JS (1000 lines) | ~10ms | Babel AST walk |
| Layout (200 nodes) | ~50ms | Dagre ranking/ordering |
| Render (200 nodes) | ~280ms | React Flow canvas + React re-renders |
| Total E2E | ~350ms | Render (user sees after typing stops) |

**Limits**:
- 600 nodes max (hard stop in `Builder.addNode()`)
- Beyond that, new nodes silently fail to prevent OOM

## Error Handling

- **Parse error** → caught in try/catch, returned in `AnalysisResult.error`
- **Display** → error banner in UI; graph shows empty
- **Layout error** → dagre rarely fails; falls back to fallback positions

## State Management

**No Redux/Zustand**—all state is local to components:
- `SingleFileView`: code, language, analysis, selection
- `App`: global mode + language
- `I18nContext`: shared i18n provider

## Styling

**Single CSS file** (`src/styles.css`):
- CSS Grid for layout
- Flexbox for component alignment
- Pixel font rendering (`image-rendering: pixelated`)
- Colors tied to node kinds (defined in `analyzer.ts`)

## Deployment Pipeline

```
Push to main
    ↓
GitHub Actions (deploy.yml) triggered
    ↓
npm install
npm run build    (tsc -b + vite build)
    ↓
dist/ → gh-pages branch
    ↓
GitHub Pages serves https://999gabriel.github.io/fl0w/
```

**Vite config**: `base: "/fl0w/"` ensures asset paths are correct on the subpath.

---

**Next Steps for contributors**:
1. Understand the analyzer pattern (pick a language, trace through its parser)
2. Trace a single code example through the full pipeline (paste → parse → layout → render)
3. Experiment in dev mode with different languages and edge cases
