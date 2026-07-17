import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://etykyasaicfhrbbtbdfv.supabase.co";
export const SUPABASE_KEY =
  "sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5";
export const ACTION_URL =
  "https://om420.app.n8n.cloud/webhook/agra-operations-action";
export const DEMO_LOGIN_URL = `${SUPABASE_URL}/functions/v1/agra-demo-login`;
export const ACTION_WORKFLOW_ID = "UZvuu1IPh20GjfHD";

export const ROLE_EMAILS = {
  Manager: "manager@agra-demo.example",
  Sales: "sales@agra-demo.example",
  "Stock & quality": "quality@agra-demo.example",
  Packing: "packing@agra-demo.example",
  Supervisor: "supervisor@agra-demo.example",
} as const;

export const ROLE_HEADLINES = {
  Manager: "Operations at a glance",
  Sales: "Orders waiting for you",
  "Stock & quality": "Stock and quality work",
  Packing: "Packing and handover work",
  Supervisor: "Approvals and issues",
} as const;

export type RoleLabel = keyof typeof ROLE_EMAILS;

type ActionResult = {
  ok: boolean;
  code: string;
  message: string;
  entityId?: string;
  newStatus?: string;
  idempotentReplay?: boolean;
};

export type ActionEvidence = {
  action: string;
  requestId: string;
  httpStatus: number;
  response: ActionResult;
  n8nExecution?: {
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    stoppedAt: string | null;
  } | null;
};

export async function openRole(page: Page, role: RoleLabel) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`^${role}$`) }).click();
  await expect(page.getByRole("heading", { name: ROLE_HEADLINES[role] })).toBeVisible({
    timeout: 30_000,
  });
}

export async function openApiSession(role: RoleLabel): Promise<SupabaseClient> {
  const origin =
    process.env.QA_APP_ORIGIN ??
    "https://paper-industry-dispatch-control.trafangularlaw01.chatgpt.site";
  const response = await fetch(DEMO_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email: ROLE_EMAILS[role] }),
  });
  const body = (await response.json()) as {
    accessToken?: string;
    refreshToken?: string;
    message?: string;
  };
  if (!response.ok || !body.accessToken || !body.refreshToken) {
    throw new Error(body.message ?? `Could not open ${role} API session.`);
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

export async function loadWorkspace(client: SupabaseClient) {
  const { data, error } = await client.rpc("agra_load_workspace");
  if (error) throw error;
  return data;
}

export async function callAction(
  client: SupabaseClient,
  action: string,
  orderId: string | null = null,
  payload: Record<string, unknown> = {},
  requestId = crypto.randomUUID(),
): Promise<ActionEvidence> {
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("The QA API session expired.");
  const startedAfter = new Date(Date.now() - 5_000).toISOString();
  const response = await fetch(ACTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId, action, orderId, payload }),
  });
  const result = (await response.json()) as ActionResult;
  return {
    action,
    requestId,
    httpStatus: response.status,
    response: result,
    n8nExecution: await findN8nExecution(requestId, startedAfter),
  };
}

export async function resetDemo() {
  const manager = await openApiSession("Manager");
  const result = await callAction(manager, "RESET_DEMO");
  await manager.auth.signOut();
  if (!result.response.ok) throw new Error(result.response.message);
  return result;
}

export function observePage(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const apiResponses: Array<{ url: string; status: number }> = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/webhook/") || response.url().includes("supabase.co")) {
      apiResponses.push({ url: response.url().replace(/\?.*$/, ""), status: response.status() });
    }
  });
  return { consoleErrors, failedRequests, apiResponses };
}

export async function captureAction(
  page: Page,
  action: () => Promise<void>,
): Promise<ActionEvidence> {
  let requestId = "";
  const startedAfter = new Date(Date.now() - 5_000).toISOString();
  const requestListener = (request: { url(): string; postDataJSON(): unknown }) => {
    if (request.url() !== ACTION_URL) return;
    const body = request.postDataJSON() as { requestId?: string };
    requestId = body.requestId ?? "";
  };
  page.on("request", requestListener);
  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url() === ACTION_URL),
    action(),
  ]);
  page.off("request", requestListener);
  const result = (await response.json()) as ActionResult;
  if (!requestId) throw new Error("The UI action did not include a request ID.");
  return {
    action: "UI_ACTION",
    requestId,
    httpStatus: response.status(),
    response: result,
    n8nExecution: await findN8nExecution(requestId, startedAfter),
  };
}

export async function saveJson(relativePath: string, value: unknown) {
  const target = path.resolve("qa/artifacts", relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function findN8nExecution(requestId: string, startedAfter: string) {
  if (!process.env.N8N_MCP_ACCESS_TOKEN) return null;
  const search = await callN8n("search_executions", {
    workflowId: ACTION_WORKFLOW_ID,
    startedAfter,
    limit: 20,
  });
  for (const execution of search.data ?? []) {
    const details = await callN8n("get_execution", {
      workflowId: ACTION_WORKFLOW_ID,
      executionId: execution.id,
      includeData: true,
      nodeNames: ["Normalize Request"],
      truncateData: 2,
    });
    if (JSON.stringify(details).includes(requestId)) {
      return details.execution ?? execution;
    }
  }
  return null;
}

async function callN8n(name: string, args: Record<string, unknown>) {
  const token = process.env.N8N_MCP_ACCESS_TOKEN;
  if (!token) throw new Error("N8N_MCP_ACCESS_TOKEN is not set.");
  const response = await fetch(
    process.env.N8N_MCP_URL ?? "https://om420.app.n8n.cloud/mcp-server/http",
    {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    },
  );
  if (!response.ok) throw new Error(`n8n MCP returned HTTP ${response.status}.`);
  const text = await response.text();
  const line = text.split("\n").find((item) => item.startsWith("data: "));
  if (!line) throw new Error("n8n MCP returned no data event.");
  const rpc = JSON.parse(line.slice(6));
  if (rpc.error) throw new Error(rpc.error.message ?? "n8n MCP call failed.");
  const result = rpc.result;
  if (result?.isError) throw new Error(result.content?.[0]?.text ?? `${name} failed.`);
  if (result?.structuredContent) return result.structuredContent;
  const resultText = result?.content?.find((item: { type: string }) => item.type === "text")?.text;
  return resultText ? JSON.parse(resultText) : result;
}
