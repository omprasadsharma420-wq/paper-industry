import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? "https://etykyasaicfhrbbtbdfv.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? "sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5";
const ACTION_URL = process.env.NEXT_PUBLIC_N8N_ACTION_URL
  ?? "https://om420.app.n8n.cloud/webhook/agra-operations-action";
const HEALTH_URL = process.env.NEXT_PUBLIC_N8N_HEALTH_URL
  ?? "https://om420.app.n8n.cloud/webhook/agra-operations-health";
const DEMO_LOGIN_URL = process.env.NEXT_PUBLIC_DEMO_LOGIN_URL
  ?? `${SUPABASE_URL}/functions/v1/agra-demo-login`;
const APP_ORIGIN = process.env.QA_APP_ORIGIN
  ?? "https://paper-industry-dispatch-control.trafangularlaw01.chatgpt.site";


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
  const response = await fetch(DEMO_LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_ORIGIN },
    body: JSON.stringify({ email }),
  });
  const loginResult = await response.json();
  assert.equal(response.status, 200, loginResult.message ?? `${email} could not open a demo session`);
  assert.ok(loginResult.accessToken && loginResult.refreshToken, `${email} did not receive a session`);
  const { data, error } = await client.auth.setSession({
    access_token: loginResult.accessToken,
    refresh_token: loginResult.refreshToken,
  });
  assert.ifError(error);
  assert.ok(data.session, `${email} did not receive a valid session`);
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

  const baseline = await loadWorkspace(accounts.manager);
  const batchId = baseline.inventoryBatches[0].id;
  await expectBlocked(accounts.sales, "RESET_DEMO", null, {}, "FORBIDDEN");
  await expectBlocked(accounts.sales, "APPROVE_ORDER", ORDER.success, { role: "MANAGER_ADMIN" }, "FORBIDDEN");
  await expectBlocked(accounts.sales, "INSPECT_BATCH", null, { batchId, result: "RELEASED" }, "FORBIDDEN");
  await expectBlocked(accounts.quality, "CONFIRM_HANDOVER", ORDER.documents, handoverPayload(), "FORBIDDEN");
  await expectBlocked(accounts.packing, "APPROVE_ORDER", ORDER.success, {}, "FORBIDDEN");
  pass("server roles reject reset, approval, stock release, and handover attempts from unauthorized users");

  const anonymousAction = await anonymous.rpc("agra_execute_action", {
    p_request_id: crypto.randomUUID(),
    p_action: "RESET_DEMO",
    p_order_id: null,
    p_payload: {},
  });
  assert.ok(anonymousAction.error, "Anonymous privileged RPC execution was not blocked");
  pass("anonymous callers cannot invoke the privileged action RPC");

  const directWrite = await accounts.sales.client
    .from("agra_profiles")
    .update({ role: "SALES_ORDER_COORDINATOR" })
    .eq("user_id", accounts.sales.session.user.id);
  assert.ok(directWrite.error, "Direct profile writes were not blocked");
  const directInventoryWrite = await accounts.supervisor.client
    .from("agra_inventory_batches")
    .update({ released_quantity: 999999 })
    .eq("id", batchId);
  assert.ok(directInventoryWrite.error, "Supervisor direct inventory writes were not blocked");
  const directAuditWrite = await accounts.manager.client
    .from("agra_audit_events")
    .update({ reason: "tampered" })
    .eq("id", baseline.auditEvents[0].id);
  assert.ok(directAuditWrite.error, "Authenticated audit modification was not blocked");
  pass("RLS and grants block direct role, inventory, and audit changes");

  const after = await loadWorkspace(accounts.manager);
  for (const action of ["RESET_DEMO", "APPROVE_ORDER", "INSPECT_BATCH", "CONFIRM_HANDOVER"]) {
    assert.ok(after.auditEvents.some((item) => item.action === action && !item.success), `${action} denial was not audited`);
  }
  pass("authorized gateway calls that fail role checks remain visible in the audit history");
}

async function verifyReset(accounts) {
  await reset(accounts.manager);
  const workspace = await loadWorkspace(accounts.manager);
  assert.equal(workspace.orders.length, 5);
  assert.equal(findOrder(workspace, ORDER.success).fulfillment_status, "DRAFT");
  assert.equal(findOrder(workspace, ORDER.documents).fulfillment_status, "BLOCKED");
  const completedOrder = workspace.orders.find((order) => order.order_no === "AGRA-DEMO-005");
  assert.ok(completedOrder?.handover, "Historical handover was not restored");
  assert.equal(completedOrder.documents.filter((document) => document.required && document.status === "VERIFIED").length, 3);
  assert.equal(findProduct(workspace, "KHK-DIA-A5-NAT").availableStock, 250);
  pass("demo reset restores five orders, the document block, handover history, and 250 diaries");
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
    "INVALID_STATUS",
  );
  const workspace = await loadWorkspace(accounts.packing);
  let order = findOrder(workspace, ORDER.documents);
  assert.equal(order.fulfillment_status, "BLOCKED");
  assert.equal(order.handover, null);
  assert.ok(order.documents.some((item) => item.required && item.status === "MISSING"));
  assert.ok(order.exceptions.some((item) => item.code === "MISSING_REQUIRED_DOCUMENT" && item.status === "OPEN"));

  await expectOk(accounts.packing, "VERIFY_DOCUMENTS", ORDER.documents, {
    documents: [
      { documentType: "INVOICE", referenceNumber: "INV-DEMO-004" },
      { documentType: "PACKING_LIST", referenceNumber: "PL-QA-004" },
      { documentType: "DISPATCH_NOTE", referenceNumber: "DN-DEMO-004" },
    ],
  });
  const repaired = await loadWorkspace(accounts.packing);
  order = findOrder(repaired, ORDER.documents);
  assert.equal(order.fulfillment_status, "READY_FOR_HANDOVER");
  assert.equal(order.exceptions.some((item) => item.code === "MISSING_REQUIRED_DOCUMENT" && item.status === "OPEN"), false);
  assert.ok(order.exceptions.some((item) => item.code === "MISSING_REQUIRED_DOCUMENT" && item.status === "RESOLVED"));
  pass("missing documents block handover and verification automatically restores the ready state");
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
  await expectOk(accounts.sales, "CREATE_ORDER", null, {
    ...payload,
    customerId: workspace.customers[1].id,
  });
  const after = await loadWorkspace(accounts.sales);
  assert.equal(after.orders.filter((order) => order.customer_order_reference === reference).length, 2);
  assert.equal(after.orders.filter((order) => order.customer_order_reference === reference && order.customer_id === customer.id).length, 1);
  pass("duplicate references are blocked per customer while another customer may reuse the reference");
}

async function verifyOrderQuantityValidation(accounts) {
  await reset(accounts.manager);
  const workspace = await loadWorkspace(accounts.sales);
  const product = findProduct(workspace, "KHK-DIA-A5-NAT");
  for (const quantity of [0, -5]) {
    const reference = `QA-INVALID-${quantity}`;
    await expectBlocked(accounts.sales, "CREATE_ORDER", null, {
      customerId: workspace.customers[0].id,
      customerOrderReference: reference,
      requestedDispatchDate: tomorrow(),
      fulfillmentSource: "FINISHED_STOCK",
      priority: "NORMAL",
      items: [{ productId: product.id, quantity }],
    }, "ACTION_FAILED");
    const after = await loadWorkspace(accounts.sales);
    assert.equal(after.orders.some((order) => order.customer_order_reference === reference), false);
  }
  pass("zero and negative order quantities are rejected without creating records");
}

async function verifyMultiLineOrder(accounts) {
  await reset(accounts.manager);
  let workspace = await loadWorkspace(accounts.sales);
  const diaries = findProduct(workspace, "KHK-DIA-A5-NAT");
  const bags = findProduct(workspace, "KHK-BAG-M-NAT");
  const created = await expectOk(accounts.sales, "CREATE_ORDER", null, {
    customerId: workspace.customers[0].id,
    customerOrderReference: `QA-MULTI-${Date.now()}`,
    requestedDispatchDate: tomorrow(),
    fulfillmentSource: "FINISHED_STOCK",
    priority: "NORMAL",
    items: [
      { productId: diaries.id, quantity: 100 },
      { productId: bags.id, quantity: 50 },
    ],
  });
  await driveToApproval(accounts, created.entityId);
  await expectOk(accounts.supervisor, "APPROVE_ORDER", created.entityId);
  workspace = await loadWorkspace(accounts.manager);
  let order = findOrder(workspace, created.entityId);
  assert.equal(order.items.length, 2);
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").reduce((sum, item) => sum + Number(item.reserved_quantity), 0), 150);
  assert.equal(findProduct(workspace, "KHK-DIA-A5-NAT").availableStock, 150);
  assert.equal(findProduct(workspace, "KHK-BAG-M-NAT").availableStock, 170);

  await expectOk(accounts.packing, "START_PICKING", created.entityId);
  await expectOk(accounts.packing, "COMPLETE_PICKING", created.entityId);
  await expectOk(accounts.quality, "RECORD_QC", created.entityId, {
    result: "PASSED",
    checklist: { pageCount: true, dimensions: true, binding: true, coverFinish: true, branding: true, pagesClean: true, damageFree: true },
  });
  await expectOk(accounts.packing, "COMPLETE_PACKING", created.entityId, {
    packageCount: 8,
    cartonCount: 8,
    quantityPerPackage: 20,
    packagingType: "QA mixed-product cartons",
  });
  workspace = await loadWorkspace(accounts.manager);
  order = findOrder(workspace, created.entityId);
  assert.equal(order.packing.items.length, 2);
  assert.equal(order.packing.items.reduce((sum, item) => sum + Number(item.packed_quantity), 0), 150);

  await expectOk(accounts.supervisor, "CANCEL_ORDER", created.entityId, { reason: "Multi-line release verification." });
  workspace = await loadWorkspace(accounts.manager);
  order = findOrder(workspace, created.entityId);
  assert.equal(order.fulfillment_status, "CANCELLED");
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").length, 0);
  assert.equal(findProduct(workspace, "KHK-DIA-A5-NAT").availableStock, 250);
  assert.equal(findProduct(workspace, "KHK-BAG-M-NAT").availableStock, 220);
  pass("two-SKU orders reserve, pick, inspect, pack, and cancel with per-SKU reconciliation");
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
  const successes = [resultA, resultB].filter((result) => result.ok);
  const failures = [resultA, resultB].filter((result) => !result.ok);
  assert.equal(successes.length, 1, "Exactly one competing approval must succeed");
  assert.equal(failures.length, 1, "Exactly one competing approval must be blocked");
  assert.equal(failures[0].code, "INSUFFICIENT_RELEASED_STOCK");

  const after = await loadWorkspace(accounts.manager);
  const firstOrder = findOrder(after, ORDER.success);
  const secondOrder = findOrder(after, second.entityId);
  const firstWon = resultA.ok;
  const expectedReserved = firstWon ? 200 : 100;
  assert.equal(firstOrder.fulfillment_status, firstWon ? "APPROVED" : "BLOCKED");
  assert.equal(secondOrder.fulfillment_status, firstWon ? "BLOCKED" : "APPROVED");
  assert.equal(findProduct(after, "KHK-DIA-A5-NAT").reservedStock, expectedReserved);
  assert.equal(findProduct(after, "KHK-DIA-A5-NAT").availableStock, 250 - expectedReserved);
  assert.equal(
    after.inventoryBatches
      .filter((batch) => batch.product.sku === "KHK-DIA-A5-NAT")
      .reduce((sum, batch) => sum + batch.reserved_quantity, 0),
    expectedReserved,
  );
  assert.ok(after.inventoryBatches.every((batch) => batch.available_quantity >= 0 && batch.reserved_quantity >= 0));
  pass("competing 200 and 100 diary approvals serialize without over-reservation or negative stock");
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

async function verifySplitRework(accounts) {
  await reset(accounts.manager);
  await driveToQuality(accounts, ORDER.success);
  await expectOk(accounts.quality, "RECORD_QC", ORDER.success, {
    result: "REWORK_REQUIRED",
    affectedQuantity: 50,
    defectType: "INSECURE_BINDING",
    defectDescription: "Fifty bindings require correction.",
    checklist: { pageCount: true, dimensions: true, binding: false, coverFinish: true, branding: true, pagesClean: true, damageFree: true },
    reworkDueDate: tomorrow(2),
  });
  let workspace = await loadWorkspace(accounts.quality);
  let order = findOrder(workspace, ORDER.success);
  const rework = order.reworkRecords.find((item) => item.status === "OPEN");
  assert.ok(rework, "The 50-unit rework task was not created");
  const requestId = crypto.randomUUID();
  const completed = await expectOk(accounts.quality, "COMPLETE_REWORK", ORDER.success, {
    reworkId: rework.id,
    releasedQuantity: 45,
    damagedQuantity: 5,
    blockedQuantity: 0,
    completionNote: "Forty-five corrected; five rejected after reinspection.",
  }, requestId);
  const replay = await expectOk(accounts.quality, "COMPLETE_REWORK", ORDER.success, {
    reworkId: rework.id,
    releasedQuantity: 45,
    damagedQuantity: 5,
    blockedQuantity: 0,
    completionNote: "Forty-five corrected; five rejected after reinspection.",
  }, requestId);
  assert.equal(completed.code, "REWORK_COMPLETED");
  assert.equal(replay.idempotentReplay, true);

  workspace = await loadWorkspace(accounts.manager);
  order = findOrder(workspace, ORDER.success);
  const diaries = findProduct(workspace, "KHK-DIA-A5-NAT");
  const finished = order.reworkRecords.find((item) => item.id === rework.id);
  assert.equal(order.fulfillment_status, "BLOCKED");
  assert.equal(finished.status, "COMPLETED");
  assert.equal(finished.rework_quantity, 45);
  assert.equal(finished.rejected_quantity, 5);
  assert.equal(diaries.releasedStock, 245);
  assert.equal(diaries.reservedStock, 195);
  assert.equal(diaries.availableStock, 50);
  assert.equal(diaries.reworkStock, 0);
  assert.equal(diaries.damagedStock, 5);
  assert.equal(order.reservations.filter((item) => item.status === "ACTIVE").reduce((sum, item) => sum + Number(item.reserved_quantity), 0), 195);
  assert.ok(order.exceptions.some((item) => item.code === "REWORK_SHORTFALL" && item.status === "OPEN" && Number(item.affected_quantity) === 5));
  for (const batch of workspace.inventoryBatches.filter((item) => item.product.sku === "KHK-DIA-A5-NAT")) {
    assert.equal(batch.physical_quantity, batch.released_quantity + batch.pending_quantity + batch.rework_quantity + batch.blocked_quantity + batch.damaged_quantity);
  }
  pass("split rework releases 45, damages 5, reconciles reservations, and remains idempotent");
}

async function verifySuccessfulDispatch(accounts) {
  await reset(accounts.manager);
  await driveToQuality(accounts, ORDER.success);
  await expectBlocked(accounts.quality, "RECORD_QC", ORDER.success, {
    result: "PASSED",
    checklist: {
      dimensions: true,
      binding: true,
      pageCount: true,
      coverFinish: true,
      branding: true,
      pagesClean: true,
      damageFree: false,
    },
    notes: "Deliberately incomplete checklist for the release guard test.",
  }, "ACTION_FAILED");
  let guardedWorkspace = await loadWorkspace(accounts.quality);
  assert.equal(findOrder(guardedWorkspace, ORDER.success).fulfillment_status, "AWAITING_QC");
  assert.ok(guardedWorkspace.auditEvents.some((item) => item.action === "RECORD_QC" && !item.success));

  await expectOk(accounts.quality, "RECORD_QC", ORDER.success, {
    result: "PASSED",
    checklist: {
      dimensions: true,
      binding: true,
      pageCount: true,
      coverFinish: true,
      branding: true,
      pagesClean: true,
      damageFree: true,
    },
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
    await verifyOrderQuantityValidation(accounts);
    await verifyMultiLineOrder(accounts);
    await verifyIdempotencyAndCancellation(accounts);
    await verifyConcurrentReservation(accounts);
    await verifyFailedQuality(accounts);
    await verifySplitRework(accounts);
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
