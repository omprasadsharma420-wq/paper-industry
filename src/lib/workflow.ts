import type {
  AppState,
  AppUser,
  AuditEntry,
  ControlStatus,
  DispatchException,
  DispatchLine,
  DispatchRequest,
  InventoryBatch,
  UserRole,
  WorkflowResult,
  WorkflowStatus,
} from "./types";
import { requiredDocuments } from "./demo-data";

export type WorkflowAction =
  | "SUBMIT_FOR_APPROVAL"
  | "APPROVE_AND_RESERVE"
  | "REJECT"
  | "ASSIGN_VEHICLE"
  | "MARK_VEHICLE_ARRIVED"
  | "START_LOADING"
  | "COMPLETE_LOADING"
  | "VERIFY_WEIGHT"
  | "VERIFY_DOCUMENTS"
  | "CLEAR_GATE"
  | "CONFIRM_EXIT"
  | "RESOLVE_EXCEPTION"
  | "CANCEL";

export interface CreateDispatchInput {
  customerName: string;
  customerType: DispatchRequest["customerType"];
  destination: string;
  priority: DispatchRequest["priority"];
  productCode: string;
  requestedQty: number;
  requestedDispatchDate: string;
}

export const statusLabels: Record<WorkflowStatus, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Awaiting Approval",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  VEHICLE_ASSIGNED: "Vehicle Assigned",
  VEHICLE_ARRIVED: "Vehicle Arrived",
  LOADING: "Loading",
  AWAITING_WEIGHT_CHECK: "Awaiting Weight Check",
  AWAITING_DOCUMENT_CHECK: "Awaiting Document Check",
  AWAITING_GATE_CLEARANCE: "Awaiting Gate Clearance",
  CLEARED_FOR_EXIT: "Cleared for Exit",
  DISPATCHED: "Dispatched",
  CANCELLED: "Cancelled",
};

export const roleLabels: Record<UserRole, string> = {
  DISPATCH_CLERK: "Dispatch Clerk",
  WAREHOUSE_QUALITY: "Warehouse / Quality",
  DISPATCH_SUPERVISOR: "Dispatch Supervisor",
  GATE_SECURITY: "Gate Security",
  MANAGER_ADMIN: "Manager / Admin",
};

export const workflowOrder: WorkflowStatus[] = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "VEHICLE_ASSIGNED",
  "VEHICLE_ARRIVED",
  "LOADING",
  "AWAITING_WEIGHT_CHECK",
  "AWAITING_DOCUMENT_CHECK",
  "AWAITING_GATE_CLEARANCE",
  "CLEARED_FOR_EXIT",
  "DISPATCHED",
];

export const actionLabels: Record<WorkflowAction, string> = {
  SUBMIT_FOR_APPROVAL: "Submit",
  APPROVE_AND_RESERVE: "Approve & Reserve",
  REJECT: "Reject",
  ASSIGN_VEHICLE: "Assign Vehicle",
  MARK_VEHICLE_ARRIVED: "Mark Arrived",
  START_LOADING: "Start Loading",
  COMPLETE_LOADING: "Complete Loading",
  VERIFY_WEIGHT: "Verify Weight",
  VERIFY_DOCUMENTS: "Verify Docs",
  CLEAR_GATE: "Clear Gate",
  CONFIRM_EXIT: "Confirm Exit",
  RESOLVE_EXCEPTION: "Resolve Exception",
  CANCEL: "Cancel",
};

const actionRoles: Record<WorkflowAction, UserRole[]> = {
  SUBMIT_FOR_APPROVAL: ["DISPATCH_CLERK", "MANAGER_ADMIN"],
  APPROVE_AND_RESERVE: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"],
  REJECT: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"],
  ASSIGN_VEHICLE: ["DISPATCH_CLERK", "DISPATCH_SUPERVISOR", "MANAGER_ADMIN"],
  MARK_VEHICLE_ARRIVED: ["GATE_SECURITY", "MANAGER_ADMIN"],
  START_LOADING: ["WAREHOUSE_QUALITY", "MANAGER_ADMIN"],
  COMPLETE_LOADING: ["WAREHOUSE_QUALITY", "MANAGER_ADMIN"],
  VERIFY_WEIGHT: ["WAREHOUSE_QUALITY", "MANAGER_ADMIN"],
  VERIFY_DOCUMENTS: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"],
  CLEAR_GATE: ["GATE_SECURITY", "MANAGER_ADMIN"],
  CONFIRM_EXIT: ["GATE_SECURITY", "MANAGER_ADMIN"],
  RESOLVE_EXCEPTION: ["MANAGER_ADMIN"],
  CANCEL: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"],
};

export function availableQty(batch: InventoryBatch): number {
  return Math.max(batch.onHandQty - batch.reservedQty, 0);
}

export function releasedAvailableQty(inventory: InventoryBatch[], productCode: string): number {
  return inventory
    .filter(
      (batch) => batch.productCode === productCode && batch.qualityStatus === "RELEASED",
    )
    .reduce((sum, batch) => sum + availableQty(batch), 0);
}

export function deriveControlStatus(dispatch: DispatchRequest): ControlStatus {
  if (dispatch.status === "CANCELLED" || dispatch.status === "REJECTED") {
    return dispatch.exceptions.some((item) => !item.resolvedAt) ? "BLOCKED" : "WARNING";
  }

  const active = dispatch.exceptions.filter((item) => !item.resolvedAt);
  if (active.some((item) => item.controlStatus === "BLOCKED")) {
    return "BLOCKED";
  }
  if (active.length > 0) {
    return "WARNING";
  }
  return "CLEAR";
}

export function getWorkflowProgress(status: WorkflowStatus): number {
  const index = workflowOrder.indexOf(status);
  if (index < 0) return status === "REJECTED" || status === "CANCELLED" ? 0 : 5;
  return Math.round((index / (workflowOrder.length - 1)) * 100);
}

export function getDispatchAgeHours(dispatch: DispatchRequest): number {
  const created = new Date(dispatch.createdAt).getTime();
  const now = new Date("2026-07-15T16:00:00+05:45").getTime();
  return Math.max(Math.round((now - created) / 360_000) / 10, 0);
}

export function canPerform(action: WorkflowAction, role: UserRole): boolean {
  return actionRoles[action].includes(role);
}

export function getAvailableActions(dispatch: DispatchRequest, role: UserRole): WorkflowAction[] {
  const actions: WorkflowAction[] = [];

  if (dispatch.controlStatus === "BLOCKED" && canPerform("RESOLVE_EXCEPTION", role)) {
    actions.push("RESOLVE_EXCEPTION");
  }

  const add = (action: WorkflowAction) => {
    if (canPerform(action, role)) actions.push(action);
  };

  if (dispatch.status === "DRAFT") add("SUBMIT_FOR_APPROVAL");
  if (dispatch.status === "AWAITING_APPROVAL") {
    add("APPROVE_AND_RESERVE");
    add("REJECT");
  }
  if (dispatch.status === "APPROVED") add("ASSIGN_VEHICLE");
  if (dispatch.status === "VEHICLE_ASSIGNED") add("MARK_VEHICLE_ARRIVED");
  if (dispatch.status === "VEHICLE_ARRIVED") add("START_LOADING");
  if (dispatch.status === "LOADING") add("COMPLETE_LOADING");
  if (dispatch.status === "AWAITING_WEIGHT_CHECK" && dispatch.controlStatus !== "BLOCKED") {
    add("VERIFY_WEIGHT");
  }
  if (dispatch.status === "AWAITING_DOCUMENT_CHECK" && dispatch.controlStatus !== "BLOCKED") {
    add("VERIFY_DOCUMENTS");
  }
  if (dispatch.status === "AWAITING_GATE_CLEARANCE") add("CLEAR_GATE");
  if (dispatch.status === "CLEARED_FOR_EXIT") add("CONFIRM_EXIT");

  if (!["DISPATCHED", "CANCELLED", "REJECTED"].includes(dispatch.status)) {
    add("CANCEL");
  }

  return Array.from(new Set(actions));
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function audit(
  dispatch: DispatchRequest,
  actor: AppUser,
  action: string,
  note: string,
  toStatus?: WorkflowStatus,
): AuditEntry {
  return {
    id: nextId("audit"),
    dispatchId: dispatch.id,
    at: nowIso(),
    actor: actor.name,
    role: actor.role,
    action,
    fromStatus: dispatch.status,
    toStatus,
    note,
  };
}

function exception(
  dispatch: DispatchRequest,
  code: string,
  message: string,
): DispatchException {
  return {
    id: nextId("exception"),
    dispatchId: dispatch.id,
    code,
    message,
    severity: "HIGH",
    controlStatus: "BLOCKED",
    createdAt: nowIso(),
  };
}

function cloneState(state: AppState): AppState {
  return structuredClone(state) as AppState;
}

function validateDispatch(dispatch: DispatchRequest, inventory: InventoryBatch[]): string[] {
  const errors: string[] = [];

  for (const line of dispatch.lines) {
    const related = inventory.filter((batch) => batch.productCode === line.productCode);
    const releasedQty = releasedAvailableQty(inventory, line.productCode);
    const blocked = related.find((batch) => batch.qualityStatus === "BLOCKED");

    if (line.requestedQty <= 0) {
      errors.push(`${line.productName} quantity must be greater than zero.`);
    }
    if (releasedQty < line.requestedQty) {
      errors.push(
        `${line.productName} has ${releasedQty.toLocaleString()} ${line.unit} released stock against ${line.requestedQty.toLocaleString()} ${line.unit} requested.`,
      );
    }
    if (blocked && releasedQty < line.requestedQty) {
      errors.push(`${blocked.batchNo} is quality blocked and cannot be used for dispatch.`);
    }
  }

  return errors;
}

function reserveLines(
  dispatch: DispatchRequest,
  inventory: InventoryBatch[],
): { inventory: InventoryBatch[]; lines: DispatchLine[]; errors: string[] } {
  const nextInventory = inventory.map((batch) => ({ ...batch }));
  const errors = validateDispatch(dispatch, nextInventory);

  if (errors.length > 0) {
    return { inventory: nextInventory, lines: dispatch.lines, errors };
  }

  const lines = dispatch.lines.map((line) => {
    let remaining = line.requestedQty;
    const reservedBatchIds: string[] = [];

    for (const batch of nextInventory) {
      if (
        batch.productCode !== line.productCode ||
        batch.qualityStatus !== "RELEASED" ||
        remaining <= 0
      ) {
        continue;
      }

      const qty = Math.min(availableQty(batch), remaining);
      if (qty > 0) {
        batch.reservedQty += qty;
        remaining -= qty;
        reservedBatchIds.push(batch.id);
      }
    }

    return { ...line, reservedBatchIds };
  });

  return { inventory: nextInventory, lines, errors: [] };
}

function deductReserved(dispatch: DispatchRequest, inventory: InventoryBatch[]): InventoryBatch[] {
  const nextInventory = inventory.map((batch) => ({ ...batch }));

  for (const line of dispatch.lines) {
    let remaining = line.requestedQty;

    for (const batch of nextInventory) {
      if (!line.reservedBatchIds.includes(batch.id) || remaining <= 0) continue;

      const qty = Math.min(batch.reservedQty, remaining);
      batch.reservedQty -= qty;
      batch.onHandQty -= qty;
      remaining -= qty;
    }
  }

  return nextInventory;
}

function updateDispatch(
  state: AppState,
  dispatchId: string,
  updater: (dispatch: DispatchRequest, state: AppState) => DispatchRequest,
): AppState {
  const next = cloneState(state);
  next.dispatches = next.dispatches.map((dispatch) =>
    dispatch.id === dispatchId ? updater(dispatch, next) : dispatch,
  );
  return next;
}

export function createDispatch(
  state: AppState,
  actor: AppUser,
  input: CreateDispatchInput,
): WorkflowResult {
  const product = state.products.find((item) => item.code === input.productCode);
  if (!product) {
    return { state, dispatchId: "", message: "Product was not found." };
  }

  const next = cloneState(state);
  const id = nextId("dispatch");
  const sequence = next.dispatches.length + 1;
  const requestNo = `FGD-2026-0715-${String(sequence).padStart(3, "0")}`;
  const dispatch: DispatchRequest = {
    id,
    requestNo,
    customerName: input.customerName.trim() || "New Customer",
    customerType: input.customerType,
    destination: input.destination.trim() || "Pending destination",
    status: "DRAFT",
    controlStatus: "CLEAR",
    priority: input.priority,
    createdAt: nowIso(),
    requestedDispatchDate: input.requestedDispatchDate,
    createdBy: actor.name,
    lines: [
      {
        id: nextId("line"),
        productCode: product.code,
        productName: product.name,
        productType: product.productType,
        unit: product.unit,
        requestedQty: input.requestedQty,
        reservedBatchIds: [],
      },
    ],
    documents: requiredDocuments.map((doc) => ({ ...doc, present: true, verified: false })),
    expectedWeightKg: product.unit === "KG" ? input.requestedQty : 0,
    weightTolerancePercent: 1.5,
    exceptions: [],
    audit: [],
  };

  dispatch.audit.push(audit(dispatch, actor, "CREATED", "Dispatch request created.", "DRAFT"));
  next.dispatches = [dispatch, ...next.dispatches];

  return { state: next, dispatchId: id, message: `${requestNo} created as draft.` };
}

export function performWorkflowAction(
  state: AppState,
  dispatchId: string,
  actor: AppUser,
  action: WorkflowAction,
): WorkflowResult {
  const target = state.dispatches.find((dispatch) => dispatch.id === dispatchId);
  if (!target) return { state, dispatchId, message: "Dispatch was not found." };

  if (!canPerform(action, actor.role)) {
    return {
      state,
      dispatchId,
      message: `${actor.role} cannot perform ${actionLabels[action]}.`,
    };
  }

  let message = `${actionLabels[action]} completed.`;
  const nextState = updateDispatch(state, dispatchId, (dispatch, workingState) => {
    const nextDispatch = { ...dispatch, audit: [...dispatch.audit], exceptions: [...dispatch.exceptions] };
    let nextStatus: WorkflowStatus | undefined;
    let note = "";

    if (action === "SUBMIT_FOR_APPROVAL") {
      const errors = validateDispatch(nextDispatch, workingState.inventory);
      if (errors.length > 0) {
        nextStatus = "REJECTED";
        nextDispatch.exceptions.push(
          exception(nextDispatch, "VALIDATION_BLOCKED", errors.join(" ")),
        );
        note = errors.join(" ");
        message = "Validation failed. Dispatch moved to rejected.";
      } else {
        nextStatus = "AWAITING_APPROVAL";
        note = "Stock and quality validation passed. Awaiting approval.";
      }
    }

    if (action === "APPROVE_AND_RESERVE") {
      const reservation = reserveLines(nextDispatch, workingState.inventory);
      if (reservation.errors.length > 0) {
        nextStatus = "REJECTED";
        nextDispatch.exceptions.push(
          exception(nextDispatch, "RESERVATION_FAILED", reservation.errors.join(" ")),
        );
        note = reservation.errors.join(" ");
        message = "Approval blocked because reservation failed.";
      } else {
        workingState.inventory = reservation.inventory;
        nextDispatch.lines = reservation.lines;
        nextDispatch.approvedBy = actor.name;
        nextStatus = "APPROVED";
        note = "Approved and released inventory reserved by FIFO.";
      }
    }

    if (action === "REJECT") {
      nextStatus = "REJECTED";
      nextDispatch.exceptions.push(
        exception(nextDispatch, "MANUAL_REJECTION", "Rejected by dispatch supervisor."),
      );
      note = "Rejected by approver.";
    }

    if (action === "ASSIGN_VEHICLE") {
      nextStatus = "VEHICLE_ASSIGNED";
      nextDispatch.vehicle = {
        vehicleNo: "Bagmati 03-001 Kha 7821",
        transporter: "Koshi Freight Service",
        driverName: "Nabin Shrestha",
        driverPhone: "9801234567",
        expectedArrival: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
      note = "Vehicle and driver assigned.";
    }

    if (action === "MARK_VEHICLE_ARRIVED") {
      nextStatus = "VEHICLE_ARRIVED";
      note = "Vehicle arrival recorded by gate security.";
    }

    if (action === "START_LOADING") {
      nextStatus = "LOADING";
      note = "Loading started by warehouse team.";
    }

    if (action === "COMPLETE_LOADING") {
      nextStatus = "AWAITING_WEIGHT_CHECK";
      if (!nextDispatch.expectedWeightKg) {
        nextDispatch.expectedWeightKg = nextDispatch.lines
          .filter((line) => line.unit === "KG")
          .reduce((sum, line) => sum + line.requestedQty, 0);
      }
      note = "Loading completed. Weight verification required.";
    }

    if (action === "VERIFY_WEIGHT") {
      const expected = nextDispatch.expectedWeightKg ?? 0;
      const actual =
        nextDispatch.actualWeightKg ?? (expected > 0 ? Math.round(expected * 1.006) : 0);
      nextDispatch.actualWeightKg = actual;

      if (expected > 0) {
        const variance = Math.abs(((actual - expected) / expected) * 100);
        if (variance > nextDispatch.weightTolerancePercent) {
          nextDispatch.exceptions.push(
            exception(
              nextDispatch,
              "WEIGHT_VARIANCE_EXCEEDED",
              `Actual weight variance is ${variance.toFixed(2)}%, above ${nextDispatch.weightTolerancePercent}%.`,
            ),
          );
          nextStatus = "AWAITING_WEIGHT_CHECK";
          note = "Weight variance exceeded tolerance and blocked the dispatch.";
          message = "Weight variance exceeded tolerance.";
        } else {
          nextStatus = "AWAITING_DOCUMENT_CHECK";
          note = "Weight verified within tolerance.";
        }
      } else {
        nextStatus = "AWAITING_DOCUMENT_CHECK";
        note = "Sheet ream dispatch does not require KG conversion; moved to document check.";
      }
    }

    if (action === "VERIFY_DOCUMENTS") {
      const missing = nextDispatch.documents.filter((doc) => !doc.present);
      if (missing.length > 0) {
        nextDispatch.exceptions.push(
          exception(
            nextDispatch,
            "MISSING_DOCUMENT",
            `Missing documents: ${missing.map((doc) => doc.type).join(", ")}.`,
          ),
        );
        nextStatus = "AWAITING_DOCUMENT_CHECK";
        note = "Document check blocked by missing document.";
        message = "Document check blocked.";
      } else {
        nextDispatch.documents = nextDispatch.documents.map((doc) => ({
          ...doc,
          verified: true,
        }));
        nextStatus = "AWAITING_GATE_CLEARANCE";
        note = "All dispatch documents verified.";
      }
    }

    if (action === "CLEAR_GATE") {
      nextStatus = "CLEARED_FOR_EXIT";
      note = "Gate clearance granted.";
    }

    if (action === "CONFIRM_EXIT") {
      workingState.inventory = deductReserved(nextDispatch, workingState.inventory);
      nextStatus = "DISPATCHED";
      note = "Vehicle exit confirmed. Reserved inventory deducted.";
    }

    if (action === "RESOLVE_EXCEPTION") {
      nextDispatch.exceptions = nextDispatch.exceptions.map((item) => ({
        ...item,
        resolvedAt: item.resolvedAt ?? nowIso(),
        controlStatus: "WARNING",
      }));

      if (nextDispatch.status === "AWAITING_WEIGHT_CHECK") {
        nextStatus = "AWAITING_DOCUMENT_CHECK";
        note = "Manager override accepted weight variance for pilot dispatch.";
      } else if (nextDispatch.status === "AWAITING_DOCUMENT_CHECK") {
        nextDispatch.documents = nextDispatch.documents.map((doc) => ({
          ...doc,
          present: true,
          verified: true,
        }));
        nextStatus = "AWAITING_GATE_CLEARANCE";
        note = "Manager verified corrected documentation.";
      } else if (nextDispatch.status === "REJECTED") {
        nextStatus = "AWAITING_APPROVAL";
        note = "Exception resolved and request returned to approval queue.";
      } else {
        note = "Exception marked resolved.";
      }
    }

    if (action === "CANCEL") {
      nextStatus = "CANCELLED";
      nextDispatch.exceptions.push(
        exception(nextDispatch, "CANCELLED_BY_USER", "Dispatch cancelled before factory exit."),
      );
      note = "Dispatch cancelled before exit.";
    }

    if (nextStatus) {
      nextDispatch.audit.push(audit(nextDispatch, actor, action, note, nextStatus));
      nextDispatch.status = nextStatus;
    } else {
      nextDispatch.audit.push(audit(nextDispatch, actor, action, "Action recorded."));
    }

    nextDispatch.controlStatus = deriveControlStatus(nextDispatch);
    return nextDispatch;
  });

  return { state: nextState, dispatchId, message };
}
