import { parse } from "@babel/parser";

export type NodeKind =
  | "function"
  | "method"
  | "class"
  | "import"
  | "data"
  | "state"
  | "element"
  | "style";

export type EdgeKind = "call" | "uses";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  meta?: string;
  calls: number;
  calledBy: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface AnalysisResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  error?: string;
  lang: Lang;
}

export type Lang =
  | "auto"
  | "js"
  | "ts"
  | "react"
  | "vue"
  | "python"
  | "java"
  | "cpp"
  | "arduino"
  | "csharp"
  | "dart"
  | "web";

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "auto", label: "AUTO" },
  { id: "js", label: "JS / TS" },
  { id: "react", label: "REACT" },
  { id: "vue", label: "VUE" },
  { id: "python", label: "PYTHON" },
  { id: "java", label: "JAVA" },
  { id: "cpp", label: "C / C++" },
  { id: "arduino", label: "ARDUINO" },
  { id: "csharp", label: "C#" },
  { id: "dart", label: "DART / FLUTTER" },
  { id: "web", label: "HTML / CSS / JS" },
];

const STATE_HOOKS = new Set([
  "useState",
  "useReducer",
  "ref",
  "reactive",
  "computed",
]);

const CTRL = new Set([
  "if", "else", "for", "while", "switch", "case", "catch", "do", "return",
  "sizeof", "new", "delete", "throw", "using", "namespace", "template",
  "typedef", "struct", "class", "enum", "union", "public", "private",
  "protected", "static", "const", "void", "and", "or", "not", "in", "is",
  "await", "yield", "with", "as", "def", "lambda", "print", "super",
  "typeof", "instanceof", "void", "extends", "implements", "interface",
  "function", "var", "let", "foreach", "operator", "decltype",
]);

const MAX_NODES = 600;

// ---------------------------------------------------------------------------
// shared builder
// ---------------------------------------------------------------------------
class Builder {
  nodes = new Map<string, GraphNode>();
  nameToId = new Map<string, string>();
  edges = new Map<string, GraphEdge>();
  private used = new Set<string>();

  addNode(label: string, kind: NodeKind, meta?: string): string | null {
    if (this.nodes.size >= MAX_NODES) return null;
    let id = `${kind}:${label}`;
    let i = 1;
    while (this.used.has(id)) id = `${kind}:${label}__${i++}`;
    this.used.add(id);
    this.nodes.set(id, { id, label, kind, meta, calls: 0, calledBy: 0 });
    if (!this.nameToId.has(label)) this.nameToId.set(label, id);
    return id;
  }

  alias(name: string, id: string) {
    if (!this.nameToId.has(name)) this.nameToId.set(name, id);
  }

  addEdge(from: string, to: string, kind: EdgeKind) {
    if (!from || !to || from === to) return;
    const id = `${from}->${to}:${kind}`;
    if (this.edges.has(id)) return;
    this.edges.set(id, { id, from, to, kind });
  }

  result(lang: Lang): AnalysisResult {
    for (const e of this.edges.values()) {
      if (e.kind !== "call") continue;
      const f = this.nodes.get(e.from);
      const t = this.nodes.get(e.to);
      if (f) f.calls++;
      if (t) t.calledBy++;
    }
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()], lang };
  }
}

// ---------------------------------------------------------------------------
// masking: blank out comments + string contents (keeps length + braces)
// ---------------------------------------------------------------------------
function maskCode(code: string, flavor: "c" | "py" | "js"): string {
  const out = code.split("");
  const n = code.length;
  const isC = flavor !== "py";
  let i = 0;
  const blank = (a: number, b: number) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (isC && c === "/" && d === "/") {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (flavor === "py" && c === "#") {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (isC && c === "/" && d === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j + 1] === "/")) j++;
      blank(i, j + 2);
      i = j + 2;
      continue;
    }
    if (flavor === "py" && (c === '"' || c === "'") && code[i + 1] === c && code[i + 2] === c) {
      const q = c;
      let j = i + 3;
      while (j < n && !(code[j] === q && code[j + 1] === q && code[j + 2] === q)) j++;
      blank(i + 3, j);
      i = j + 3;
      continue;
    }
    if (c === '"' || c === "'" || (flavor === "js" && c === "`")) {
      const q = c;
      let j = i + 1;
      while (j < n && code[j] !== q) {
        if (code[j] === "\\") j += 2;
        else j++;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

function matchBrace(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

function depthArray(s: string): Int32Array {
  const arr = new Int32Array(s.length + 1);
  for (let i = 0; i < s.length; i++) {
    let d = arr[i];
    if (s[i] === "{") d++;
    else if (s[i] === "}") d--;
    arr[i + 1] = d;
  }
  return arr;
}

function scanBody(body: string, fromId: string, b: Builder, dataState: Set<string>) {
  // direct calls: name(
  const callRe = /([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(body))) {
    const nm = m[1];
    if (CTRL.has(nm)) continue;
    const tid = b.nameToId.get(nm);
    if (tid) b.addEdge(fromId, tid, "call");
  }
  // bare references (not followed by "("): data/state -> uses, function/method -> call (callback / pointer)
  const wRe = /([A-Za-z_]\w*)/g;
  let w: RegExpExecArray | null;
  while ((w = wRe.exec(body))) {
    const nm = w[1];
    if (CTRL.has(nm)) continue;
    let j = wRe.lastIndex;
    while (body[j] === " ") j++;
    if (body[j] === "(") continue;
    const tid = b.nameToId.get(nm);
    if (!tid || tid === fromId) continue;
    const kind = b.nodes.get(tid)?.kind;
    if (kind === "data" || kind === "state") {
      if (dataState.has(nm)) b.addEdge(fromId, tid, "uses");
    } else if (kind === "function" || kind === "method") {
      b.addEdge(fromId, tid, "call");
    }
  }
}

// ===========================================================================
// JS / TS / JSX / TSX  (real AST via @babel/parser)
// ===========================================================================
function calleeName(callee: any): string | null {
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier")
    return callee.property.name;
  return null;
}

function walk(node: any, enter: (n: any) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) walk(c, enter);
    return;
  }
  if (typeof node.type === "string") enter(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
    const val = (node as any)[key];
    if (val && typeof val === "object") walk(val, enter);
  }
}

function analyzeJS(code: string, lang: Lang): AnalysisResult {
  let ast: any;
  try {
    ast = parse(code, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: [
        "jsx", "typescript", "classProperties", "decorators-legacy",
        "objectRestSpread", "optionalChaining", "nullishCoalescingOperator",
        "topLevelAwait",
      ],
    });
  } catch (e: any) {
    return { nodes: [], edges: [], error: e?.message ?? "Parse-Fehler", lang };
  }

  const b = new Builder();
  const fnNodeToId = new Map<any, string>();

  walk(ast.program, (n) => {
    switch (n.type) {
      case "FunctionDeclaration":
        if (n.id?.name) {
          const id = b.addNode(n.id.name, "function");
          if (id) fnNodeToId.set(n, id);
        }
        break;
      case "VariableDeclarator": {
        const name = n.id?.type === "Identifier" ? n.id.name : null;
        const init = n.init;
        if (!init) break;
        if (name && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
          const id = b.addNode(name, "function");
          if (id) fnNodeToId.set(init, id);
        } else if (
          init.type === "CallExpression" &&
          calleeName(init.callee) &&
          STATE_HOOKS.has(calleeName(init.callee)!)
        ) {
          const hook = calleeName(init.callee)!;
          if (n.id?.type === "ArrayPattern" && n.id.elements?.[0]?.type === "Identifier")
            b.addNode(n.id.elements[0].name, "state", hook);
          else if (name) b.addNode(name, "state", hook);
        }
        break;
      }
      case "ClassDeclaration":
        if (n.id?.name) {
          b.addNode(n.id.name, "class");
          for (const member of n.body?.body ?? []) {
            if (member.type === "ClassMethod" && member.key?.type === "Identifier") {
              const mid = b.addNode(`${n.id.name}.${member.key.name}`, "method");
              if (mid) {
                fnNodeToId.set(member, mid);
                b.alias(member.key.name, mid);
              }
            }
            if (
              member.type === "ClassProperty" &&
              member.key?.type === "Identifier" &&
              (member.value?.type === "ArrowFunctionExpression" ||
                member.value?.type === "FunctionExpression")
            ) {
              const mid = b.addNode(`${n.id.name}.${member.key.name}`, "method");
              if (mid) {
                fnNodeToId.set(member.value, mid);
                b.alias(member.key.name, mid);
              }
            }
          }
        }
        break;
      case "ImportDeclaration":
        for (const spec of n.specifiers ?? [])
          if (spec.local?.name) b.addNode(spec.local.name, "import", n.source?.value ?? "");
        break;
    }
  });

  for (const stmt of ast.program.body ?? []) {
    const decl =
      stmt.type === "VariableDeclaration"
        ? stmt
        : stmt.type === "ExportNamedDeclaration" && stmt.declaration?.type === "VariableDeclaration"
        ? stmt.declaration
        : null;
    if (!decl) continue;
    for (const d of decl.declarations ?? []) {
      if (d.id?.type !== "Identifier") continue;
      const init = d.init;
      const isFn = init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression");
      const isHook =
        init?.type === "CallExpression" &&
        calleeName(init.callee) &&
        STATE_HOOKS.has(calleeName(init.callee)!);
      if (isFn || isHook) continue;
      if (b.nameToId.has(d.id.name)) continue;
      b.addNode(d.id.name, "data");
    }
  }

  const dataState = new Set(
    [...b.nodes.values()].filter((n) => n.kind === "data" || n.kind === "state").map((n) => n.label)
  );

  const fnStack: string[] = [];
  const visit = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const c of n) visit(c);
      return;
    }
    const entered = fnNodeToId.get(n);
    if (entered) fnStack.push(entered);
    const cur = fnStack[fnStack.length - 1];
    if (n.type === "CallExpression" && cur) {
      const nm = calleeName(n.callee);
      if (nm && b.nameToId.has(nm)) b.addEdge(cur, b.nameToId.get(nm)!, "call");
    }
    if (n.type === "Identifier" && cur && dataState.has(n.name) && b.nameToId.has(n.name))
      b.addEdge(cur, b.nameToId.get(n.name)!, "uses");
    for (const key of Object.keys(n)) {
      if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
      const val = (n as any)[key];
      if (val && typeof val === "object") visit(val);
    }
    if (entered) fnStack.pop();
  };
  visit(ast.program);

  return b.result(lang);
}

// ===========================================================================
// C-like: Java, C++, Arduino, C#, Dart
// ===========================================================================
function analyzeCLike(code: string, lang: Lang): AnalysisResult {
  const b = new Builder();
  const masked = maskCode(code, "c");
  const depth = depthArray(masked);

  // imports / includes
  const importLines = [
    /#\s*include\s*[<"]([^>"]+)[>"]/g,
    /\bimport\s+(?:static\s+)?([\w.]+)\s*;/g, // java
    /\busing\s+(?:static\s+)?([\w.]+)\s*;/g, // c#
    /\bimport\s+['"]([^'"]+)['"]/g, // dart
  ];
  for (const re of importLines) {
    let m: RegExpExecArray | null;
    // run on original code: string-path imports (dart) are blanked in `masked`
    while ((m = re.exec(code))) {
      const raw = m[1].trim();
      const stripped = raw.replace(/\.(dart|h|hpp|hxx|cpp|cc|js|ts|css|java|cs)$/i, "");
      const base = (stripped.split(/[\/.]/).filter(Boolean).pop() || stripped).trim();
      if (base) b.addNode(base, "import", raw);
    }
  }

  // classes / structs
  type Range = { name: string; open: number; close: number };
  const classRanges: Range[] = [];
  const classRe = /\b(?:class|struct|interface)\s+([A-Za-z_]\w*)/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(masked))) {
    const name = cm[1];
    let j = classRe.lastIndex;
    while (j < masked.length && masked[j] !== "{" && masked[j] !== ";") j++;
    if (masked[j] !== "{") continue;
    const close = matchBrace(masked, j);
    b.addNode(name, "class");
    classRanges.push({ name, open: j, close });
  }

  // function / method headers
  type Fn = { id: string; body: string };
  const fns: Fn[] = [];
  const headerRe = /([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*[^;{}=]*\{/g;
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(masked))) {
    const name = hm[1];
    if (CTRL.has(name)) continue;
    const start = hm.index;
    const braceIdx = headerRe.lastIndex - 1;
    const d = depth[start];
    const cls = classRanges.find((r) => start > r.open && start < r.close);
    const isMethod = cls && depth[start] === depth[cls.open] + 1;
    const isFree = d === 0;
    if (!isMethod && !isFree) continue;
    const label = isMethod ? `${cls!.name}.${name}` : name;
    const id = b.addNode(label, isMethod ? "method" : "function");
    if (!id) continue;
    b.alias(name, id);
    const close = matchBrace(masked, braceIdx);
    fns.push({ id, body: masked.slice(braceIdx + 1, close) });
  }

  // global data: #define + every depth-0 ';'-terminated declaration
  const defRe = /#\s*define\s+([A-Za-z_]\w*)/g;
  let dm: RegExpExecArray | null;
  while ((dm = defRe.exec(masked))) if (!b.nameToId.has(dm[1])) b.addNode(dm[1], "data");

  const STMT_SKIP = new Set([
    "using", "namespace", "return", "typedef", "import", "package", "export",
    "throw", "goto", "break", "continue", "delete", "new", "if", "else",
    "for", "while", "switch", "do",
  ]);
  const processStmt = (raw: string) => {
    const stmt = raw.trim();
    if (!stmt || stmt.includes("(") || stmt.includes("{") || stmt[0] === "#") return;
    const head = stmt.split("=")[0];
    const toks = head.match(/[A-Za-z_]\w*/g);
    if (!toks || toks.length < 2) return; // need at least <type> <name>
    if (STMT_SKIP.has(toks[0])) return;
    const name = toks[toks.length - 1];
    if (CTRL.has(name) || b.nameToId.has(name)) return;
    b.addNode(name, "data");
  };
  // blank preprocessor lines so they don't swallow the following declaration
  const dataMask = masked.replace(/^[ \t]*#.*$/gm, (s) => " ".repeat(s.length));
  let stmtStart = 0;
  let prevDepth = 0;
  for (let i = 0; i < dataMask.length; i++) {
    const d = depth[i];
    const c = dataMask[i];
    if (prevDepth > 0 && d === 0) stmtStart = i; // just exited a block
    if (d === 0) {
      if (c === ";") {
        processStmt(dataMask.slice(stmtStart, i));
        stmtStart = i + 1;
      } else if (c === "{") {
        stmtStart = i + 1;
      }
    }
    prevDepth = d;
  }

  const dataState = new Set(
    [...b.nodes.values()].filter((n) => n.kind === "data").map((n) => n.label)
  );

  for (const fn of fns) scanBody(fn.body, fn.id, b, dataState);

  return b.result(lang);
}

// ===========================================================================
// Python (indentation based)
// ===========================================================================
function analyzePython(code: string): AnalysisResult {
  const b = new Builder();
  const masked = maskCode(code, "py");
  const lines = masked.split("\n");
  const origLines = code.split("\n");

  const indentOf = (s: string) => {
    let w = 0;
    for (const ch of s) {
      if (ch === " ") w++;
      else if (ch === "\t") w += 4;
      else break;
    }
    return w;
  };

  type Frame = { kind: "class" | "def"; name: string; indent: number; id: string };
  const stack: Frame[] = [];
  const bodies = new Map<string, string[]>();

  const classRe = /^\s*class\s+([A-Za-z_]\w*)/;
  const defRe = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
  const importRe1 = /^\s*import\s+(.+)$/;
  const importRe2 = /^\s*from\s+\S+\s+import\s+(.+)$/;
  const assignRe = /^([A-Za-z_]\w*)\s*=(?!=)/;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const indent = indentOf(line);
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const enclosing = stack[stack.length - 1];

    const cls = classRe.exec(line);
    if (cls) {
      const id = b.addNode(cls[1], "class");
      if (id) stack.push({ kind: "class", name: cls[1], indent, id });
      continue;
    }
    const def = defRe.exec(line);
    if (def) {
      const name = def[1];
      const isMethod = enclosing && enclosing.kind === "class";
      const label = isMethod ? `${enclosing.name}.${name}` : name;
      const id = b.addNode(label, isMethod ? "method" : "function");
      if (id) {
        b.alias(name, id);
        stack.push({ kind: "def", name, indent, id });
        bodies.set(id, []);
      }
      continue;
    }
    const im = importRe2.exec(line) || importRe1.exec(line);
    if (im) {
      for (const part of im[1].split(",")) {
        const seg = part.trim().split(/\s+as\s+/);
        const alias = (seg[1] || seg[0]).trim();
        const nm = alias.split(".").pop()!;
        if (nm && nm !== "*") b.addNode(nm, "import", part.trim());
      }
      continue;
    }
    // statement -> nearest enclosing def body
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s].kind === "def") {
        bodies.get(stack[s].id)?.push(origLines[li] ?? line);
        break;
      }
    }
    // module-level assignment -> data
    const inDef = stack.some((f) => f.kind === "def");
    if (!inDef && indent === 0) {
      const a = assignRe.exec(line.trim());
      if (a && !CTRL.has(a[1]) && !b.nameToId.has(a[1])) b.addNode(a[1], "data");
    }
  }

  const dataState = new Set(
    [...b.nodes.values()].filter((n) => n.kind === "data").map((n) => n.label)
  );
  for (const [id, body] of bodies) scanBody(body.join("\n"), id, b, dataState);

  return b.result("python");
}

// ===========================================================================
// Vue SFC — analyze <script> block(s) as JS/TS
// ===========================================================================
function analyzeVue(code: string): AnalysisResult {
  const scripts: string[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) scripts.push(m[1]);
  const js = scripts.join("\n\n");
  if (!js.trim()) return { nodes: [], edges: [], lang: "vue", error: "Kein <script> Block gefunden" };
  const res = analyzeJS(js, "vue");
  return { ...res, lang: "vue" };
}

// ===========================================================================
// Web — single HTML file with embedded <script> / <style>
// ===========================================================================
function analyzeWeb(code: string): AnalysisResult {
  const b = new Builder();

  // 1) JS from <script> blocks
  const scripts: string[] = [];
  const sRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sRe.exec(code))) scripts.push(sm[1]);
  const jsRes = analyzeJS(scripts.join("\n\n"), "web");
  for (const n of jsRes.nodes) {
    b.nodes.set(n.id, { ...n });
    if (!b.nameToId.has(n.label)) b.nameToId.set(n.label, n.id);
    (b as any).used?.add?.(n.id);
  }
  for (const e of jsRes.edges) b.edges.set(e.id, { ...e });
  const fnNames = new Set(
    jsRes.nodes.filter((n) => n.kind === "function" || n.kind === "method").map((n) => n.label)
  );

  // 2) HTML tags -> element nodes (#id) + inline handlers -> function edges
  const tagRe = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(code))) {
    const tag = tm[1].toLowerCase();
    if (tag === "script" || tag === "style") continue;
    const attrs = tm[2];
    const idM = /\bid\s*=\s*["']([\w-]+)["']/.exec(attrs);
    const handlers = [...attrs.matchAll(/\bon\w+\s*=\s*["']([^"']*)["']/g)];
    if (!idM && handlers.length === 0) continue;
    const label = idM ? `#${idM[1]}` : `<${tag}>`;
    const elId = b.addNode(label, "element", tag);
    if (!elId) continue;
    for (const h of handlers) {
      for (const c of h[1].matchAll(/([A-Za-z_]\w*)\s*\(/g)) {
        if (fnNames.has(c[1]) && b.nameToId.has(c[1]))
          b.addEdge(elId, b.nameToId.get(c[1])!, "call");
      }
    }
  }

  // 3) CSS rules -> style nodes, link #id selectors to element nodes
  const styleBlocks: string[] = [];
  const stRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let stm: RegExpExecArray | null;
  while ((stm = stRe.exec(code))) styleBlocks.push(stm[1]);
  const css = maskCode(styleBlocks.join("\n"), "c");
  const ruleRe = /([^{}]+)\{[^{}]*\}/g;
  let rm: RegExpExecArray | null;
  while ((rm = ruleRe.exec(css))) {
    const selector = rm[1].trim().replace(/\s+/g, " ");
    if (!selector || selector.length > 60) continue;
    const ids = [...selector.matchAll(/#([\w-]+)/g)].map((x) => x[1]);
    if (ids.length === 0) continue;
    const sid = b.addNode(selector, "style");
    if (!sid) continue;
    for (const id of ids) {
      const target = b.nameToId.get(`#${id}`);
      if (target) b.addEdge(sid, target, "uses");
    }
  }

  return b.result("web");
}

// ===========================================================================
// detection + dispatch
// ===========================================================================
export function detectLang(code: string): Lang {
  const c = code;
  if (/<template[\s>]/.test(c) && /<script[\s>]/i.test(c)) return "vue";
  if (/<!doctype html/i.test(c) || /<html[\s>]/i.test(c) || (/<style[\s>]/i.test(c) && /<\/style>/i.test(c)) || (/<body[\s>]/i.test(c)))
    return "web";
  // Arduino: hardware calls or the setup()/loop() pair (often without #include)
  if (
    /\b(pinMode|digitalWrite|digitalRead|analogWrite|analogRead)\s*\(/.test(c) ||
    (/\bvoid\s+setup\s*\(\s*\)/.test(c) && /\bvoid\s+loop\s*\(\s*\)/.test(c)) ||
    /\bSerial\s*\.\s*(begin|print|println)\b/.test(c)
  )
    return "arduino";
  if (/#\s*include\b/.test(c)) return "cpp";
  if (/\busing\s+System\b/.test(c) || /\bConsole\.(Write|Read)/.test(c) || /\bnamespace\s+\w+/.test(c)) return "csharp";
  if (/\bimport\s+'package:/.test(c) || /\bextends\s+State(less|ful)Widget\b/.test(c) || /\bWidget\s+build\s*\(/.test(c)) return "dart";
  if (/\bpackage\s+[\w.]+\s*;/.test(c) || /\bSystem\.out\./.test(c) || /\bpublic\s+(static\s+)?(class|void|int|String)\b/.test(c)) return "java";
  if (/\b(def|class)\s+\w+/.test(c) && !/[{};]\s*$/m.test(c.split("\n").slice(0, 5).join("\n")) && !/\bfunction\b/.test(c)) return "python";
  if (/\bdef\s+\w+\s*\(/.test(c) && !/\bfunction\b/.test(c)) return "python";
  if (/from\s+['"]react['"]/.test(c) || /\b(useState|useEffect|useRef|useMemo)\s*\(/.test(c) || /className\s*=/.test(c))
    return "react";
  if (/:\s*(string|number|boolean|void|any)\b/.test(c) || /\binterface\s+\w+/.test(c) || /\btype\s+\w+\s*=/.test(c)) return "ts";
  return "js";
}

export function analyze(code: string, lang: Lang = "auto"): AnalysisResult {
  if (!code.trim()) return { nodes: [], edges: [], lang: lang === "auto" ? "js" : lang };
  const resolved = lang === "auto" ? detectLang(code) : lang;
  try {
    switch (resolved) {
      case "js":
      case "ts":
      case "react":
        return analyzeJS(code, resolved);
      case "vue":
        return analyzeVue(code);
      case "web":
        return analyzeWeb(code);
      case "python":
        return analyzePython(code);
      case "java":
      case "cpp":
      case "arduino":
      case "csharp":
      case "dart":
        return analyzeCLike(code, resolved);
      default:
        return analyzeJS(code, "js");
    }
  } catch (e: any) {
    return { nodes: [], edges: [], error: e?.message ?? "Analyse-Fehler", lang: resolved };
  }
}

export const KIND_META: Record<NodeKind, { label: string; color: string }> = {
  function: { label: "FUNKTION", color: "#3b82f6" },
  method: { label: "METHODE", color: "#a855f7" },
  class: { label: "KLASSE", color: "#f59e0b" },
  import: { label: "IMPORT", color: "#22c55e" },
  data: { label: "DATEN", color: "#ef4444" },
  state: { label: "STATE", color: "#14b8a6" },
  element: { label: "ELEMENT", color: "#ec4899" },
  style: { label: "STYLE", color: "#0ea5e9" },
};
