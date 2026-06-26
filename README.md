# omp-ddgs-search

DuckDuckGo search provider for Open-Managed Pi. Registers `web_search`, `web_search_news`, and `fetch_url` tools via a configurable remote DDGS backend.

## Prerequisites

A running DDGS backend (e.g. [`Arcadia64/ddgs-api`](https://github.com/Arcadia64/ddgs-api) or any service exposing the same API). The backend must support these endpoints:

| Endpoint | Method | Params | Response |
|---|---|---|---|
| `/search` | GET | `q`, `max_results` | `{"results": [{"title", "link", "snippet"}, ...]}` |
| `/search/news` | GET | `q`, `max_results` | Same as `/search` |
| `/fetch` | GET | `url`, `render?` | `{"url", "title", "text", "rendered?", "error?"}` |

## Installation

**From GitHub:**
```bash
omp plugin install github:Arcadia64/omp-ddgs-search
```

**From npm (after publishing):**
```bash
omp plugin install omp-ddgs-search
```

OMP auto-discovers the extension at `~/.omp/plugins/node_modules/omp-ddgs-search/` on next session start. No further configuration needed unless you want to change the backend URL.

## Configuration

Edit `config.json` in the installed package directory (or the source repo):

```json
{
  "endpoint": "http://localhost:8091"
}
```

The extension reads this file at startup from its own directory (`__dirname`). The default is `http://localhost:8091`.

## Tools

### `web_search`

Search the web via DDGS. Shadow OMP's built-in — replace it when installed and the built-in is disabled.

### `web_search_news`

Search for news headlines via DDGS.

### `fetch_url`

Fetch and extract clean text from any URL via the DDGS backend. Supports optional headless rendering for JS-heavy pages.
