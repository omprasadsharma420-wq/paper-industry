import type {
  AuditEvent,
  OperationalException,
  Order,
  Product,
  Role,
  Workspace,
} from "@/lib/agra-types";

export const ROLE_LABELS: Record<Role, string> = {
  SALES_ORDER_COORDINATOR: "Sales & Orders",
  INVENTORY_QUALITY: "Inventory & Quality",
  PACKING_DISPATCH: "Packing & Dispatch",
  OPERATIONS_SUPERVISOR: "Operations Supervisor",
  MANAGER_ADMIN: "Manager",
};

export const ROLE_HOME_TITLES: Record<Role, { title: string; eyebrow: string; detail: string }> = {
  SALES_ORDER_COORDINATOR: {
    title: "Sales work queue",
    eyebrow: "My Work",
    detail: "Orders and customer details that need your attention",
  },
  INVENTORY_QUALITY: {
    title: "Inventory & quality queue",
    eyebrow: "My Work",
    detail: "Stock checks, quality decisions and rework tasks",
  },
  PACKING_DISPATCH: {
    title: "Fulfilment queue",
    eyebrow: "My Work",
    detail: "Picking, packing, documents and handover",
  },
  OPERATIONS_SUPERVISOR: {
    title: "Supervisor control centre",
    eyebrow: "My Work",
    detail: "Approvals, exceptions and work at risk",
  },
  MANAGER_ADMIN: {
    title: "Management overview",
    eyebrow: "Operations",
    detail: "Flow, risk and workload across the reference pilot",
  },
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  APPROVED: "Approved",
  AWAITING_APPROVAL: "Awaiting approval",
  AWAITING_PRODUCTION: "Production required",
  AWAITING_QC: "Awaiting quality check",
  AWAITING_STOCK_CHECK: "Awaiting stock check",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  DAMAGED: "Damaged",
  DISPATCHED: "Dispatched",
  DRAFT: "Draft",
  HANDED_OVER: "Handed over",
  INACTIVE: "Inactive",
  LOW_STOCK: "Low stock",
  MISSING: "Missing",
  PACKING: "Packing",
  PASSED: "Passed",
  PENDING_QC: "Waiting for quality check",
  PICKING: "Picking",
  READY_FOR_HANDOVER: "Ready for handover",
  RELEASED: "Released",
  REWORK_REQUIRED: "Rework required",
  VERIFIED: "Verified",
};

const ACTION_LABELS: Record<string, string> = {
  APPROVE_ORDER: "Approved and reserved stock",
  CANCEL_ORDER: "Cancelled order",
  CHECK_STOCK: "Confirmed stock availability",
  COMPLETE_PACKING: "Completed packing",
  COMPLETE_PICKING: "Completed picking",
  COMPLETE_REWORK: "Completed rework",
  CONFIRM_HANDOVER: "Confirmed handover",
  CREATE_ORDER: "Created order",
  RECORD_QC: "Recorded quality check",
  START_PICKING: "Started picking",
  SUBMIT_ORDER: "Submitted order",
  VERIFY_DOCUMENTS: "Verified documents",
};

const CATEGORY_LABELS: Record<string, string> = {
  CUSTOM_PRODUCT: "Custom product",
  DECORATIVE_PAPER_ITEM: "Decorative paper",
  GIFT_BOX: "Gift box",
  HANDCRAFTED_DIARY: "Handcrafted diary",
  HANDMADE_PAPER_SHEET: "Handmade paper sheet",
  NOTEBOOK: "Notebook",
  PACKAGING_BOX: "Packaging box",
  PAPER_BAG: "Paper bag",
  PAPER_FRAME: "Paper frame",
};

const PRODUCT_FAMILIES: Record<string, string> = {
  CUSTOM_PRODUCT: "KhoriyaCo Custom Paper Product",
  DECORATIVE_PAPER_ITEM: "KhoriyaCo Decorative Paper Product",
  GIFT_BOX: "KhoriyaCo Handmade Gift Box",
  HANDCRAFTED_DIARY: "KhoriyaCo Handmade Diary",
  HANDMADE_PAPER_SHEET: "KhoriyaCo Broom-Grass Paper Sheet",
  NOTEBOOK: "KhoriyaCo Handmade Notebook",
  PACKAGING_BOX: "KhoriyaCo Paper Packaging Box",
  PAPER_BAG: "KhoriyaCo Handmade Paper Bag",
  PAPER_FRAME: "KhoriyaCo Decorative Paper Frame",
};

export const DEMO_AGEING_DEFAULTS = {
  dueSoonDays: 2,
  criticallyOverdueDays: 2,
} as const;

export type AgeingCategory = "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "CRITICALLY_OVERDUE";
export type WorkTaskStatus = "READY" | "BLOCKED";

export interface WorkTask {
  id: string;
  taskType: string;
  title: string;
  detail: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  productSummary: string;
  assignedRole: Role;
  assignedPerson: string | null;
  priority: string;
  dueDate: string;
  createdAt: string;
  ageLabel: string;
  ageing: AgeingCategory;
  status: WorkTaskStatus;
  blockingReason: string | null;
  actionLabel: string;
  nextRole: string;
  fulfillmentStatus: string;
}

export function plainLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return STATUS_LABELS[value] ?? CATEGORY_LABELS[value] ?? value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusLabel(value: string) {
  return STATUS_LABELS[value] ?? plainLabel(value);
}

export function actionLabel(value: string) {
  return ACTION_LABELS[value] ?? plainLabel(value);
}

export function categoryLabel(value: string) {
  return CATEGORY_LABELS[value] ?? plainLabel(value);
}

export function unitLabel(value: string, quantity?: number) {
  const labels: Record<string, string> = {
    BUNDLE: "bundle",
    CARTON: "carton",
    DOZEN: "dozen",
    KG: "kg",
    PACK: "pack",
    PIECE: "piece",
    SHEET: "sheet",
  };
  const label = labels[value] ?? value.toLowerCase();
  if (quantity !== undefined && quantity !== 1 && !["KG", "DOZEN"].includes(value)) return `${label}s`;
  return label;
}

export function productFamily(product: Product) {
  return PRODUCT_FAMILIES[product.category] ?? product.name;
}

export function productVariant(product: Product) {
  const attributes = [
    product.size,
    product.colour ? `${product.colour} finish` : null,
    product.pages ? `${product.pages} pages` : null,
    product.design,
  ].filter((value): value is string => Boolean(value));
  return attributes.join(" / ") || "Standard variant";
}

export function productSummary(product: Product) {
  return `${productFamily(product)} - ${productVariant(product)}`;
}

export function simpleAvailability(product: Product) {
  if (product.availableStock <= 0) return "Not currently available";
  if (product.availableStock < product.minimum_stock_level) return "Limited";
  return "Available";
}

export function stockState(product: Product) {
  if (product.reworkStock > 0 || product.blockedStock > 0 || product.damagedStock > 0) return "Needs attention";
  if (product.pendingStock > 0) return "Quality check pending";
  if (product.availableStock < product.minimum_stock_level) return "Low stock";
  return "Released";
}

export function ageingForDate(value: string): AgeingCategory {
  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(new Date());
  const due = new Date(`${value}T00:00:00+05:45`).getTime();
  const current = new Date(`${today}T00:00:00+05:45`).getTime();
  const days = Math.round((due - current) / 86_400_000);
  if (days <= -DEMO_AGEING_DEFAULTS.criticallyOverdueDays) return "CRITICALLY_OVERDUE";
  if (days < 0) return "OVERDUE";
  if (days <= DEMO_AGEING_DEFAULTS.dueSoonDays) return "DUE_SOON";
  return "ON_TRACK";
}

export function ageingLabel(value: AgeingCategory) {
  const labels: Record<AgeingCategory, string> = {
    ON_TRACK: "On track",
    DUE_SOON: "Due soon",
    OVERDUE: "Overdue",
    CRITICALLY_OVERDUE: "Critically overdue",
  };
  return labels[value];
}

export function durationLabel(value: string) {
  const milliseconds = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(milliseconds / 3_600_000);
  if (hours < 1) return "Less than 1 hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function openException(order: Order, code?: string) {
  return order.exceptions.find((item) => item.status === "OPEN" && (!code || item.code === code)) ?? null;
}

export function orderBlocker(order: Order) {
  const issue = openException(order);
  if (issue) return issue.message;
  if (order.is_custom_order && !order.customer_specification_confirmed) return "Customer specifications need confirmation.";
  if (order.sample_approval_required && !order.sample_approved) return "Customer sample approval is still required.";
  return null;
}

export function orderOwnerRole(order: Order): Role {
  const status = order.fulfillment_status;
  if (status === "DRAFT") return "SALES_ORDER_COORDINATOR";
  if (["AWAITING_STOCK_CHECK", "AWAITING_PRODUCTION", "AWAITING_QC", "REWORK_REQUIRED"].includes(status)) return "INVENTORY_QUALITY";
  if (["APPROVED", "PICKING", "PACKING", "READY_FOR_HANDOVER"].includes(status)) return "PACKING_DISPATCH";
  if (status === "BLOCKED" && openException(order, "MISSING_REQUIRED_DOCUMENT")) return "PACKING_DISPATCH";
  return "OPERATIONS_SUPERVISOR";
}

export function orderNextAction(order: Order) {
  const status = order.fulfillment_status;
  const blocker = orderBlocker(order);
  if (status === "DRAFT") return blocker ? "Complete order details" : "Submit for stock check";
  if (status === "AWAITING_STOCK_CHECK") return "Confirm released stock";
  if (status === "AWAITING_PRODUCTION") return "Record finished production";
  if (status === "AWAITING_APPROVAL") return "Approve and reserve stock";
  if (status === "APPROVED") return "Start picking";
  if (status === "PICKING") return "Confirm picked quantity";
  if (status === "AWAITING_QC") return "Complete quality check";
  if (status === "REWORK_REQUIRED") return "Complete rework and reinspect";
  if (status === "PACKING") return "Complete packing";
  if (status === "READY_FOR_HANDOVER") return "Confirm handover";
  if (status === "BLOCKED" && openException(order, "MISSING_REQUIRED_DOCUMENT")) return "Add missing documents";
  if (status === "BLOCKED") return "Review blocking issue";
  return "Review order";
}

export function nextRoleAfterAction(order: Order) {
  const status = order.fulfillment_status;
  if (status === "DRAFT") return ROLE_LABELS.INVENTORY_QUALITY;
  if (["AWAITING_STOCK_CHECK", "AWAITING_PRODUCTION"].includes(status)) return ROLE_LABELS.OPERATIONS_SUPERVISOR;
  if (status === "AWAITING_APPROVAL") return ROLE_LABELS.PACKING_DISPATCH;
  if (["APPROVED", "PICKING"].includes(status)) return ROLE_LABELS.INVENTORY_QUALITY;
  if (["AWAITING_QC", "REWORK_REQUIRED"].includes(status)) return ROLE_LABELS.PACKING_DISPATCH;
  if (["PACKING", "READY_FOR_HANDOVER", "BLOCKED"].includes(status)) return "Management reporting";
  return "Complete";
}

function stageStartedAt(order: Order, events: AuditEvent[]) {
  return events
    .filter((event) => event.entity_id === order.id && event.success && event.new_status === order.fulfillment_status)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.created_at
    ?? `${order.order_date}T00:00:00+05:45`;
}

function taskType(order: Order) {
  const labels: Record<string, string> = {
    APPROVED: "Picking",
    AWAITING_APPROVAL: "Approval",
    AWAITING_PRODUCTION: "Production follow-up",
    AWAITING_QC: "Quality check",
    AWAITING_STOCK_CHECK: "Stock check",
    BLOCKED: "Blocked work",
    DRAFT: "Order preparation",
    PACKING: "Packing",
    PICKING: "Picking",
    READY_FOR_HANDOVER: "Handover",
    REWORK_REQUIRED: "Rework",
  };
  return labels[order.fulfillment_status] ?? "Order review";
}

function taskTitle(order: Order) {
  const quantity = order.items.reduce((sum, item) => sum + Number(item.approved_quantity || item.requested_quantity), 0);
  const product = order.items[0]?.product;
  const content = product
    ? `${quantity.toLocaleString("en-NP")} ${unitLabel(product.primary_unit, quantity)} of ${productFamily(product)}`
    : "order items";
  const status = order.fulfillment_status;
  if (status === "DRAFT") return `Prepare ${order.order_no}`;
  if (status === "AWAITING_STOCK_CHECK") return `Confirm stock for ${order.order_no}`;
  if (status === "AWAITING_PRODUCTION") return `Follow production for ${order.order_no}`;
  if (status === "AWAITING_APPROVAL") return `Approve ${order.order_no}`;
  if (status === "APPROVED") return `Pick ${content}`;
  if (status === "PICKING") return `Finish picking ${order.order_no}`;
  if (status === "AWAITING_QC") return `Check quality for ${content}`;
  if (status === "REWORK_REQUIRED") return `Complete rework for ${order.order_no}`;
  if (status === "PACKING") return `Pack ${order.order_no}`;
  if (status === "READY_FOR_HANDOVER") return `Hand over ${order.order_no}`;
  return `Resolve ${order.order_no}`;
}

function exceptionRole(exception: OperationalException): Role {
  if (exception.code === "MISSING_REQUIRED_DOCUMENT") return "PACKING_DISPATCH";
  if (exception.code.includes("QUALITY") || exception.code.includes("REWORK") || exception.code.includes("STOCK")) return "INVENTORY_QUALITY";
  if (exception.code.includes("PACKING") || exception.code.includes("DELIVERY")) return "PACKING_DISPATCH";
  return "OPERATIONS_SUPERVISOR";
}

export function deriveWorkTasks(workspace: Workspace, role: Role) {
  const tasks = workspace.orders
    .filter((order) => !["DISPATCHED", "CANCELLED"].includes(order.fulfillment_status))
    .map((order): WorkTask => {
      const assignedRole = orderOwnerRole(order);
      const createdAt = stageStartedAt(order, workspace.auditEvents);
      const blocker = orderBlocker(order);
      return {
        id: `order-${order.id}-${order.fulfillment_status}`,
        taskType: taskType(order),
        title: taskTitle(order),
        detail: `${order.customer.name} - ${order.items.map((item) => productVariant(item.product)).join(", ")}`,
        orderId: order.id,
        orderNo: order.order_no,
        customerName: order.customer.name,
        productSummary: order.items.map((item) => productSummary(item.product)).join(", "),
        assignedRole,
        assignedPerson: workspace.team.find((profile) => profile.role === assignedRole && profile.active)?.full_name ?? null,
        priority: order.priority,
        dueDate: order.requested_dispatch_date,
        createdAt,
        ageLabel: durationLabel(createdAt),
        ageing: ageingForDate(order.requested_dispatch_date),
        status: blocker ? "BLOCKED" : "READY",
        blockingReason: blocker,
        actionLabel: orderNextAction(order),
        nextRole: nextRoleAfterAction(order),
        fulfillmentStatus: order.fulfillment_status,
      };
    });

  if (role === "OPERATIONS_SUPERVISOR") {
    const existing = new Set(tasks.filter((task) => task.assignedRole === role).map((task) => task.orderId));
    const exceptionTasks = workspace.exceptions
      .filter((exception) => exception.status === "OPEN" && exception.order_id && !existing.has(exception.order_id))
      .map((exception): WorkTask | null => {
        const order = workspace.orders.find((item) => item.id === exception.order_id);
        if (!order) return null;
        const assignedRole = exceptionRole(exception);
        return {
          id: `exception-${exception.id}`,
          taskType: "Exception review",
          title: `Review ${plainLabel(exception.code)} for ${order.order_no}`,
          detail: exception.message,
          orderId: order.id,
          orderNo: order.order_no,
          customerName: order.customer.name,
          productSummary: order.items.map((item) => productSummary(item.product)).join(", "),
          assignedRole: role,
          assignedPerson: workspace.team.find((profile) => profile.role === role && profile.active)?.full_name ?? null,
          priority: exception.severity,
          dueDate: order.requested_dispatch_date,
          createdAt: exception.created_at,
          ageLabel: durationLabel(exception.created_at),
          ageing: ageingForDate(order.requested_dispatch_date),
          status: "BLOCKED",
          blockingReason: `${ROLE_LABELS[assignedRole]} owns the operational correction.`,
          actionLabel: "Review exception",
          nextRole: ROLE_LABELS[assignedRole],
          fulfillmentStatus: order.fulfillment_status,
        };
      })
      .filter((task): task is WorkTask => task !== null);
    return [...tasks.filter((task) => task.assignedRole === role), ...exceptionTasks]
      .sort(compareTasks);
  }

  return tasks.filter((task) => task.assignedRole === role).sort(compareTasks);
}

function compareTasks(left: WorkTask, right: WorkTask) {
  const ageingOrder: Record<AgeingCategory, number> = {
    CRITICALLY_OVERDUE: 0,
    OVERDUE: 1,
    DUE_SOON: 2,
    ON_TRACK: 3,
  };
  return ageingOrder[left.ageing] - ageingOrder[right.ageing]
    || left.dueDate.localeCompare(right.dueDate)
    || left.orderNo.localeCompare(right.orderNo);
}

export function recentRoleActivity(workspace: Workspace, role: Role) {
  return workspace.auditEvents
    .filter((event) => event.success && event.actor_role === role)
    .slice(0, 5);
}
