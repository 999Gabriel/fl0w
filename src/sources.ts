// ===========================================================================
// sources.ts — ways to load a whole project into the browser (no backend)
//   1. GitHub repo URL  -> public REST API (git/trees + raw contents)
//   2. dropped folder / files -> FileList from <input webkitdirectory>
//   3. pasted multi-file text -> "// ==== path ====" separators
// ===========================================================================
import { shouldAnalyze, type ProjectFile } from "./project";

const MAX_FILE_BYTES = 200_000; // skip huge generated files
const MAX_FETCH = 1500; // hard ceiling on files actually downloaded

// ---------------------------------------------------------------------------
// 1) GitHub
// ---------------------------------------------------------------------------
interface ParsedRepo {
  owner: string;
  repo: string;
  ref?: string;
  subdir?: string;
}

export function parseGitHubUrl(input: string): ParsedRepo | null {
  const s = input.trim().replace(/\.git$/, "");
  // owner/repo shorthand
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(s);
  if (short) return { owner: short[1], repo: short[2] };

  try {
    const u = new URL(s);
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    // /owner/repo/tree/<ref>/<subdir...>
    if (parts[2] === "tree" && parts[3]) {
      return { owner, repo, ref: parts[3], subdir: parts.slice(4).join("/") || undefined };
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

async function ghJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 403)
    throw new Error("GitHub API rate limit erreicht (60/h ohne Token). Später erneut versuchen.");
  if (res.status === 404) throw new Error("Repository oder Branch nicht gefunden.");
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

export interface RepoFetchResult {
  files: ProjectFile[];
  totalCandidates: number; // analyzable files found in the tree
  fetched: number; // files actually downloaded
}

export async function fetchGitHubRepo(
  input: string,
  onProgress?: (msg: string) => void
): Promise<RepoFetchResult> {
  const parsed = parseGitHubUrl(input);
  if (!parsed) throw new Error("Ungültiger GitHub-Link.");
  const { owner, repo, subdir } = parsed;
  let ref = parsed.ref;

  if (!ref) {
    onProgress?.("Default-Branch ermitteln…");
    const meta = await ghJson(`https://api.github.com/repos/${owner}/${repo}`);
    ref = meta.default_branch ?? "main";
  }

  onProgress?.(`Dateibaum laden (${ref})…`);
  const tree = await ghJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`
  );

  let blobs: { path: string; size: number }[] = (tree.tree ?? [])
    .filter((t: any) => t.type === "blob")
    .map((t: any) => ({ path: t.path as string, size: t.size ?? 0 }));

  if (subdir) {
    const pfx = subdir.endsWith("/") ? subdir : subdir + "/";
    blobs = blobs
      .filter((b) => b.path.startsWith(pfx))
      .map((b) => ({ ...b, path: b.path.slice(pfx.length) }));
  }

  const candidates = blobs.filter(
    (b) => shouldAnalyze(b.path) && b.size <= MAX_FILE_BYTES
  );
  // prioritize smaller files so we cover more of the project under the cap
  const wanted = [...candidates].sort((a, b) => a.size - b.size).slice(0, MAX_FETCH);

  if (wanted.length === 0) throw new Error("Keine analysierbaren Quelldateien im Repo.");

  // fetch raw contents in parallel (bounded)
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/`;
  const rawPrefix = subdir ? base + (subdir.endsWith("/") ? subdir : subdir + "/") : base;
  const out: ProjectFile[] = [];
  let done = 0;
  const CONCURRENCY = 16;
  let idx = 0;

  async function worker() {
    while (idx < wanted.length) {
      const my = wanted[idx++];
      try {
        const r = await fetch(rawPrefix + my.path);
        if (r.ok) {
          const content = await r.text();
          out.push({ path: my.path, content });
        }
      } catch {
        /* skip unreadable file */
      }
      done++;
      if (done % 25 === 0 || done === wanted.length)
        onProgress?.(`Dateien laden ${done}/${wanted.length}…`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { files: out, totalCandidates: candidates.length, fetched: out.length };
}

// ---------------------------------------------------------------------------
// 2) dropped folder / files
// ---------------------------------------------------------------------------
export async function readFileList(files: FileList | File[]): Promise<ProjectFile[]> {
  const arr = Array.from(files);
  const out: ProjectFile[] = [];
  await Promise.all(
    arr.map(async (file) => {
      // webkitRelativePath preserves the folder structure when a dir is dropped
      const path = (file as any).webkitRelativePath || file.name;
      if (!shouldAnalyze(path)) return;
      if (file.size > MAX_FILE_BYTES) return;
      try {
        const content = await file.text();
        // strip the top-level folder so paths are repo-relative-ish
        const rel = path.includes("/") ? path.split("/").slice(1).join("/") : path;
        out.push({ path: rel || path, content });
      } catch {
        /* skip */
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------------------
// 3) pasted multi-file text
//    Splits on lines that look like a file header, e.g.
//      // ==== src/api.ts ====        or
//      // path: src/api.ts            or
//      ===== src/api.ts =====
//    Anything before the first header becomes "main".
// ---------------------------------------------------------------------------
const HEADER_RE =
  /^\s*(?:\/\/|#|--|;|\/\*)?\s*(?:={2,}|-{2,}|file:|path:)?\s*([\w./\\-]+\.[A-Za-z][\w]*)\s*(?:={2,}|-{2,}|\*\/)?\s*$/;

export function parsePastedProject(text: string): ProjectFile[] {
  const lines = text.split("\n");
  const files: ProjectFile[] = [];
  let curPath: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (curPath && buf.join("").trim()) files.push({ path: curPath, content: buf.join("\n") });
    buf = [];
  };

  for (const line of lines) {
    const m = HEADER_RE.exec(line);
    // treat as a header only if it clearly names a code file path and the line
    // is "thin" (a separator, not real code)
    const looksHeader =
      m &&
      /[./\\]/.test(m[1]) &&
      (/[=\-]{2,}/.test(line) || /\b(file|path):/i.test(line) || /^\s*\/\//.test(line));
    if (looksHeader) {
      flush();
      curPath = m![1].replace(/\\/g, "/");
      continue;
    }
    buf.push(line);
  }
  flush();
  return files;
}
