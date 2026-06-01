# Flow

**Paste a source file — see how it actually fits together.**

Flow is a single-page web app that parses one file of code and draws an interactive graph of it: which function calls which (solid, flowing edges) and which data / state flows where (dashed edges). Minimalist black-and-white, pixel-terminal aesthetic, no build step or backend — everything runs in your browser.

🔗 **Live:** https://999gabriel.github.io/flow/

## Features

- **10 languages, single file** — paste and go:
  JS / TS · React (JSX/TSX) · Vue · Python · Java · C / C++ · Arduino · C# · Dart / Flutter · HTML / CSS / JS
- **Real parsing, not guesswork** — JS/TS/JSX/Vue use the actual [`@babel/parser`](https://babeljs.io/docs/babel-parser) AST. The other languages use dedicated analyzers (comment/string masking + brace matching for C-like languages, an indentation parser for Python, tag/selector/handler analysis for the web).
- **Two relationship types**
  - **Call** edges (solid, animated): function → function it calls — including functions passed as pointers / callbacks (e.g. FreeRTOS `xTaskCreate(taskLED, …)`).
  - **Data / state** edges (dashed): function → the global, field, or `useState`/`ref` it reads.
- **Typed nodes** with colored indicator dots: function · method · class · import · data · state · element · style.
- **Auto language detection** with manual override.
- **Click a node** to highlight its neighbours and dim the rest.
- **Live** — the graph re-renders ~280 ms after you stop typing; new nodes pop in.
- Respects `prefers-reduced-motion`.

## Tech

- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) + TypeScript
- [`@babel/parser`](https://babeljs.io/docs/babel-parser) for the JS/TS AST
- [`@xyflow/react`](https://reactflow.dev/) (React Flow) for the canvas
- [`dagre`](https://github.com/dagrejs/dagre) for automatic left-to-right layout
- Fonts: [Silkscreen](https://fonts.google.com/specimen/Silkscreen) (pixel UI) + [Space Mono](https://fonts.google.com/specimen/Space+Mono) (code)

## How it works

```
code ──▶ analyze(code, lang)            src/analyzer.ts
            │  detect / dispatch by language
            │  build { nodes, edges }
            ▼
        buildFlow(result)               src/layout.ts   (dagre auto-layout)
            ▼
        <ReactFlow/> + <CodeNode/>      src/App.tsx, src/components/
```

Each language analyzer emits the same `{ nodes, edges }` shape, so layout and UI are shared. See [`src/analyzer.ts`](src/analyzer.ts) for the parsers.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and publishes `dist/` to GitHub Pages. The Vite `base` is set to `/flow/` for the build so asset paths resolve under the project page.

## Known limits (single-file by design)

- Library / built-in calls (`printf`, `vTaskDelay`, `Serial.println`, …) are not shown as nodes — only symbols defined in the pasted file.
- Cross-file imports are not resolved yet (multi-file / whole-project support is the planned next step).
- The non-AST analyzers are heuristic; exotic syntax may be approximated.

## License

[MIT](LICENSE) © 999Gabriel
