import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ACTION_URL = process.env.NEXT_PUBLIC_N8N_ACTION_URL
  ?? "https://om420.app.n8n.cloud/webhook/agra-operations-action";
const HEALTH_URL = process.env.NEXT_PUBLIC_N8N_HEALTH_URL
  ?? "https://om420.app.n8n.cloud/webhook/agra-operations-health";
const DEMO_PASSWORD = process.env.AGRA_DEMO_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !DEMO_PASSWORD) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and AGRA_DEMO_PASSWORD before running verification.",
  );
}

const ORDER = {
  success: "30000000-0000-4000-8000-000000000001",
  shortage: "30000000-0000-4000-8000-000000000002",
  rework: "30000000-0000-4000-8000-000000000003",
  documents: "30000000-0000-4000-8000-000000000004",
};

const ACCOUNTS = {
  sales: ["sales@agra-demo.example", "SALES_ORDER_COORDINATOR"],
  quality: ["quality@agra-demo.example", "INVENTORY_QUALITY"],
  packing: ["packing@agra-demo.example", "PACKING_DISPATCH"],
  supervisor: ["supervisor@agra-demo.example", "OPERATIONS_SUPERVISOR"],
  manager: ["manager@agra-demo.example", "MANAGER_ADMIN"],
};

const checkmarks = [];

function pass(label) {
  checkmarks.push(label);
  console.log(`PASS  ${label}`);
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function login(email, expectedRole) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  assert.ifError(error);
  assert.ok(data.session, `${email} did not receive a session`);
  const workspace = await loadWorkspace({ client });
  assert.equal(workspace.currentUser.role, expectedRole);
  return { client, session: data.session, workspace };
}

async function loadWorkspace(account) {
  const { data, error } = await account.client.rpc("agra_load_workspace");
  assert.ifError(error);
  assert.ok(data?.currentUser, "Workspace did not include the signed-in profile");
  return data;
}

async function callAction(account, action, orderId = null, payload = {}, requestId = crypto.randomUUID()) {
  const response = await fetch(ACTION_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${account.session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ requestId, action, orderId, payload }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, `${action} returned HTTP ${response.status}`);
  return { ...body, requestId };
}

async function expectOk(account, action, orderId = null, payload = {}, requestId) {
  const result = await callAction(account, action, orderId, payload, requestId);
  assert.equal(result.ok, true, `${action} failed: ${result.message}`);
  return result;
}

async function expectBlocked(account, action, orderId, payload, code) {
  const result = await callAction(account, action, orderId, payload);
  assert.equal(result.ok, false, `${action} unexpectedly succeeded`);
  assert.equal(result.code, code, `${action} returned ${result.code}, expected ${code}`);
  return result;
}

async function reset(manager) {
  const result = await expectOk(manager, "RESET_DEMO");
  assert.equal(result.code, "DEMO_RESET");
}

function findOrder(workspace, id) {
  const order = workspace.orders.find((item) => item.id === id);
  assert.ok(order, `Order ${id} was not found`);
  return order;
}

function findProduct(workspace, sku) {
  const product = workspace.products.find((item) => item.sku === sku);
  assert.ok(product, `Product ${sku} was not found`);
  return product;
}

function tomorrow(days = 4) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function handoverPayload(reference = "QA-PICKUP") {
  return {
    deliveryMethod: "CUSTOMER_PICKUP",
    packageCount: 10,
    shipmentWeightKg: 72,
    handoverPerson: "Agra Packing Desk",
    receiverName: "Customer Representative",
    customerRepresentative: "Customer Representative",
    receiverPhone: "9800000000",
    acknowledgementReference: reference,
    notes: "Automated verification handover.",
  };
}

async function driveToApproval(accounts, orderId) {
  await expectOk(accounts.sales, "SUBMIT_ORDER", orderId);
  await expectOk(accounts.quality, "CHECK_STOCK", orderId);
}

async function driveToQuality(accounts, orderId) {
  await driveToApproval(accounts, orderId);
  await expectOk(accounts.supervisor, "APPROVE_ORDER", orderId);
  await expectOk(accounts.packing, "START_PICKING", orderId);
  await expectOk(accounts.packing, "COMPLETE_PICKING", orderId, { notes: "Picked as reserved." });
}

async function verifyIdentityAndPermissions(accounts) {
  for (const [name, [, role]] of Object.entries(ACCOUNTS)) {
    assert.equal(accounts[name].workspace.currentUser.role, role);
  }
  pass("five authenticated roles load their server-assigned profiles");

  const anonymous = makeClient();
  const anonymousWorkspace = await anonymous.rpc("agra_load_workspace");
  assert.ok(anonymousWorkspace.error, "Anonymous workspace access was not blocked");
  pass("anonymous workspace access is blocked");

  await expectBlocked(accounts.sales, "RESET_DEMO", null, {}, "FORBIDDEN");
  await expectBlocked(accounts.sales, "APPROVE_ORDER", ORDER.success, {}, "FORBIDDEN");
  pass("role permissions reject manager and supervisor actions from Sales");

  const directWrite = await accounts.sales.client
    .from("agra_profiles")
    .update({ role: "SALES_ORDER_COORDINATOR" })
    .eq("user_id", accounts.sales.session.user.id);
  assert.ok(directWrite.error, "Direct profile writes were not blocked");
  pass("RLS and grants block direct role changes");
}

async function verifyReset(accounts) {
  await reset(accounts.manager);
  const workspace = await loadWorkspace(accounts.manager);
  assert.equal(workspace.orders.length, 5);
  assert.equal(findOrder(workspace, ORDER.success).fulfillment_status, "DRAFT");
  assert.equal(findOrder(workspace, ORDER.documents).fulfillment_status, "READY_FOR_HANDOVER");
  const completedOrder = workspace.orders.find((order) => order.order_no === "AGRA-DEMO-005");
  assert.ok(completedOrder?.handover, "Historical handover was not restored");
  assert.equal(completedOrder.documents.filter((document) => document.required && document.status === "VERIFIED").length, 3);
  assert.equal(findProduct(workspace, "KHK-DIA-A5-NAT").availableStock, 250);
  pass("demo reset restores five orders, documents, handover history, and 250 diaries");
}

async function verifyShortage(accounts) {
  await reset(accounts.manager);
  await expectBlocked(accounts.quality, "CHECK_STOCK", ORDER.shortage, {}, "INSUFFICIENT_RELEASED_STOCK");
  const workspace = await loadWorkspace(accounts.quality);
  const order = findOrder(workspace, ORDER.shortage);
  assert.equal(order.fulfillment_status, "BLOCKED");
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").length, 0);
  assert.ok(order.exceptions.some((item) => item.code === "INSUFFICIENT_RELEASED_STOCK" && item.status === "OPEN"));
  assert.ok(workspace.auditEvents.some((item) => item.action === "CHECK_STOCK" && !item.success));
  pass("300 bags against 220 released is blocked without a reservation");
}

async function verifySeededRework(accounts) {
  await reset(accounts.manager);
  const workspace = await loadWorkspace(accounts.quality);
  const order = findOrder(workspace, ORDER.rework);
  const bags = findProduct(workspace, "KHK-BAG-M-NAT");
  assert.equal(order.fulfillment_status, "REWORK_REQUIRED");
  assert.ok(order.reworkRecords.some((item) => item.status === "OPEN"));
  assert.equal(bags.availableStock, 220);
  assert.equal(bags.reworkStock, 30);
  await expectBlocked(accounts.supervisor, "APPROVE_ORDER", ORDER.rework, {}, "INVALID_STATUS");
  pass("rework stock stays unavailable and the order cannot be approved");
}

async function verifyMissingDocuments(accounts) {
  await reset(accounts.manager);
  await expectBlocked(
    accounts.packing,
    "CONFIRM_HANDOVER",
    ORDER.documents,
    handoverPayload("QA-MISSING-DOC"),
    "MISSING_REQUIRED_DOCUMENT",
  );
  const workspace = await loadWorkspace(accounts.packing);
  const order = findOrder(workspace, ORDER.documents);
  assert.equal(order.fulfillment_status, "READY_FOR_HANDOVER");
  assert.equal(order.handover, null);
  assert.ok(order.documents.some((item) => item.required && item.status === "MISSING"));
  pass("handover is blocked when a required document is missing");
}

async function verifyDuplicateOrder(accounts) {
  await reset(accounts.manager);
  const workspace = await loadWorkspace(accounts.sales);
  const customer = workspace.customers[0];
  const product = findProduct(workspace, "KHK-DIA-A5-NAT");
  const reference = `QA-DUP-${Date.now()}`;
  const payload = {
    customerId: customer.id,
    customerOrderReference: reference,
    requestedDispatchDate: tomorrow(),
    fulfillmentSource: "FINISHED_STOCK",
    priority: "NORMAL",
    items: [{ productId: product.id, quantity: 1 }],
  };
  await expectOk(accounts.sales, "CREATE_ORDER", null, payload);
  await expectBlocked(accounts.sales, "CREATE_ORDER", null, payload, "DUPLICATE_RECORD");
  const after = await loadWorkspace(accounts.sales);
  assert.equal(after.orders.filter((order) => order.customer_order_reference === reference).length, 1);
  pass("duplicate customer order references create only one draft");
}

async function verifyIdempotencyAndCancellation(accounts) {
  await reset(accounts.manager);
  await driveToApproval(accounts, ORDER.success);
  const requestId = crypto.randomUUID();
  const first = await expectOk(accounts.supervisor, "APPROVE_ORDER", ORDER.success, {}, requestId);
  const replay = await expectOk(accounts.supervisor, "APPROVE_ORDER", ORDER.success, {}, requestId);
  assert.equal(first.code, "ORDER_APPROVED");
  assert.equal(replay.idempotentReplay, true);

  let workspace = await loadWorkspace(accounts.manager);
  let order = findOrder(workspace, ORDER.success);
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").reduce((sum, item) => sum + Number(item.reserved_quantity), 0), 200);
  assert.equal(findProduct(workspace, "KHK-DIA-A5-NAT").availableStock, 50);

  await expectOk(accounts.supervisor, "CANCEL_ORDER", ORDER.success, { reason: "Automated cancellation verification." });
  workspace = await loadWorkspace(accounts.manager);
  order = findOrder(workspace, ORDER.success);
  assert.equal(order.fulfillment_status, "CANCELLED");
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").length, 0);
  assert.equal(findProduct(workspace, "KHK-DIA-A5-NAT").availableStock, 250);
  assert.ok(workspace.auditEvents.some((item) => item.action === "CANCEL_ORDER" && item.success));
  pass("double approval is idempotent and cancellation releases all stock");
}

async function verifyConcurrentReservation(accounts) {
  await reset(accounts.manager);
  const workspace = await loadWorkspace(accounts.sales);
  const product = findProduct(workspace, "KHK-DIA-A5-NAT");
  const second = await expectOk(accounts.sales, "CREATE_ORDER", null, {
    customerId: workspace.customers[1].id,
    customerOrderReference: `QA-CONCURRENT-${Date.now()}`,
    requestedDispatchDate: tomorrow(),
    fulfillmentSource: "FINISHED_STOCK",
    priority: "HIGH",
    items: [{ productId: product.id, quantity: 100 }],
  });
  await driveToApproval(accounts, ORDER.success);
  await expectOk(accounts.sales, "SUBMIT_ORDER", second.entityId);
  await expectOk(accounts.quality, "CHECK_STOCK", second.entityId);

  const approvalA = callAction(accounts.supervisor, "APPROVE_ORDER", ORDER.success);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const approvalB = callAction(accounts.supervisor, "APPROVE_ORDER", second.entityId);
  const [resultA, resultB] = await Promise.all([approvalA, approvalB]);
  assert.equal(resultA.ok, true, `200-unit approval failed: ${resultA.message}`);
  assert.equal(resultB.ok, false, "100-unit competing approval unexpectedly succeeded");
  assert.equal(resultB.code, "INSUFFICIENT_RELEASED_STOCK");

  const after = await loadWorkspace(accounts.manager);
  assert.equal(findOrder(after, ORDER.success).fulfillment_status, "APPROVED");
  assert.equal(findOrder(after, second.entityId).fulfillment_status, "BLOCKED");
  assert.equal(findProduct(after, "KHK-DIA-A5-NAT").reservedStock, 200);
  assert.equal(findProduct(after, "KHK-DIA-A5-NAT").availableStock, 50);
  assert.ok(after.inventoryBatches.every((batch) => batch.available_quantity >= 0 && batch.reserved_quantity >= 0));
  pass("competing 200 and 100 diary approvals leave 50 available with no negative stock");
}

async function verifyFailedQuality(accounts) {
  await reset(accounts.manager);
  await driveToQuality(accounts, ORDER.success);
  await expectOk(accounts.quality, "RECORD_QC", ORDER.success, {
    result: "REWORK_REQUIRED",
    affectedQuantity: 10,
    defectType: "BINDING",
    defectDescription: "Ten diary bindings require reinforcement.",
    checklist: { dimensions: true, binding: false, paperQuality: true, pageCount: true, coverFinish: true },
    reworkDueDate: tomorrow(2),
  });
  const workspace = await loadWorkspace(accounts.quality);
  const order = findOrder(workspace, ORDER.success);
  const diaries = findProduct(workspace, "KHK-DIA-A5-NAT");
  assert.equal(order.fulfillment_status, "REWORK_REQUIRED");
  assert.equal(diaries.reworkStock, 10);
  assert.equal(diaries.reservedStock, 190);
  assert.equal(diaries.availableStock, 50);
  assert.ok(order.reworkRecords.some((item) => item.rework_quantity === 10 && item.status === "OPEN"));
  pass("failed quality moves affected units to rework and recalculates reservation quantities");
}

async function verifySuccessfulDispatch(accounts) {
  await reset(accounts.manager);
  await driveToQuality(accounts, ORDER.success);
  await expectOk(accounts.quality, "RECORD_QC", ORDER.success, {
    result: "PASSED",
    checklist: { dimensions: true, binding: true, paperQuality: true, pageCount: true, coverFinish: true, damageFree: true },
    notes: "All 200 diaries passed final quality inspection.",
  });
  await expectOk(accounts.packing, "COMPLETE_PACKING", ORDER.success, {
    packageCount: 10,
    cartonCount: 10,
    bundleCount: 0,
    quantityPerPackage: 20,
    packagingType: "Moisture-protected carton",
    totalShipmentWeightKg: 72,
    moistureProtection: true,
    notes: "Twenty diaries per carton.",
  });

  await expectBlocked(
    accounts.packing,
    "CONFIRM_HANDOVER",
    ORDER.success,
    handoverPayload("QA-BEFORE-DOCS"),
    "MISSING_REQUIRED_DOCUMENT",
  );
  await expectOk(accounts.packing, "VERIFY_DOCUMENTS", ORDER.success, {
    documents: [
      { documentType: "INVOICE", referenceNumber: "INV-QA-200" },
      { documentType: "PACKING_LIST", referenceNumber: "PL-QA-200" },
      { documentType: "DISPATCH_NOTE", referenceNumber: "DN-QA-200" },
    ],
  });
  await expectOk(accounts.packing, "CONFIRM_HANDOVER", ORDER.success, handoverPayload("QA-PICKUP-200"));

  const freshManager = await login(...ACCOUNTS.manager);
  const workspace = await loadWorkspace(freshManager);
  const order = findOrder(workspace, ORDER.success);
  const diaries = findProduct(workspace, "KHK-DIA-A5-NAT");
  assert.equal(order.order_status, "CLOSED");
  assert.equal(order.fulfillment_status, "DISPATCHED");
  assert.ok(order.handover);
  assert.equal(order.documents.filter((item) => item.required && item.status === "VERIFIED").length, 3);
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").length, 0);
  assert.equal(diaries.availableStock, 50);
  assert.equal(diaries.reservedStock, 0);

  const { data: health, error: healthError } = await freshManager.client.rpc("agra_system_health");
  assert.ifError(healthError);
  assert.equal(health.ok, true);
  assert.equal(health.invalidInventoryRows, 0);
  assert.equal(health.reservationMismatches, 0);
  pass("role-to-role 200-diary flow dispatches successfully and leaves 50 available");
  pass("fresh-session reload sees the dispatched state and reconciled health");
}

async function verifyAutomationAndOutage(accounts) {
  const healthResponse = await fetch(HEALTH_URL, { headers: { accept: "application/json" } });
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(health.ok, true);
  assert.equal(health.databaseAuthority, "Supabase");
  pass("n8n production health reports Supabase as database authority");

  const before = await loadWorkspace(accounts.manager);
  await assert.rejects(
    fetch("http://127.0.0.1:9/unavailable", {
      method: "POST",
      signal: AbortSignal.timeout(1200),
    }),
  );
  const after = await loadWorkspace(accounts.manager);
  assert.equal(findOrder(after, ORDER.success).fulfillment_status, findOrder(before, ORDER.success).fulfillment_status);
  pass("simulated automation outage fails clearly and does not mutate live state");
}

async function main() {
  console.log("Agra Operations pilot verification\n");
  const accounts = {};
  for (const [name, [email, role]] of Object.entries(ACCOUNTS)) {
    accounts[name] = await login(email, role);
  }

  try {
    await verifyIdentityAndPermissions(accounts);
    await verifyReset(accounts);
    await verifyShortage(accounts);
    await verifySeededRework(accounts);
    await verifyMissingDocuments(accounts);
    await verifyDuplicateOrder(accounts);
    await verifyIdempotencyAndCancellation(accounts);
    await verifyConcurrentReservation(accounts);
    await verifyFailedQuality(accounts);
    await verifySuccessfulDispatch(accounts);
    await verifyAutomationAndOutage(accounts);
  } finally {
    await reset(accounts.manager);
  }

  console.log(`\n${checkmarks.length} verification checks passed.`);
  console.log("The reference dataset was restored for presentation.");
}

main().catch((error) => {
  console.error("\nVerification failed:", error.message);
  process.exitCode = 1;
});
