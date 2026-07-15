import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const n8nBaseUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL;

if (!supabaseUrl || !supabaseKey || !n8nBaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL are required.",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const roles = {
  clerk: { name: "Anita Karki", role: "DISPATCH_CLERK" },
  quality: { name: "Ramesh Thapa", role: "WAREHOUSE_QUALITY" },
  supervisor: { name: "Sanjay Gupta", role: "DISPATCH_SUPERVISOR" },
  gate: { name: "Mina Tamang", role: "GATE_SECURITY" },
};

const requiredDocuments = [
  "COMMERCIAL_INVOICE",
  "DELIVERY_CHALLAN",
  "PACKING_LIST",
  "GATE_PASS",
].map((type) => ({ type, present: true, verified: false }));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findDispatch(state, requestNo = "FGD-2026-0715-006") {
  const dispatch = state.dispatches.find((item) => item.requestNo === requestNo);
  assert(dispatch, `${requestNo} was not found in the demo state.`);
  return dispatch;
}

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

function dispatchForControl(dispatch, action, input) {
  const next = structuredClone(dispatch);
  if (action === "ASSIGN_VEHICLE" && input.vehicle) next.vehicle = input.vehicle;
  if (action === "VERIFY_WEIGHT") next.actualWeightKg = input.actualWeightKg;
  if (action === "VERIFY_DOCUMENTS" && input.documents) next.documents = input.documents;
  return next;
}

async function runAction(state, dispatchId, actor, action, expectedStatus, input = {}) {
  const dispatch = state.dispatches.find((item) => item.id === dispatchId);
  assert(dispatch, `Dispatch ${dispatchId} was not found before ${action}.`);

  const response = await fetch(`${n8nBaseUrl.replace(/\/$/, "")}/paper-dispatch-control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      actor,
      dispatch: dispatchForControl(dispatch, action, input),
      inventory: state.inventory,
    }),
  });
  const controlResult = await response.json();
  assert(response.ok, `${action} returned HTTP ${response.status}.`);
  assert(controlResult.ok, `${action} was blocked by n8n: ${controlResult.uiMessage}`);

  const result = await rpc("demo_apply_workflow_action", {
    p_dispatch_id: dispatchId,
    p_actor_name: actor.name,
    p_actor_role: actor.role,
    p_action: action,
    p_action_input: input,
    p_n8n_result: controlResult,
  });
  const updated = result.state.dispatches.find((item) => item.id === dispatchId);
  assert(updated?.status === expectedStatus, `${action} expected ${expectedStatus}, received ${updated?.status}.`);
  console.log(`PASS  ${action.padEnd(23)} ${dispatch.status} -> ${updated.status}`);
  return result.state;
}

async function verify() {
  const resetResult = await rpc("demo_reset_state");
  let state = resetResult.state;
  let dispatch = findDispatch(state);
  const dispatchId = dispatch.id;
  const line = dispatch.lines[0];
  const stockBefore = state.inventory.find(
    (batch) => batch.productCode === line.productCode && batch.qualityStatus === "RELEASED",
  );
  assert(stockBefore, "Released stock was not found for the prepared dispatch.");

  const healthResponse = await fetch(
    `${n8nBaseUrl.replace(/\/$/, "")}/paper-dispatch-health`,
  );
  const health = await healthResponse.json();
  assert(healthResponse.ok && health.ok, "n8n health check failed.");
  console.log(`PASS  n8n health             ${health.policyVersion}`);

  state = await runAction(
    state,
    dispatchId,
    roles.supervisor,
    "APPROVE_AND_RESERVE",
    "APPROVED",
  );

  const denied = await rpc("demo_apply_workflow_action", {
    p_dispatch_id: dispatchId,
    p_actor_name: roles.supervisor.name,
    p_actor_role: roles.supervisor.role,
    p_action: "ASSIGN_VEHICLE",
    p_action_input: {},
    p_n8n_result: { ok: true },
  });
  dispatch = findDispatch(denied.state);
  assert(dispatch.status === "APPROVED", "Supervisor unexpectedly booked the truck.");
  assert(denied.message.includes("cannot perform"), "Supervisor denial message was not returned.");
  console.log("PASS  role permission         Supervisor cannot book truck");

  const vehicle = {
    vehicleNo: "Bagmati 03-001 Kha 9084",
    transporter: "Himalayan Paper Logistics",
    driverName: "Bikash Rai",
    driverPhone: "9804567890",
    expectedArrival: "2026-07-16T03:30:00.000Z",
  };
  state = await runAction(
    denied.state,
    dispatchId,
    roles.clerk,
    "ASSIGN_VEHICLE",
    "VEHICLE_ASSIGNED",
    { vehicle },
  );
  dispatch = findDispatch(state);
  assert(dispatch.vehicle?.vehicleNo === vehicle.vehicleNo, "Entered truck details were not saved.");
  console.log("PASS  shared truck data       Custom truck details persisted");

  state = await runAction(
    state,
    dispatchId,
    roles.gate,
    "MARK_VEHICLE_ARRIVED",
    "VEHICLE_ARRIVED",
  );
  state = await runAction(state, dispatchId, roles.quality, "START_LOADING", "LOADING");
  state = await runAction(
    state,
    dispatchId,
    roles.quality,
    "COMPLETE_LOADING",
    "AWAITING_WEIGHT_CHECK",
  );

  dispatch = findDispatch(state);
  const actualWeightKg = Math.round(dispatch.expectedWeightKg * 1.004);
  state = await runAction(
    state,
    dispatchId,
    roles.quality,
    "VERIFY_WEIGHT",
    "AWAITING_DOCUMENT_CHECK",
    { actualWeightKg },
  );
  dispatch = findDispatch(state);
  assert(dispatch.actualWeightKg === actualWeightKg, "Entered weight was not saved.");
  console.log("PASS  shared weight data      Actual weight persisted");

  state = await runAction(
    state,
    dispatchId,
    roles.supervisor,
    "VERIFY_DOCUMENTS",
    "AWAITING_GATE_CLEARANCE",
    { documents: requiredDocuments },
  );
  dispatch = findDispatch(state);
  assert(dispatch.documents.every((document) => document.present && document.verified), "Papers were not verified.");
  console.log("PASS  shared paper data       All required papers verified");

  state = await runAction(
    state,
    dispatchId,
    roles.gate,
    "CLEAR_GATE",
    "CLEARED_FOR_EXIT",
  );
  state = await runAction(state, dispatchId, roles.gate, "CONFIRM_EXIT", "DISPATCHED");

  const stockAfter = state.inventory.find((batch) => batch.id === stockBefore.id);
  assert(stockAfter, "Reserved stock batch disappeared after dispatch.");
  assert(
    stockAfter.onHandQty === stockBefore.onHandQty - line.requestedQty,
    "Dispatched stock was not deducted from on-hand quantity.",
  );
  assert(
    stockAfter.reservedQty === stockBefore.reservedQty,
    "Dispatch reservation was not released after stock deduction.",
  );
  console.log("PASS  inventory update        Reserved stock deducted exactly once");

  const createResult = await rpc("demo_create_dispatch", {
    p_actor_name: roles.clerk.name,
    p_actor_role: roles.clerk.role,
    p_customer_name: "Demo Carton Works",
    p_customer_type: "COMMERCIAL",
    p_destination: "Kathmandu, Nepal",
    p_priority: "NORMAL",
    p_product_code: "PR-120-KRAFT",
    p_requested_qty: 1500,
    p_requested_dispatch_date: "2026-07-17",
  });
  const created = createResult.state.dispatches.find((item) => item.id === createResult.dispatchId);
  assert(created?.status === "DRAFT", "New job was not created as a shared draft.");
  console.log(`PASS  new job                 ${created.requestNo} created and visible`);

  console.log("\nAll live demo checks passed.");
}

try {
  await verify();
} finally {
  await rpc("demo_reset_state");
  console.log("Demo data reset for the presentation.");
}
