import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://etykyasaicfhrbbtbdfv.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5";
const DEMO_LOGIN_URL =
  process.env.NEXT_PUBLIC_DEMO_LOGIN_URL ??
  `${SUPABASE_URL}/functions/v1/agra-demo-login`;
const APP_ORIGIN =
  process.env.QA_APP_ORIGIN ??
  "https://paper-industry-dispatch-control.trafangularlaw01.chatgpt.site";
const N8N_MCP_URL =
  process.env.N8N_MCP_URL ?? "https://om420.app.n8n.cloud/mcp-server/http";
const N8N_MCP_ACCESS_TOKEN = process.env.N8N_MCP_ACCESS_TOKEN;
const OUTPUT_DIR = path.resolve(
  process.argv[2] ?? "qa/artifacts/baseline",
);

if (!N8N_MCP_ACCESS_TOKEN) {
  throw new Error("Set N8N_MCP_ACCESS_TOKEN only for this process.");
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/authorization|access.?token|refresh.?token|password|secret/i.test(key)) {
        return [key, "[REDACTED]"];
      }
      if (key === "apikey") return [key, "[PUBLIC KEY REDACTED]"];
      return [key, redact(item)];
    }),
  );
}

async function writeJson(name, value) {
  await writeFile(
    path.join(OUTPUT_DIR, name),
    `${JSON.stringify(redact(value), null, 2)}\n`,
    "utf8",
  );
}

async function openManagerSession() {
  const response = await fetch(DEMO_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: APP_ORIGIN,
    },
    body: JSON.stringify({ email: "manager@agra-demo.example" }),
  });
  const body = await response.json();
  if (!response.ok || !body.accessToken || !body.refreshToken) {
    throw new Error(body.message ?? "Manager demo session could not be opened.");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.setSession({
    access_token: body.accessToken,
    refresh_token: body.refreshToken,
  });
  if (error) throw error;
  return client;
}

function parseSse(text) {
  const line = text.split("\n").find((item) => item.startsWith("data: "));
  if (!line) throw new Error("n8n MCP returned no data event.");
  return JSON.parse(line.slice(6));
}

async function callN8n(name, args, id) {
  const response = await fetch(N8N_MCP_URL, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${N8N_MCP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`n8n MCP returned HTTP ${response.status}.`);
  const rpc = parseSse(await response.text());
  if (rpc.error) throw new Error(rpc.error.message ?? "n8n MCP call failed.");
  const result = rpc.result;
  if (result?.isError) {
    throw new Error(result.content?.[0]?.text ?? `${name} failed.`);
  }
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.find((item) => item.type === "text")?.text;
  return text ? JSON.parse(text) : result;
}

await mkdir(OUTPUT_DIR, { recursive: true });

const manager = await openManagerSession();
const [{ data: workspace, error: workspaceError }, { data: health, error: healthError }] =
  await Promise.all([
    manager.rpc("agra_load_workspace"),
    manager.rpc("agra_system_health"),
  ]);
if (workspaceError) throw workspaceError;
if (healthError) throw healthError;

const workflowSearch = await callN8n(
  "search_workflows",
  { limit: 200, sortBy: "updatedAt:desc" },
  1,
);
const workflows = (workflowSearch.data ?? []).filter((workflow) =>
  workflow.name.startsWith("Agra -"),
);
const workflowDetails = [];
const workflowExecutions = [];
for (const [index, workflow] of workflows.entries()) {
  const details = await callN8n(
    "get_workflow_details",
    { workflowId: workflow.id },
    100 + index,
  );
  const executions = await callN8n(
    "search_executions",
    { workflowId: workflow.id, limit: 25 },
    200 + index,
  );
  workflowDetails.push({ summary: workflow, details });
  workflowExecutions.push({ workflowId: workflow.id, name: workflow.name, executions });
}

const generatedAt = new Date().toISOString();
const metadata = {
  generatedAt,
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  appOrigin: APP_ORIGIN,
  supabaseProject: "etykyasaicfhrbbtbdfv",
  datasetVersion: workspace.demoState?.dataset_version ?? null,
  organization: {
    code: workspace.organization?.code,
    name: workspace.organization?.name,
    isDemo: workspace.organization?.is_demo,
  },
  counts: {
    profiles: workspace.team?.length ?? 0,
    customers: workspace.customers?.length ?? 0,
    products: workspace.products?.length ?? 0,
    batches: workspace.inventoryBatches?.length ?? 0,
    orders: workspace.orders?.length ?? 0,
    exceptions: workspace.exceptions?.length ?? 0,
    auditEvents: workspace.auditEvents?.length ?? 0,
    n8nWorkflows: workflows.length,
  },
};

await Promise.all([
  writeJson("metadata.json", metadata),
  writeJson("workspace-before.json", workspace),
  writeJson("system-health-before.json", health),
  writeJson("n8n-workflows-current.json", workflowDetails),
  writeJson("n8n-executions-before.json", workflowExecutions),
]);

await manager.auth.signOut();
console.log(`QA baseline exported to ${OUTPUT_DIR}`);
console.log(JSON.stringify(metadata, null, 2));
