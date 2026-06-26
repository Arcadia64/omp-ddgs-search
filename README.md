# omp-ddgs-search

DuckDuckGo search provider for OMP. Registers `web_search`, `web_search_news`, and `fetch_url` tools.

## Setup

### 1. Install the plugin

```bash
omp plugin install github:Arcadia64/omp-ddgs-search
```

OMP auto-discovers the extension on the next session start.

### 2. Configure the endpoint

Run `/settings` in OMP, go to the **Plugins** tab, and set the **endpoint** for `omp-ddgs-search` to your DDGS backend URL.

Restart OMP (or start a new session) for the change to take effect.

## How the endpoint is resolved

First match wins:

1. the **endpoint** plugin setting (configured in `/settings` → Plugins)
2. `ddgs.endpoint` in `~/.omp/agent/config.yml`
3. the `DDGS_ENDPOINT` environment variable
4. the default, `http://localhost:8091`
