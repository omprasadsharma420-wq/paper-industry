import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  ActionResponse,
  N8nHealth,
  SystemHealth,
  Workspace,
} from "@/lib/agra-types";

export const N8N_ACTION_URL =
  process.env.NEXT_PUBLIC_N8N_ACTION_URL ??
  "https://om420.app.n8n.cloud/webhook/agra-operations-action";

export const N8N_HEALTH_URL =
  process.env.NEXT_PUBLIC_N8N_HEALTH_URL ??
  "https://om420.app.n8n.cloud/webhook/agra-operations-health";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured for this build.");
  }
  return supabase;
}

export async function signIn(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Sign in did not create a session.");
  return data.session;
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export function watchSession(
  callback: (event: string, session: Session | null) => void,
) {
  return requireSupabase().auth.onAuthStateChange(callback).data.subscription;
}

export async function loadWorkspace() {
  const { data, error } = await requireSupabase().rpc("agra_load_workspace");
  if (error) throw new Error(error.message);
  return data as Workspace;
}

export async function executeAction(
  session: Session,
  action: string,
  orderId: string | null,
  payload: Record<string, unknown> = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(N8N_ACTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        action,
        orderId,
        payload,
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as ActionResponse | null;
    if (!body) throw new Error("The automation service returned an invalid response.");
    if (!response.ok || !body.ok) throw new Error(body.message || "The action failed.");
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The operation timed out. No unconfirmed change is shown.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function loadSystemHealth() {
  const { data, error } = await requireSupabase().rpc("agra_system_health");
  if (error) throw new Error(error.message);
  return data as SystemHealth;
}

export async function loadN8nHealth() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(N8N_HEALTH_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("n8n health check failed.");
    return (await response.json()) as N8nHealth;
  } finally {
    window.clearTimeout(timeout);
  }
}
