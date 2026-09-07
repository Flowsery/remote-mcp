const BASE = "https://analytics.flowsery.com/analytics/api/v1";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SEGMENTS = [
  "pages", "referrers", "campaigns", "countries", "cities", "regions",
  "devices", "browsers", "operating-systems", "hostnames", "goals",
];

const COMMON = {
  websiteId: { type: "string", description: "Website id from list_websites. Required with a flow_ws_ workspace token unless domain is given." },
  domain: { type: "string", description: "Website domain, as an alternative to websiteId." },
  startAt: { type: "string", description: "ISO 8601 start, e.g. 2026-09-01T00:00:00Z. Defaults to the last 30 days when omitted." },
  endAt: { type: "string", description: "ISO 8601 end. Send together with startAt." },
  timezone: { type: "string", description: "IANA timezone, e.g. Europe/Warsaw. Defaults to the site's timezone." },
  limit: { type: "number", description: "1 to 1000. Default 100." },
  offset: { type: "number", description: "Rows to skip for pagination. Default 0." },
};

const TOOLS = [
  {
    name: "list_websites",
    path: "/websites",
    props: {},
    description: "List every website the token can reach. Call this first to get websiteId values.",
  },
  {
    name: "get_realtime",
    path: "/realtime",
    props: { websiteId: COMMON.websiteId, domain: COMMON.domain },
    description: "Visitors active in the last 5 minutes.",
  },
  {
    name: "get_overview",
    path: "/overview",
    props: {
      websiteId: COMMON.websiteId, domain: COMMON.domain,
      startAt: COMMON.startAt, endAt: COMMON.endAt, timezone: COMMON.timezone,
      fields: { type: "string", description: "Comma separated: visitors, sessions, bounce_rate, avg_session_duration, currency, revenue, revenue_per_visitor, conversion_rate. Omit for all." },
    },
    description: "Aggregated totals for a date range. Call twice to compare two periods.",
  },
  {
    name: "get_timeseries",
    path: "/timeseries",
    required: ["fields"],
    props: {
      ...COMMON,
      fields: { type: "string", description: "Required. Comma separated: visitors, sessions, revenue, conversion_rate, name." },
      interval: { type: "string", description: "hour, day, week or month. Default day." },
    },
    description: "Metrics over time, bucketed by hour, day, week or month.",
  },
  {
    name: "list_issues",
    path: "/issues",
    props: {
      websiteId: COMMON.websiteId, domain: COMMON.domain, limit: COMMON.limit, offset: COMMON.offset,
      status: { type: "string", description: "open, in_progress, resolved or suspended. Omit for all except suspended." },
      severity: { type: "string", description: "low, medium, high or critical." },
      sort: { type: "string", description: "severity (default) or recency. Neither equals impact: re-rank on sessionsCount yourself." },
      search: { type: "string", description: "Free text matched against title and description. Max 200 chars." },
    },
    description: "AI-detected issues from analysed session recordings. Each carries severity, sessionsCount, stepsToReplicate and sampleRecordingId.",
  },
  {
    name: "get_issue",
    path: "/issues/{issueId}",
    required: ["issueId"],
    props: {
      issueId: { type: "string", description: "Issue id from list_issues, e.g. iss_64f1c2a9e8b4d90012ab34cd" },
      websiteId: COMMON.websiteId, domain: COMMON.domain,
    },
    description: "Full detail for one issue: every flagged occurrence, the recordings behind it, and team comments.",
  },
  ...SEGMENTS.map((segment) => ({
    name: "get_" + segment.replace(/-/g, "_"),
    path: "/" + segment,
    props: COMMON,
    description: "Analytics segmented by " + segment.replace(/-/g, " ") + ". Supports filter_ prefixed query filters such as filter_device=Mobile or filter_browser=Chrome. Filter values are case-sensitive and match the values the segment tools return.",
  })),
];

const jsonHeaders = { "content-type": "application/json" };

const rpcResult = (id, result) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: jsonHeaders });

const rpcError = (id, code, message, status = 200) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { status, headers: jsonHeaders });

const toolResult = (id, text, isError = false) =>
  rpcResult(id, { content: [{ type: "text", text }], isError });

function buildUrl(tool, args) {
  let path = tool.path;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(args || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (path.includes(`{${key}}`)) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
      continue;
    }
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return BASE + path + (suffix ? "?" + suffix : "");
}

async function callFlowsery(tool, args, key) {
  const response = await fetch(buildUrl(tool, args), {
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
  });
  const body = await response.text();
  return { ok: response.ok, text: response.ok ? body : `Flowsery returned ${response.status}. ${body}` };
}

function presentedSecret(request) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  return new URL(request.url).pathname.split("/").filter(Boolean).pop() || "";
}

function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  if (bytesA.byteLength !== bytesB.byteLength) return false;
  return crypto.subtle.timingSafeEqual(bytesA, bytesB);
}

function listTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", properties: tool.props, required: tool.required || [] },
  }));
}

async function handleRpc(message, env) {
  const { id = null, method, params = {} } = message;

  if (typeof method !== "string") return rpcError(id, -32600, "Invalid request");
  if (method.startsWith("notifications/")) return new Response(null, { status: 202 });

  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "flowsery-readonly", version: "1.1.0" },
        instructions: "Read-only access to Flowsery analytics and AI-detected issues. Call list_websites first when using a workspace token. Re-rank issues by sessionsCount, not by the API sort order.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: listTools() });
    case "tools/call": {
      const tool = TOOLS.find((candidate) => candidate.name === params.name);
      if (!tool) return toolResult(id, "Unknown tool " + params.name, true);
      const missing = (tool.required || []).filter((field) => !params.arguments?.[field]);
      if (missing.length) return toolResult(id, "Missing required argument(s): " + missing.join(", "), true);
      const { ok, text } = await callFlowsery(tool, params.arguments, env.FLOWSERY_KEY);
      return toolResult(id, text, !ok);
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, "Method not found: " + method);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("Flowsery read-only MCP connector. POST JSON-RPC to this URL.", { status: 405, headers: { Allow: "POST" } });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

    if (!env.CONNECTOR_SECRET || !env.FLOWSERY_KEY) {
      return new Response("Worker secrets CONNECTOR_SECRET and FLOWSERY_KEY are not set.", { status: 500 });
    }
    if (!timingSafeEqual(presentedSecret(request), env.CONNECTOR_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let message;
    try {
      message = await request.json();
    } catch {
      return rpcError(null, -32700, "Parse error", 400);
    }
    if (Array.isArray(message)) return rpcError(null, -32600, "Batch requests are not supported", 400);

    return handleRpc(message, env);
  },
};
