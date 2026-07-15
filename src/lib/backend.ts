import type { AppState, AppUser, DispatchRequest, WorkflowResult } from "./types";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { CreateDispatchInput, WorkflowAction } from "./workflow";

export const isBackendConfigured = isSupabaseConfigured;

type RpcResult = {
  state: AppState;
  dispatchId: string;
  message: string;
};

type N8nControlResult = {
  ok: boolean;
  uiMessage?: string;
  [key: string]: unknown;
};

function assertBackend() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

function normalizeRpcResult(data: unknown): WorkflowResult {
  const result = data as RpcResult;
  return {
    state: result.state,
    dispatchId: result.dispatchId,
    message: result.message,
  };
}

function dispatchForControl(action: WorkflowAction, dispatch: DispatchRequest): DispatchRequest {
  if (action !== "VERIFY_WEIGHT" || dispatch.actualWeightKg || !dispatch.expectedWeightKg) {
    return dispatch;
  }

  return {
    ...dispatch,
    actualWeightKg: Math.round(dispatch.expectedWeightKg * 1.006),
  };
}

async function callDispatchControl(
  state: AppState,
  dispatch: DispatchRequest,
  actor: AppUser,
  action: WorkflowAction,
): Promise<N8nControlResult> {
  const baseUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL is not configured.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/paper-dispatch-control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      actor: {
        name: actor.name,
        role: actor.role,
      },
      dispatch: dispatchForControl(action, dispatch),
      inventory: state.inventory,
    }),
  });

  const result = (await response.json()) as N8nControlResult;
  if (!response.ok) {
    throw new Error(result.uiMessage ?? "n8n dispatch control request failed.");
  }
  return result;
}

export async function loadBackendState(): Promise<AppState | null> {
  if (!isBackendConfigured) return null;

  const client = assertBackend();
  const { data, error } = await client.rpc("demo_load_state");
  if (error) throw error;
  return data as AppState;
}

export async function resetBackendState(): Promise<WorkflowResult | null> {
  if (!isBackendConfigured) return null;

  const client = assertBackend();
  const { data, error } = await client.rpc("demo_reset_state");
  if (error) throw error;
  return normalizeRpcResult(data);
}

export async function createBackendDispatch(
  actor: AppUser,
  input: CreateDispatchInput,
): Promise<WorkflowResult | null> {
  if (!isBackendConfigured) return null;

  const client = assertBackend();
  const { data, error } = await client.rpc("demo_create_dispatch", {
    p_actor_name: actor.name,
    p_actor_role: actor.role,
    p_customer_name: input.customerName,
    p_customer_type: input.customerType,
    p_destination: input.destination,
    p_priority: input.priority,
    p_product_code: input.productCode,
    p_requested_qty: input.requestedQty,
    p_requested_dispatch_date: input.requestedDispatchDate,
  });

  if (error) throw error;
  return normalizeRpcResult(data);
}

export async function performBackendWorkflowAction(
  state: AppState,
  dispatchId: string,
  actor: AppUser,
  action: WorkflowAction,
): Promise<WorkflowResult | null> {
  if (!isBackendConfigured) return null;

  const dispatch = state.dispatches.find((item) => item.id === dispatchId);
  if (!dispatch) {
    return { state, dispatchId, message: "Dispatch was not found." };
  }

  const controlResult = await callDispatchControl(state, dispatch, actor, action);
  const client = assertBackend();
  const { data, error } = await client.rpc("demo_apply_workflow_action", {
    p_dispatch_id: dispatchId,
    p_actor_name: actor.name,
    p_actor_role: actor.role,
    p_action: action,
    p_n8n_result: controlResult,
  });

  if (error) throw error;
  return normalizeRpcResult(data);
}
