# omp-ddgs-search

DuckDuckGo search provider for OMP. Registers `web_search`, `web_search_news`, and `fetch_url` tools.

## Installation

```bash
omp plugin install github:Arcadia64/omp-ddgs-search
```

OMP auto-discovers the extension on next session start.

## Configuration

By default this uses `http://localhost:8091`. To configure a custom DDGS endpoint, add to `~/.omp/agent/config.yml`:

```yaml
ddgs:
  endpoint: "https://your-ddgs-server.example.com"
```
