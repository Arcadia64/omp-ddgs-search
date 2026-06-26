
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface SearchEntry {
  title: string;
  link: string;
  snippet?: string;
}

interface FetchResponseData {
  url: string;
  title: string;
  text: string;
  rendered?: boolean;
  error?: string;
}

interface DdgsConfig {
  endpoint: string;
  headers: Record<string, string>;
}

const DEFAULT_ENDPOINT = "http://localhost:8091";
const HEADERS: Record<string, string> = { Accept: "application/json", "User-Agent": "OMP-DdgsSearch/1.0" };

// Must match the package "name"; OMP keys plugin settings by it.
const PLUGIN_NAME = "omp-ddgs-search";

// Read the endpoint from OMP's plugin-settings store — the values written by
// `omp plugin config set omp-ddgs-search endpoint <url>` and the plugin-manager
// TUI editor. They live in ~/.omp/plugins/omp-plugins.lock.json under
// settings[<plugin>]. (OMP does not expose these to extensions at runtime, so
// we read the file directly.)
function endpointFromPluginConfig(): string | undefined {
  try {
    const registryPath = join(homedir(), ".omp", "plugins", "omp-plugins.lock.json");
    const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as {
      settings?: Record<string, Record<string, unknown>>;
    };
    const ep = parsed?.settings?.[PLUGIN_NAME]?.["endpoint"];
    if (typeof ep === "string" && ep.trim()) return ep.trim();
  } catch {
    /* registry missing or unreadable — fall through */
  }
  return undefined;
}

function stripScalar(v: string): string {
  let s = v.trim();
  // Drop a trailing inline comment ( ` # ...`).
  const hash = s.indexOf(" #");
  if (hash >= 0) s = s.slice(0, hash).trim();
  // Strip matching surrounding quotes.
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

// Read the DDGS endpoint from OMP's own config file (~/.omp/agent/config.yml).
// Add it by hand as either a flat key or a nested block:
//
//   ddgs.endpoint: http://my-host:8091
//
//   ddgs:
//     endpoint: http://my-host:8091
function endpointFromConfigYml(): string | undefined {
  try {
    const raw = readFileSync(join(homedir(), ".omp", "agent", "config.yml"), "utf8");

    // OMP runs on Bun — prefer its YAML parser when present.
    const bun = (globalThis as { Bun?: { YAML?: { parse(s: string): unknown } } }).Bun;
    if (bun?.YAML?.parse) {
      const parsed = bun.YAML.parse(raw);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const flat = obj["ddgs.endpoint"];
        if (typeof flat === "string" && flat.trim()) return flat.trim();
        const ddgs = obj["ddgs"];
        if (ddgs && typeof ddgs === "object") {
          const ep = (ddgs as Record<string, unknown>)["endpoint"];
          if (typeof ep === "string" && ep.trim()) return ep.trim();
        }
      }
    }

    // Fallback line scan (no YAML lib): flat `ddgs.endpoint:` or `endpoint:` under a `ddgs:` block.
    let inDdgsBlock = false;
    for (const line of raw.split(/\r?\n/)) {
      const flat = line.match(/^ddgs\.endpoint\s*:\s*(.+)$/);
      if (flat) return stripScalar(flat[1]);
      if (/^ddgs\s*:\s*$/.test(line)) { inDdgsBlock = true; continue; }
      if (inDdgsBlock) {
        if (/^\S/.test(line)) { inDdgsBlock = false; continue; } // dedent → left the block
        const nested = line.match(/^\s+endpoint\s*:\s*(.+)$/);
        if (nested) return stripScalar(nested[1]);
      }
    }
  } catch {
    /* config.yml missing or unreadable — fall through to env/default */
  }
  return undefined;
}

function loadConfig(): DdgsConfig {
  // Priority: OMP plugin settings (omp plugin config / TUI editor)
  //         > config.yml (ddgs.endpoint)
  //         > DDGS_ENDPOINT env
  //         > hardcoded default.
  const fromPlugin = endpointFromPluginConfig();
  if (fromPlugin) return { endpoint: fromPlugin, headers: HEADERS };
  const fromYml = endpointFromConfigYml();
  if (fromYml) return { endpoint: fromYml, headers: HEADERS };
  const envEp = process.env.DDGS_ENDPOINT;
  if (typeof envEp === "string" && envEp.trim()) return { endpoint: envEp.trim(), headers: HEADERS };
  return { endpoint: DEFAULT_ENDPOINT, headers: HEADERS };
}



function formatResults(entries: SearchEntry[]): string {
  if (entries.length === 0) return "No results found.";
  const parts: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const titleEscaped = e.title.replace(/([*_`~[\]()])/g, "\\$1");
    const linkEscaped = e.link.replace(/([*_`~[\]()])/g, "\\$1");
    let snippetText = "";
    if (e.snippet) {
      const raw = e.snippet.trim();
      snippetText = raw.length > 250 ? `${raw.slice(0, 247)}...` : raw;
    }
    parts.push(`${i + 1}. **${titleEscaped}**\n   ${linkEscaped}\n   ${snippetText}`);
  }
  return parts.join("\n\n");
}

function extractString(obj: unknown, key: string, fallback: string): string {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : fallback;
  }
  return fallback;
}

function extractBool(obj: unknown, key: string, fallback: boolean): boolean {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "boolean" ? v : fallback;
  }
  return fallback;
}

function extractStringArray(obj: unknown, key: string): SearchEntry[] {
  if (!obj || typeof obj !== "object") return [];
  const val = (obj as Record<string, unknown>)[key];
  if (!Array.isArray(val)) return [];
  const out: SearchEntry[] = [];
  for (const item of val) {
    if (item && typeof item === "object" && "title" in item && "link" in item) {
      const o = item as Record<string, unknown>;
      out.push({
        title: extractString(o, "title", ""),
        link: extractString(o, "link", ""),
        snippet: typeof (o["snippet"] as unknown) === "string" ? (o["snippet"] as string) : undefined,
      });
    }
  }
  return out;
}

interface OmpExtensionApi {
  registerTool(def: {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(
      id: string,
      params: Record<string, unknown>,
      signal: AbortSignal | undefined,
      onUpdate: ((update: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }) => void) | undefined,
      ctx: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
  }): void;
  zod: { object(schema: Record<string, unknown>): Record<string, unknown> };
}

export default function ddgsPlugin(pi: OmpExtensionApi): void {
  const z = pi.zod;

  // ---- web_search ---------------------------------------------------------

  pi.registerTool({
    name: "web_search",
    label: "Web Search (DDGS)",
    description: "Search the web using DuckDuckGo via configurable DDGS backend.",
    parameters: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().int().min(1).max(20).optional().default(10).describe("Max results (1-20)"),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const cfg = loadConfig();
      const query = extractString(params, "query", "");
      if (query.length === 0) return { content: [{ type: "text", text: "Error: empty query" }] };
      const limitRaw = extractString(params, "limit", "10");
      const limit = parseInt(limitRaw, 10);

      const urlObj = new URL(`${cfg.endpoint}/search`);
      urlObj.searchParams.set("q", query);
      urlObj.searchParams.set("max_results", isNaN(limit) ? "10" : String(limit));

      const res = await fetch(urlObj.toString(), { headers: cfg.headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { content: [{ type: "text", text: `DDGS search returned ${res.status}` }] };

      let raw: unknown;
      try { raw = JSON.parse(await res.text()); } catch { return { content: [{ type: "text", text: "DDGS returned invalid JSON" }] }; }
      const results = extractStringArray(raw, "results");
      return { content: [{ type: "text", text: formatResults(results) }], details: { resultCount: results.length, query } };
    },
  });

  // ---- web_search_news ----------------------------------------------------

  pi.registerTool({
    name: "web_search_news",
    label: "Search News (DDGS)",
    description: "Search news via DuckDuckGo via configurable DDGS backend.",
    parameters: z.object({
      query: z.string().describe("News search query"),
      limit: z.number().int().min(1).max(20).optional().default(10).describe("Max results (1-20)"),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const cfg = loadConfig();
      const query = extractString(params, "query", "");
      if (query.length === 0) return { content: [{ type: "text", text: "Error: empty query" }] };
      const limitRaw = extractString(params, "limit", "10");
      const limit = parseInt(limitRaw, 10);

      const urlObj = new URL(`${cfg.endpoint}/search/news`);
      urlObj.searchParams.set("q", query);
      urlObj.searchParams.set("max_results", isNaN(limit) ? "10" : String(limit));

      const res = await fetch(urlObj.toString(), { headers: cfg.headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { content: [{ type: "text", text: `DDGS news search returned ${res.status}` }] };

      let raw: unknown;
      try { raw = JSON.parse(await res.text()); } catch { return { content: [{ type: "text", text: "DDGS news returned invalid JSON" }] }; }
      const results = extractStringArray(raw, "results");
      return { content: [{ type: "text", text: formatResults(results) }], details: { resultCount: results.length, query } };
    },
  });

  // ---- fetch_url ----------------------------------------------------------

  pi.registerTool({
    name: "fetch_url",
    label: "Fetch URL (DDGS)",
    description: "Fetch a web page and extract clean text via DDGS backend. Set render=true for JS-heavy pages.",
    parameters: z.object({
      url: z.string().url().describe("URL to fetch"),
      render: z.boolean().optional().default(false).describe("Force headless browser rendering"),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const cfg = loadConfig();
      const targetUrl = extractString(params, "url", "");
      if (targetUrl.length === 0) return { content: [{ type: "text", text: "Error: empty URL" }] };
      const renderRaw = extractString(params, "render", "false");
      const doRender = renderRaw === "true";

      const urlObj = new URL(`${cfg.endpoint}/fetch`);
      urlObj.searchParams.set("url", targetUrl);
      if (doRender) urlObj.searchParams.set("render", "true");

      const res = await fetch(urlObj.toString(), { headers: cfg.headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) return { content: [{ type: "text", text: `DDGS fetch returned ${res.status}` }] };

      let raw: unknown;
      try { raw = JSON.parse(await res.text()); } catch { return { content: [{ type: "text", text: "DDGS fetch returned invalid JSON" }] }; }

      const urlField = extractString(raw, "url", targetUrl);
      const titleVal = extractString(raw, "title", urlField);
      const textField = extractString(raw, "text", "");
      const renderedVal = extractBool(raw, "rendered", false);
      const errorVal = extractString(raw, "error", "");

      if (errorVal.length > 0) return { content: [{ type: "text", text: `Error fetching ${urlField}: ${errorVal}` }] };

      const renderedTag = renderedVal ? " [rendered]" : "";
      const titleEscaped = titleVal.replace(/([*_`~[\]()])/g, "\\$1");
      const output = `# ${titleEscaped}${renderedTag}\n\nURL: ${urlField}\n\n${textField}`;
      return { content: [{ type: "text", text: output }], details: { url: urlField, title: titleVal, rendered: renderedVal } };
    },
  });
}
