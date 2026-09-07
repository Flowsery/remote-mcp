<p align="center">
  <img src="assets/flowsery-logo.png" width="96" alt="Flowsery">
</p>

# Flowsery Grok connector

A read-only MCP connector that puts Flowsery's analytics and AI-detected issues inside Grok. It runs as a single Cloudflare Worker with no dependencies. Every tool is a GET against the [Flowsery Analytics API](https://flowsery.com/en/docs/api-introduction). Nothing in here can create, update or delete anything.

It works with any MCP client that speaks Streamable HTTP (Claude, ChatGPT, Cursor), but the setup below is written for Grok custom connectors.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Flowsery/grok-connector)

## What you get

| | |
| --- | --- |
| 17 read-only tools | `list_websites`, `get_realtime`, `get_overview`, `get_timeseries`, `list_issues`, `get_issue`, plus 11 segment tools (`get_pages`, `get_referrers`, `get_campaigns`, `get_countries`, `get_cities`, `get_regions`, `get_devices`, `get_browsers`, `get_operating_systems`, `get_hostnames`, `get_goals`). |
| 1 workspace key | A `flow_ws_` token covers every site in your workspace. |
| 3 prompts | A [system prompt](prompts/system-prompt.md), a [Monday health report](prompts/monday-report.md), and a [what broke this week](prompts/what-broke.md) triage prompt. |

## Setup, about 20 minutes

### 1. Create a Flowsery API token

In Flowsery, open the workspace **API Tokens** page and create a token. It starts with `flow_ws_` and reaches every website in the workspace, so every call needs a `websiteId` or `domain`. The agent gets those from `list_websites`.

A website API key from **Settings > API** also works. It starts with `flow_` and is already scoped to one site, so no `websiteId` is needed. Either secret is shown once. Copy it right away.

### 2. Deploy the worker

```bash
git clone https://github.com/Flowsery/grok-connector.git
cd grok-connector
npm install
npx wrangler login
npx wrangler deploy
```

Then set the two secrets. `FLOWSERY_KEY` is your Flowsery token. `CONNECTOR_SECRET` is any long random string you invent, and it is what Grok will present to the worker.

```bash
npx wrangler secret put FLOWSERY_KEY
npx wrangler secret put CONNECTOR_SECRET
```

A quick way to mint the connector secret is `openssl rand -hex 32`.

Your Flowsery key never leaves the worker. Grok only ever sees the connector secret.

Deploy prints your worker URL, something like `https://flowsery-grok-connector.<you>.workers.dev`.

### 3. Check it

```bash
CONNECTOR_URL=https://flowsery-grok-connector.<you>.workers.dev \
CONNECTOR_SECRET=<your secret> \
npm run smoke
```

The smoke test runs `initialize`, counts the tools (expect 17), calls `list_websites`, and confirms a wrong secret gets a 401. If `list_websites` returns your domains, everything downstream works.

### 4. Add it to Grok

Go to `grok.com/connectors`, choose **New Connector**, pick **Custom**, paste the worker URL, and put your `CONNECTOR_SECRET` in the authentication field.

If the connector saves but no tools show up, Grok did not send the secret as a Bearer header. Append it to the URL as a final path segment instead, `https://flowsery-grok-connector.<you>.workers.dev/<CONNECTOR_SECRET>`. The worker accepts either.

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
Grok  --JSON-RPC over HTTPS-->  Cloudflare Worker  --GET + Bearer flow_ws_-->  analytics.flowsery.com
```

The worker handles `initialize`, `ping`, `tools/list` and `tools/call`. Each tool maps to one GET on the Flowsery API. Arguments become query parameters, except `issueId`, which is substituted into the path. Responses are passed back verbatim as JSON text. Errors from Flowsery are returned with `isError: true` and the status code, so the agent can say what went wrong instead of guessing.

## License

MIT
