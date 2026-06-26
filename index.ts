// -- OMP extension: DuckDuckGo search via configurable remote backend ------

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

function loadConfig(): DdgsConfig {
  const defaultEndpoint = "http://localhost:8091";
  
  // Look for config in ~/.omp/agent/ddgs.json
  const home = os.homedir();
  if (!home) return { endpoint: defaultEndpoint, headers: { Accept: "application/json", "User-Agent": "OMP-DdgsSearch/1.0" } };
  const configPath = path.join(home, ".omp", "agent", "ddgs.json");
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (raw && typeof raw === "object" && "endpoint" in raw && typeof raw.endpoint === "string") {
        return { endpoint: raw.endpoint, headers: { Accept: "application/json", "User-Agent": "OMP-DdgsSearch/1.0" } };
      }
    }
  } catch { /* ignore parse errors, use default */ }
  
  return { endpoint: defaultEndpoint, headers: { Accept: "application/json", "User-Agent": "OMP-DdgsSearch/1.0" } };
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
    async execute(
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
    async execute(_id, params, _signal) {
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
    async execute(_id, params, _signal) {
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
    async execute(_id, params, _signal) {
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
