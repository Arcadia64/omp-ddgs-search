# omp-ddgs-search

DuckDuckGo search provider for OMP. Registers `web_search`, `web_search_news`, and `fetch_url` tools.

## Setup

### 1. Install the plugin

```bash
omp plugin install github:Arcadia64/omp-ddgs-search
```

OMP auto-discovers the extension on the next session start.

### 2. Set the DDGS backend endpoint

The plugin declares an `endpoint` setting, so you can configure it from inside OMP:

**Option A — TUI (recommended)**

Open the plugin manager, select **omp-ddgs-search**, highlight `endpoint`, press **Enter** to edit, and type your URL.

**Option B — CLI**

```bash
omp plugin config set  omp-ddgs-search endpoint https://your-ddgs-server.example.com
omp plugin config get  omp-ddgs-search endpoint
omp plugin config list omp-ddgs-search
```

### 3. Restart OMP

Restart OMP (or start a new session) for the change to take effect.

## How the endpoint is resolved

The plugin picks the endpoint in this order (first match wins):

1. **OMP plugin setting** `endpoint` (set via the TUI / `omp plugin config`) —
   stored in `~/.omp/plugins/omp-plugins.lock.json`
2. `ddgs.endpoint` in `~/.omp/agent/config.yml`, e.g.:
   ```yaml
   ddgs:
     endpoint: https://your-ddgs-server.example.com
   ```
   (a flat `ddgs.endpoint: ...` key works too)
3. the `DDGS_ENDPOINT` environment variable
4. the default, `http://localhost:8091`

> Note: OMP doesn't expose plugin settings to extensions at runtime, so the plugin reads
> the value directly from `omp-plugins.lock.json`. This setting is part of OMP's
> **plugin** settings (`omp plugin config`), not the global `/settings` schema, so it
> won't appear in the `/settings` UI.
