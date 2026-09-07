<p align="center">
  <img src="assets/flowsery-logo.png" width="96" alt="Flowsery">
</p>

# Flowsery remote MCP server

A hosted, read-only MCP server for Flowsery. It puts your analytics and AI-detected issues inside whatever agent you already use. Grok, Claude, ChatGPT, Cursor, or anything else that speaks MCP over Streamable HTTP.

It runs as one Cloudflare Worker with no dependencies. Every tool is a GET against the [Flowsery Analytics API](https://flowsery.com/en/docs/api-introduction). Nothing in here can create, update or delete anything.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Flowsery/remote-mcp)

If you want to run MCP locally over stdio instead, use [flowsery-mcp](https://github.com/TarasShyn/flowsery-mcp). This repo is the hosted counterpart for agents that only accept a URL.

## What you get

| | |
| --- | --- |
| 17 read-only tools | `list_websites`, `get_realtime`, `get_overview`, `get_timeseries`, `list_issues`, `get_issue`, plus 11 segment tools (`get_pages`, `get_referrers`, `get_campaigns`, `get_countries`, `get_cities`, `get_regions`, `get_devices`, `get_browsers`, `get_operating_systems`, `get_hostnames`, `get_goals`). |
| 1 workspace key | A `flow_ws_` token covers every site in your workspace. |
| 3 prompts | A [system prompt](prompts/system-prompt.md), a [Monday health report](prompts/monday-report.md), and a [what broke this week](prompts/what-broke.md) triage prompt. They work in any agent. |

## Setup, about 20 minutes

### 1. Create a Flowsery API token

In Flowsery, open the workspace **API Tokens** page and create a token. It starts with `flow_ws_` and reaches every website in the workspace, so every call needs a `websiteId` or `domain`. The agent gets those from `list_websites`.

A website API key from **Settings > API** also works. It starts with `flow_` and is already scoped to one site, so no `websiteId` is needed. Either secret is shown once. Copy it right away.

### 2. Deploy the worker

```bash
git clone https://github.com/Flowsery/remote-mcp.git
cd remote-mcp
npm install
npx wrangler login
npx wrangler deploy
```

Then set the two secrets. `FLOWSERY_KEY` is your Flowsery token. `CONNECTOR_SECRET` is any long random string you invent, and it is what your agent will present to the worker.

```bash
npx wrangler secret put FLOWSERY_KEY
npx wrangler secret put CONNECTOR_SECRET
```

A quick way to mint the connector secret is `openssl rand -hex 32`.

Your Flowsery key never leaves the worker. The agent only ever sees the connector secret.

Deploy prints your worker URL, something like `https://flowsery-mcp.<you>.workers.dev`.

### 3. Check it

```bash
CONNECTOR_URL=https://flowsery-mcp.<you>.workers.dev \
CONNECTOR_SECRET=<your secret> \
npm run smoke
```

The smoke test runs `initialize`, counts the tools (expect 17), calls `list_websites`, and confirms a wrong secret gets a 401. If `list_websites` returns your domains, everything downstream works.

### 4. Connect your agent

The worker accepts the connector secret two ways. As a Bearer header, `Authorization: Bearer <CONNECTOR_SECRET>`, or as the last path segment of the URL, `https://flowsery-mcp.<you>.workers.dev/<CONNECTOR_SECRET>`. Use the header where the client has an auth field. Fall back to the path form where it does not.

**Grok.** Go to `grok.com/connectors`, choose New Connector, pick Custom, paste the worker URL, and put the connector secret in the authentication field. If it saves but no tools show up, Grok did not send the header. Use the path form of the URL instead.

**Claude (claude.ai).** Settings, Connectors, Add custom connector. Paste the path form of the URL. Claude's custom connector flow expects OAuth or no auth, so the secret goes in the URL.

**Claude Code.**

```bash
claude mcp add --transport http flowsery https://flowsery-mcp.<you>.workers.dev \
  --header "Authorization: Bearer <CONNECTOR_SECRET>"
```

**ChatGPT.** Settings, Connectors, Advanced, Developer mode, then Create. Paste the path form of the URL and pick No authentication.

**Cursor.** Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "flowsery": {
      "url": "https://flowsery-mcp.<you>.workers.dev",
      "headers": { "Authorization": "Bearer <CONNECTOR_SECRET>" }
    }
  }
}
```

**Anything else.** POST JSON-RPC 2.0 to the worker URL. `initialize`, `tools/list` and `tools/call` are the methods you need. See `scripts/smoke.sh` for the exact bodies.

### 5. Paste the system prompt

Copy [prompts/system-prompt.md](prompts/system-prompt.md) into the agent's custom instructions, then ask it "list my websites". Then try the [Monday report](prompts/monday-report.md) as a recurring task and [what broke this week](prompts/what-broke.md) whenever something feels off.

## Things that trip people up

**The API sort order is not impact.** `list_issues` sorts by `severity` (default) or `recency`. A medium issue that hit 140 sessions is usually more expensive than a critical that hit 3. The system prompt tells the agent to re-rank on `sessionsCount` every time. Skip that instruction and you get the same order your dashboard already shows.

**Workspace tokens need a website selector.** With a `flow_ws_` token, every call except `list_websites` needs `websiteId` or `domain`. A `flow_` website key does not, because it is already scoped.

**Dates default to the last 30 days.** Send `startAt` and `endAt` together for a specific range. Omit both for the trailing 30 days.

**`get_timeseries` needs `fields`.** It also takes `interval` (`hour`, `day`, `week`, `month`). The worker rejects a call without `fields` before it reaches Flowsery.

**Filter values are case-sensitive.** `filter_device=Mobile` works, `filter_device=mobile` returns an empty list. Use the values the segment tools return (`Mobile`, `Chrome`, `Android`).

**Nothing here writes.** If you want status changes and draft PRs, that happens in Flowsery itself.

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in both values
npm run dev                      # http://localhost:8787
CONNECTOR_URL=http://localhost:8787 CONNECTOR_SECRET=<value from .dev.vars> npm run smoke
```

## Deploy from GitHub Actions

`.github/workflows/deploy.yml` deploys when you trigger it from the Actions tab. Add `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID` as repository secrets. Worker secrets still need to be set once with `wrangler secret put`.

## How it works

```
Any MCP client  --JSON-RPC over HTTPS-->  Cloudflare Worker  --GET + Bearer flow_ws_-->  analytics.flowsery.com
```

The worker handles `initialize`, `ping`, `tools/list` and `tools/call`. Each tool maps to one GET on the Flowsery API. Arguments become query parameters, except `issueId`, which is substituted into the path. Responses are passed back verbatim as JSON text. Errors from Flowsery are returned with `isError: true` and the status code, so the agent can say what went wrong instead of guessing.

## License

MIT
