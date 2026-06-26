# omp-ddgs-search

DuckDuckGo search provider for OMP. Registers `web_search`, `web_search_news`, and `fetch_url` tools.

## Setup

### 1. Install the plugin

```bash
omp plugin install github:Arcadia64/omp-ddgs-search
```

OMP auto-discovers the extension on the next session start.

### 2. Point it at your DDGS backend

Open OMP's config file and add a `ddgs.endpoint` setting:

- **File to edit:** `~/.omp/agent/config.yml`
  (on Windows that's `C:\Users\<you>\.omp\agent\config.yml`)

Add **one** of the following to that file:

```yaml
# nested block
ddgs:
  endpoint: https://your-ddgs-server.example.com
```

```yaml
# ...or a flat key (equivalent)
ddgs.endpoint: https://your-ddgs-server.example.com
```

### 3. Restart OMP

Restart OMP (or start a new session) for the change to take effect.

## How the endpoint is resolved

The plugin picks the endpoint in this order:

1. `ddgs.endpoint` in `~/.omp/agent/config.yml`
2. the `DDGS_ENDPOINT` environment variable
3. the default, `http://localhost:8091`

> Note: this key is read by the plugin directly from `config.yml`. It is **not** part of
> OMP's built-in `/settings` schema, so it will not show up in the `/settings` UI — edit
> `config.yml` by hand as shown above.
