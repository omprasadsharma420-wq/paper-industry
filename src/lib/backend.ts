import type { AppState, AppUser, DispatchRequest, WorkflowResult } from "./types";
import { isSupabaseConfigured, supabase } from "./supabase";
import type { CreateDispatchInput, WorkflowAction, WorkflowActionInput } from "./workflow";

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

function dispatchForControl(
  action: WorkflowAction,
  dispatch: DispatchRequest,
  input: WorkflowActionInput,
): DispatchRequest {
  const next = { ...dispatch };

  if (action === "ASSIGN_VEHICLE" && input.vehicle) {
    next.vehicle = input.vehicle;
  }

  if (action === "VERIFY_WEIGHT") {
    next.actualWeightKg =
      input.actualWeightKg ??
      dispatch.actualWeightKg ??
      (dispatch.expectedWeightKg ? Math.round(dispatch.expectedWeightKg * 1.006) : 0);
  }

  if (action === "VERIFY_DOCUMENTS" && input.documents) {
    next.documents = input.documents;
  }

  return next;
}

async function callDispatchControl(
  state: AppState,
  dispatch: DispatchRequest,
  actor: AppUser,
  action: WorkflowAction,
  input: WorkflowActionInput,
): Promise<N8nControlResult> {
  const baseUrl =
    process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL ??
    "https://om420.app.n8n.cloud/webhook";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/paper-dispatch-control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      actor: {
        name: actor.name,
        role: actor.role,
      },
      dispatch: dispatchForControl(action, dispatch, input),
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
  input: WorkflowActionInput = {},
): Promise<WorkflowResult | null> {
  if (!isBackendConfigured) return null;

  const dispatch = state.dispatches.find((item) => item.id === dispatchId);
  if (!dispatch) {
    return { state, dispatchId, message: "Dispatch was not found." };
  }

  const controlResult = await callDispatchControl(state, dispatch, actor, action, input);
  const client = assertBackend();
  const { data, error } = await client.rpc("demo_apply_workflow_action", {
    p_dispatch_id: dispatchId,
    p_actor_name: actor.name,
    p_actor_role: actor.role,
    p_action: action,
    p_action_input: input,
    p_n8n_result: controlResult,
  });

  if (error) throw error;
  return normalizeRpcResult(data);
}
