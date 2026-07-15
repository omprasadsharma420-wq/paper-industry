import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const logicCode = String.raw`
const rawInput = $input.first()?.json ?? {};

const POLICY_VERSION = "2026-07-15.dispatch-control.v2";
const REQUIRED_DOCUMENTS = [
  "COMMERCIAL_INVOICE",
  "DELIVERY_CHALLAN",
  "PACKING_LIST",
  "GATE_PASS",
];
const ROLES = [
  "DISPATCH_CLERK",
  "WAREHOUSE_QUALITY",
  "DISPATCH_SUPERVISOR",
  "GATE_SECURITY",
  "MANAGER_ADMIN",
];
const STATUSES = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "REJECTED",
  "APPROVED",
  "VEHICLE_ASSIGNED",
  "VEHICLE_ARRIVED",
  "LOADING",
  "AWAITING_WEIGHT_CHECK",
  "AWAITING_DOCUMENT_CHECK",
  "AWAITING_GATE_CLEARANCE",
  "CLEARED_FOR_EXIT",
  "DISPATCHED",
  "CANCELLED",
];

const ACTIONS = {
  HEALTH_CHECK: { roles: [], from: [], to: null },
  VALIDATE_DISPATCH: { roles: ["DISPATCH_CLERK", "DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: ["DRAFT", "AWAITING_APPROVAL"], to: "AWAITING_APPROVAL" },
  CHECK_INVENTORY: { roles: ["DISPATCH_CLERK", "WAREHOUSE_QUALITY", "DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: [], to: null },
  SUBMIT_FOR_APPROVAL: { roles: ["DISPATCH_CLERK", "MANAGER_ADMIN"], from: ["DRAFT"], to: "AWAITING_APPROVAL" },
  APPROVE_AND_RESERVE: { roles: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: ["AWAITING_APPROVAL"], to: "APPROVED" },
  ASSIGN_VEHICLE: { roles: ["DISPATCH_CLERK", "DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: ["APPROVED"], to: "VEHICLE_ASSIGNED" },
  MARK_VEHICLE_ARRIVED: { roles: ["GATE_SECURITY", "MANAGER_ADMIN"], from: ["VEHICLE_ASSIGNED"], to: "VEHICLE_ARRIVED" },
  START_LOADING: { roles: ["WAREHOUSE_QUALITY", "MANAGER_ADMIN"], from: ["VEHICLE_ARRIVED"], to: "LOADING" },
  COMPLETE_LOADING: { roles: ["WAREHOUSE_QUALITY", "MANAGER_ADMIN"], from: ["LOADING"], to: "AWAITING_WEIGHT_CHECK" },
  VERIFY_WEIGHT: { roles: ["WAREHOUSE_QUALITY", "MANAGER_ADMIN"], from: ["AWAITING_WEIGHT_CHECK"], to: "AWAITING_DOCUMENT_CHECK" },
  VERIFY_DOCUMENTS: { roles: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: ["AWAITING_DOCUMENT_CHECK"], to: "AWAITING_GATE_CLEARANCE" },
  CLEAR_GATE: { roles: ["GATE_SECURITY", "MANAGER_ADMIN"], from: ["AWAITING_GATE_CLEARANCE"], to: "CLEARED_FOR_EXIT" },
  CONFIRM_EXIT: { roles: ["GATE_SECURITY", "MANAGER_ADMIN"], from: ["CLEARED_FOR_EXIT"], to: "DISPATCHED" },
  RESOLVE_EXCEPTION: { roles: ["MANAGER_ADMIN"], from: [], to: null },
  REJECT: { roles: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: ["AWAITING_APPROVAL"], to: "REJECTED" },
  CANCEL: { roles: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"], from: ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "VEHICLE_ASSIGNED", "VEHICLE_ARRIVED", "LOADING", "AWAITING_WEIGHT_CHECK", "AWAITING_DOCUMENT_CHECK", "AWAITING_GATE_CLEARANCE", "CLEARED_FOR_EXIT"], to: "CANCELLED" },
};

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizePayload(input) {
  const body = parseMaybeJson(input.body);
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return {
      ...body,
      headers: input.headers ?? body.headers,
      query: input.query ?? body.query,
      params: input.params ?? body.params,
    };
  }

  if (input.query && input.query.action) {
    return {
      action: input.query.action,
      actor: { role: input.query.role, name: input.query.actorName },
      dispatch: {},
      inventory: [],
      query: input.query,
      headers: input.headers,
    };
  }

  return input;
}

function canonicalAction(value) {
  const raw = String(value || "HEALTH_CHECK").trim().toUpperCase().replace(/[-\s]+/g, "_");
  const aliases = {
    VALIDATE: "VALIDATE_DISPATCH",
    INVENTORY_CHECK: "CHECK_INVENTORY",
    RESERVE_INVENTORY: "APPROVE_AND_RESERVE",
    APPROVE: "APPROVE_AND_RESERVE",
    VEHICLE_ARRIVED: "MARK_VEHICLE_ARRIVED",
    LOADING_COMPLETE: "COMPLETE_LOADING",
    WEIGHT_CHECK: "VERIFY_WEIGHT",
    DOCUMENT_CHECK: "VERIFY_DOCUMENTS",
    GATE_CLEARANCE: "CLEAR_GATE",
    EXIT_CONFIRMATION: "CONFIRM_EXIT",
    DISPATCH: "CONFIRM_EXIT",
  };
  return aliases[raw] || raw;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function traceId() {
  return "n8n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function exception(code, message, severity = "HIGH", data = {}) {
  return {
    code,
    message,
    severity,
    controlStatus: severity === "LOW" ? "WARNING" : "BLOCKED",
    data,
  };
}

function warning(code, message, data = {}) {
  return {
    code,
    message,
    severity: "LOW",
    controlStatus: "WARNING",
    data,
  };
}

function lineProductCode(line) {
  return line.productCode || line.product_code || line.sku || line.code || "";
}

function lineUnit(line) {
  return line.unit || line.productUnit || line.product_unit || "";
}

function lineQty(line) {
  return toNumber(line.requestedQty ?? line.requested_qty ?? line.quantity ?? line.qty, 0);
}

function batchProductCode(batch) {
  return batch.productCode || batch.product_code || "";
}

function batchUnit(batch) {
  return batch.unit || batch.productUnit || batch.product_unit || "";
}

function batchAvailable(batch) {
  return Math.max(toNumber(batch.onHandQty ?? batch.on_hand_qty, 0) - toNumber(batch.reservedQty ?? batch.reserved_qty, 0), 0);
}

function batchQuality(batch) {
  return batch.qualityStatus || batch.quality_status || "PENDING_INSPECTION";
}

function batchId(batch) {
  return batch.id || batch.batchId || batch.batch_id || batch.batchNo || batch.batch_no || "";
}

function batchNo(batch) {
  return batch.batchNo || batch.batch_no || batch.id || "UNKNOWN_BATCH";
}

function sortBatches(a, b) {
  const producedA = a.producedOn || a.produced_on || "";
  const producedB = b.producedOn || b.produced_on || "";
  return String(producedA).localeCompare(String(producedB)) || String(batchNo(a)).localeCompare(String(batchNo(b)));
}

function activeExceptionCount(dispatch) {
  return asArray(dispatch.exceptions).filter((item) => !item.resolvedAt && !item.resolved_at).length;
}

function documentType(doc) {
  return doc.type || doc.documentType || doc.document_type || doc.name || "";
}

function documentPresent(doc) {
  return doc.present === true || doc.exists === true || doc.received === true;
}

function documentVerified(doc) {
  return doc.verified === true || doc.checked === true;
}

function normalizeDispatch(payload) {
  return payload.dispatch || payload.dispatchRequest || payload.request || {};
}

function normalizeInventory(payload) {
  return asArray(payload.inventory || payload.inventoryBatches || payload.batches);
}

function availableByProduct(inventory) {
  const map = {};
  for (const batch of inventory) {
    const productCode = batchProductCode(batch);
    if (!productCode) continue;
    if (!map[productCode]) {
      map[productCode] = {
        released: 0,
        blocked: 0,
        pending: 0,
        unit: batchUnit(batch),
        batches: [],
      };
    }
    const quality = batchQuality(batch);
    const available = batchAvailable(batch);
    if (quality === "RELEASED") map[productCode].released += available;
    if (quality === "BLOCKED") map[productCode].blocked += available;
    if (quality === "PENDING_INSPECTION") map[productCode].pending += available;
    map[productCode].batches.push({
      batchId: batchId(batch),
      batchNo: batchNo(batch),
      qualityStatus: quality,
      availableQty: available,
      unit: batchUnit(batch),
    });
  }
  return map;
}

function validateLines(dispatch, inventory, exceptions, warnings) {
  const lines = asArray(dispatch.lines);
  const availability = availableByProduct(inventory);

  if (lines.length === 0) {
    exceptions.push(exception("NO_DISPATCH_LINES", "Dispatch must contain at least one finished-goods line."));
    return { availability, reservations: [] };
  }

  const reservations = [];

  for (const line of lines) {
    const productCode = lineProductCode(line);
    const requestedQty = lineQty(line);
    const unit = lineUnit(line);
    const productName = line.productName || line.product_name || productCode || "Unknown product";

    if (!productCode) {
      exceptions.push(exception("MISSING_PRODUCT_CODE", "A dispatch line is missing productCode."));
      continue;
    }
    if (!unit || !["KG", "REAM"].includes(unit)) {
      exceptions.push(exception("INVALID_UNIT", "Line " + productCode + " must use KG or REAM. Automatic conversion is not allowed.", "HIGH", { productCode, unit }));
      continue;
    }
    if (requestedQty <= 0) {
      exceptions.push(exception("INVALID_QUANTITY", "Line " + productCode + " quantity must be greater than zero.", "HIGH", { productCode, requestedQty }));
      continue;
    }

    const productAvailability = availability[productCode] || { released: 0, blocked: 0, pending: 0, unit, batches: [] };
    const releasedBatches = inventory
      .filter((batch) => batchProductCode(batch) === productCode && batchQuality(batch) === "RELEASED")
      .filter((batch) => !batchUnit(batch) || batchUnit(batch) === unit)
      .sort(sortBatches);

    const mismatchedUnitBatches = inventory.filter((batch) => batchProductCode(batch) === productCode && batchUnit(batch) && batchUnit(batch) !== unit);
    if (mismatchedUnitBatches.length > 0) {
      exceptions.push(exception("UNIT_MISMATCH", "Line " + productCode + " uses " + unit + ", but one or more matching batches use another unit. No unit conversion is allowed.", "HIGH", { productCode, unit }));
    }

    if (productAvailability.blocked > 0) {
      warnings.push(warning("QUALITY_BLOCKED_STOCK_EXISTS", productName + " has blocked stock that must not be dispatched.", { productCode, blockedQty: productAvailability.blocked, unit }));
    }
    if (productAvailability.pending > 0) {
      warnings.push(warning("PENDING_INSPECTION_STOCK_EXISTS", productName + " has stock pending inspection and unavailable for dispatch.", { productCode, pendingQty: productAvailability.pending, unit }));
    }
    if (productAvailability.released < requestedQty) {
      exceptions.push(exception("INSUFFICIENT_RELEASED_STOCK", "Requested " + requestedQty + " " + unit + " of " + productName + ", but only " + productAvailability.released + " " + unit + " released stock is available.", "HIGH", { productCode, requestedQty, releasedQty: productAvailability.released, unit }));
      continue;
    }

    let remaining = requestedQty;
    const allocation = [];
    for (const batch of releasedBatches) {
      if (remaining <= 0) break;
      const available = batchAvailable(batch);
      if (available <= 0) continue;
      const qty = Math.min(available, remaining);
      allocation.push({
        batchId: batchId(batch),
        batchNo: batchNo(batch),
        qty,
        unit,
      });
      remaining -= qty;
    }

    if (remaining > 0) {
      exceptions.push(exception("RESERVATION_ALLOCATION_FAILED", "Released stock summary looked sufficient, but FIFO allocation could not fully reserve " + productName + ".", "HIGH", { productCode, remainingQty: remaining, unit }));
    } else {
      reservations.push({
        lineId: line.id || line.lineId || null,
        productCode,
        productName,
        requestedQty,
        unit,
        batches: allocation,
      });
    }
  }

  return { availability, reservations };
}

function validateWeight(dispatch, exceptions, warnings) {
  const lines = asArray(dispatch.lines);
  const expectedFromLines = lines
    .filter((line) => lineUnit(line) === "KG")
    .reduce((sum, line) => sum + lineQty(line), 0);
  const expected = toNumber(dispatch.expectedWeightKg ?? dispatch.expected_weight_kg, expectedFromLines);
  const actual = toNumber(dispatch.actualWeightKg ?? dispatch.actual_weight_kg, NaN);
  const tolerance = toNumber(dispatch.weightTolerancePercent ?? dispatch.weight_tolerance_percent, 1.5);

  if (expected <= 0) {
    return {
      required: false,
      expectedWeightKg: 0,
      actualWeightKg: null,
      tolerancePercent: tolerance,
      variancePercent: null,
      withinTolerance: true,
    };
  }

  if (!Number.isFinite(actual) || actual <= 0) {
    exceptions.push(exception("MISSING_ACTUAL_WEIGHT", "Actual vehicle/loading weight is required before document check.", "HIGH", { expectedWeightKg: expected }));
    return {
      required: true,
      expectedWeightKg: expected,
      actualWeightKg: null,
      tolerancePercent: tolerance,
      variancePercent: null,
      withinTolerance: false,
    };
  }

  const variancePercent = Math.abs(((actual - expected) / expected) * 100);
  const withinTolerance = variancePercent <= tolerance;
  if (!withinTolerance) {
    exceptions.push(exception("WEIGHT_VARIANCE_EXCEEDED", "Actual weight variance is " + variancePercent.toFixed(2) + "%, above the approved " + tolerance + "% tolerance.", "HIGH", { expectedWeightKg: expected, actualWeightKg: actual, variancePercent: Number(variancePercent.toFixed(2)), tolerancePercent: tolerance }));
  } else if (variancePercent > tolerance * 0.75) {
    warnings.push(warning("WEIGHT_VARIANCE_NEAR_LIMIT", "Actual weight variance is close to the allowed tolerance.", { variancePercent: Number(variancePercent.toFixed(2)), tolerancePercent: tolerance }));
  }

  return {
    required: true,
    expectedWeightKg: expected,
    actualWeightKg: actual,
    tolerancePercent: tolerance,
    variancePercent: Number(variancePercent.toFixed(2)),
    withinTolerance,
  };
}

function validateDocuments(dispatch, exceptions, warnings, requireVerified) {
  const docs = asArray(dispatch.documents);
  const byType = {};
  for (const doc of docs) {
    byType[documentType(doc)] = doc;
  }

  const documentReport = [];
  for (const requiredType of REQUIRED_DOCUMENTS) {
    const doc = byType[requiredType];
    const present = !!doc && documentPresent(doc);
    const verified = !!doc && documentVerified(doc);
    documentReport.push({ type: requiredType, present, verified });

    if (!present) {
      exceptions.push(exception("MISSING_DOCUMENT", requiredType + " is missing. Gate clearance is blocked.", "HIGH", { documentType: requiredType }));
    } else if (requireVerified && !verified) {
      exceptions.push(exception("DOCUMENT_NOT_VERIFIED", requiredType + " is present but not verified.", "HIGH", { documentType: requiredType }));
    } else if (!verified) {
      warnings.push(warning("DOCUMENT_PRESENT_NOT_VERIFIED", requiredType + " is present but still needs verification.", { documentType: requiredType }));
    }
  }

  return documentReport;
}

function validateVehicle(dispatch, exceptions) {
  const vehicle = dispatch.vehicle || dispatch.vehicleAssignment || {};
  const missing = [];
  if (!vehicle.vehicleNo && !vehicle.vehicle_no) missing.push("vehicleNo");
  if (!vehicle.transporter) missing.push("transporter");
  if (!vehicle.driverName && !vehicle.driver_name) missing.push("driverName");
  if (!vehicle.driverPhone && !vehicle.driver_phone) missing.push("driverPhone");

  if (missing.length > 0) {
    exceptions.push(exception("VEHICLE_DETAILS_INCOMPLETE", "Vehicle assignment is missing: " + missing.join(", ") + ".", "HIGH", { missing }));
  }

  return {
    present: missing.length === 0,
    vehicleNo: vehicle.vehicleNo || vehicle.vehicle_no || null,
    transporter: vehicle.transporter || null,
    driverName: vehicle.driverName || vehicle.driver_name || null,
  };
}

function inventoryMutationsForReservation(reservations) {
  return reservations.flatMap((reservation) =>
    reservation.batches.map((batch) => ({
      type: "RESERVE",
      productCode: reservation.productCode,
      batchId: batch.batchId,
      batchNo: batch.batchNo,
      qty: batch.qty,
      unit: batch.unit,
    }))
  );
}

function inventoryMutationsForDeduction(dispatch) {
  const mutations = [];
  const lines = asArray(dispatch.lines);
  for (const line of lines) {
    const reserved = asArray(line.reservations || line.reservedBatches || line.reserved_batches);
    if (reserved.length > 0) {
      for (const item of reserved) {
        mutations.push({
          type: "DEDUCT_RESERVED",
          productCode: lineProductCode(line),
          batchId: item.batchId || item.batch_id || item.id || null,
          batchNo: item.batchNo || item.batch_no || null,
          qty: toNumber(item.qty ?? item.quantity ?? item.reservedQty ?? item.reserved_qty, 0),
          unit: lineUnit(line),
        });
      }
    } else {
      mutations.push({
        type: "DEDUCT_RESERVED",
        productCode: lineProductCode(line),
        batchId: null,
        batchNo: null,
        qty: lineQty(line),
        unit: lineUnit(line),
        note: "No batch-level reservation details supplied. Deduct from existing reservations in database.",
      });
    }
  }
  return mutations;
}

const payload = normalizePayload(rawInput);
const action = canonicalAction(payload.action || payload.operation || payload.event);
const dispatch = normalizeDispatch(payload);
const inventory = normalizeInventory(payload);
const actor = payload.actor || {};
const actorRole = payload.role || payload.actorRole || actor.role || null;
const actorName = payload.actorName || actor.name || "n8n dispatch control";
const currentStatus = dispatch.status || payload.status || null;
const trace = payload.traceId || traceId();
const exceptions = [];
const warnings = [];
const actionConfig = ACTIONS[action];

let reservations = [];
let inventoryMutations = [];
let availability = {};
let weightReport = null;
let documentReport = [];
let vehicleReport = null;
let recommendedNextStatus = null;
let nextRequiredRole = null;

if (!actionConfig) {
  exceptions.push(exception("UNKNOWN_ACTION", "Unknown dispatch workflow action: " + action + ".", "HIGH", { action }));
} else if (action === "HEALTH_CHECK") {
  recommendedNextStatus = currentStatus;
} else {
  if (!actorRole) {
    exceptions.push(exception("MISSING_ACTOR_ROLE", "actor.role is required for controlled workflow actions.", "HIGH", { action }));
  } else if (!ROLES.includes(actorRole)) {
    exceptions.push(exception("INVALID_ACTOR_ROLE", "Invalid actor role: " + actorRole + ".", "HIGH", { actorRole }));
  } else if (actionConfig.roles.length > 0 && !actionConfig.roles.includes(actorRole)) {
    exceptions.push(exception("ROLE_NOT_AUTHORIZED", actorRole + " cannot perform " + action + ".", "HIGH", { action, actorRole, allowedRoles: actionConfig.roles }));
  }

  if (actionConfig.from.length > 0) {
    if (!currentStatus || !STATUSES.includes(currentStatus)) {
      exceptions.push(exception("INVALID_CURRENT_STATUS", "A valid current workflow status is required for " + action + ".", "HIGH", { currentStatus }));
    } else if (!actionConfig.from.includes(currentStatus)) {
      exceptions.push(exception("STATUS_TRANSITION_NOT_ALLOWED", action + " cannot run from " + currentStatus + ".", "HIGH", { currentStatus, allowedFrom: actionConfig.from }));
    }
  }

  if (["VALIDATE_DISPATCH", "CHECK_INVENTORY", "SUBMIT_FOR_APPROVAL", "APPROVE_AND_RESERVE"].includes(action)) {
    const result = validateLines(dispatch, inventory, exceptions, warnings);
    availability = result.availability;
    reservations = result.reservations;
    if (action === "APPROVE_AND_RESERVE") {
      inventoryMutations = inventoryMutationsForReservation(reservations);
    }
  }

  if (["ASSIGN_VEHICLE", "MARK_VEHICLE_ARRIVED", "START_LOADING", "COMPLETE_LOADING", "CLEAR_GATE", "CONFIRM_EXIT"].includes(action)) {
    vehicleReport = validateVehicle(dispatch, exceptions);
  }

  if (["VERIFY_WEIGHT", "CLEAR_GATE", "CONFIRM_EXIT"].includes(action)) {
    weightReport = validateWeight(dispatch, exceptions, warnings);
  }

  if (["VERIFY_DOCUMENTS", "CLEAR_GATE", "CONFIRM_EXIT"].includes(action)) {
    documentReport = validateDocuments(dispatch, exceptions, warnings, action !== "VERIFY_DOCUMENTS");
  }

  if (["CLEAR_GATE", "CONFIRM_EXIT"].includes(action) && activeExceptionCount(dispatch) > 0) {
    exceptions.push(exception("ACTIVE_EXCEPTIONS_EXIST", "Dispatch has unresolved exceptions. Manager/Admin must resolve them before gate exit.", "HIGH", { activeExceptionCount: activeExceptionCount(dispatch) }));
  }

  if (action === "CONFIRM_EXIT") {
    inventoryMutations = inventoryMutationsForDeduction(dispatch);
  }

  if (action === "RESOLVE_EXCEPTION") {
    if (currentStatus === "AWAITING_WEIGHT_CHECK") recommendedNextStatus = "AWAITING_DOCUMENT_CHECK";
    else if (currentStatus === "AWAITING_DOCUMENT_CHECK") recommendedNextStatus = "AWAITING_GATE_CLEARANCE";
    else if (currentStatus === "REJECTED") recommendedNextStatus = "AWAITING_APPROVAL";
    else recommendedNextStatus = currentStatus;
  }

  if (!recommendedNextStatus) {
    recommendedNextStatus = exceptions.some((item) => item.controlStatus === "BLOCKED")
      ? (currentStatus || null)
      : actionConfig.to || currentStatus || null;
  }

  if (recommendedNextStatus === "AWAITING_APPROVAL") nextRequiredRole = "DISPATCH_SUPERVISOR";
  if (recommendedNextStatus === "APPROVED") nextRequiredRole = "DISPATCH_CLERK";
  if (recommendedNextStatus === "VEHICLE_ASSIGNED") nextRequiredRole = "GATE_SECURITY";
  if (recommendedNextStatus === "VEHICLE_ARRIVED" || recommendedNextStatus === "LOADING" || recommendedNextStatus === "AWAITING_WEIGHT_CHECK") nextRequiredRole = "WAREHOUSE_QUALITY";
  if (recommendedNextStatus === "AWAITING_DOCUMENT_CHECK") nextRequiredRole = "DISPATCH_SUPERVISOR";
  if (recommendedNextStatus === "AWAITING_GATE_CLEARANCE" || recommendedNextStatus === "CLEARED_FOR_EXIT") nextRequiredRole = "GATE_SECURITY";
}

const hasBlock = exceptions.some((item) => item.controlStatus === "BLOCKED");
const controlStatus = hasBlock ? "BLOCKED" : warnings.length > 0 ? "WARNING" : "CLEAR";
const ok = !hasBlock;
const auditNote = ok
  ? action + " passed dispatch controls."
  : action + " blocked by " + exceptions.map((item) => item.code).join(", ") + ".";

return [
  {
    json: {
      ok,
      httpStatus: ok ? 200 : 422,
      policyVersion: POLICY_VERSION,
      traceId: trace,
      receivedAt: nowIso(),
      action,
      requestNo: dispatch.requestNo || dispatch.request_no || null,
      dispatchId: dispatch.id || null,
      currentStatus,
      recommendedNextStatus,
      nextRequiredRole,
      controlStatus,
      exceptions,
      warnings,
      reservations,
      inventoryMutations,
      report: {
        lineCount: asArray(dispatch.lines).length,
        availability,
        weight: weightReport,
        documents: documentReport,
        vehicle: vehicleReport,
      },
      auditEvent: {
        dispatchId: dispatch.id || null,
        requestNo: dispatch.requestNo || dispatch.request_no || null,
        actorName,
        actorRole,
        action,
        fromStatus: currentStatus,
        toStatus: recommendedNextStatus,
        controlStatus,
        note: auditNote,
        at: nowIso(),
        traceId: trace,
      },
      uiMessage: ok
        ? "Control check passed. Recommended next status: " + (recommendedNextStatus || "unchanged") + "."
        : "Control check blocked. Review exceptions before proceeding.",
    },
  },
];
`;

const workflow = {
  name: "Paper Industry - Dispatch Control API",
  active: false,
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "paper-dispatch-control",
        responseMode: "lastNode",
        responseData: "firstEntryJson",
        options: {},
      },
      id: "9d5b2b56-1e6b-4f12-8d46-84e89a2d6001",
      name: "POST Dispatch Control",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-520, -80],
      webhookId: "paper-dispatch-control",
    },
    {
      parameters: {
        httpMethod: "GET",
        path: "paper-dispatch-health",
        responseMode: "lastNode",
        responseData: "firstEntryJson",
        options: {},
      },
      id: "2c29a4d7-25a4-470f-9983-2b60c87b097f",
      name: "GET Health Check",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-520, 120],
      webhookId: "paper-dispatch-health",
    },
    {
      parameters: {
        mode: "runOnceForAllItems",
        language: "javaScript",
        jsCode: logicCode.trim(),
      },
      id: "647b6752-1e2b-4dfa-82c1-6f5f73412ed5",
      name: "Evaluate Dispatch Controls",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-160, 0],
    },
  ],
  connections: {
    "POST Dispatch Control": {
      main: [[{ node: "Evaluate Dispatch Controls", type: "main", index: 0 }]],
    },
    "GET Health Check": {
      main: [[{ node: "Evaluate Dispatch Controls", type: "main", index: 0 }]],
    },
  },
  pinData: {},
  settings: {
    executionOrder: "v1",
    saveManualExecutions: true,
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
  },
  staticData: null,
  tags: [],
  triggerCount: 2,
  updatedAt: "2026-07-15T00:00:00.000Z",
  versionId: "73598591-89f0-40fd-a777-e23e611cb41b",
};

const outputPath = resolve(process.cwd(), "n8n", "dispatch-control-workflow.json");
writeFileSync(outputPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(outputPath);
