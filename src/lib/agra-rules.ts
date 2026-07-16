export const ACTIVE_STATUSES = new Set([
  "DRAFT",
  "AWAITING_STOCK_CHECK",
  "AWAITING_PRODUCTION",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PICKING",
  "AWAITING_QC",
  "REWORK_REQUIRED",
  "PACKING",
  "READY_FOR_HANDOVER",
  "BLOCKED",
]);

export const STATUS_ORDER = [
  "DRAFT",
  "AWAITING_STOCK_CHECK",
  "AWAITING_PRODUCTION",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PICKING",
  "AWAITING_QC",
  "REWORK_REQUIRED",
  "PACKING",
  "READY_FOR_HANDOVER",
  "DISPATCHED",
];

export const FLOW_STEPS = [
  "Order",
  "Stock",
  "Approval",
  "Picking",
  "Quality",
  "Packing",
  "Handover",
  "Sent",
] as const;

export const FLOW_STAGE: Record<string, number> = {
  DRAFT: 0,
  AWAITING_STOCK_CHECK: 1,
  AWAITING_PRODUCTION: 1,
  AWAITING_APPROVAL: 2,
  APPROVED: 3,
  PICKING: 3,
  AWAITING_QC: 4,
  REWORK_REQUIRED: 4,
  BLOCKED: 4,
  PACKING: 5,
  READY_FOR_HANDOVER: 6,
  HANDED_OVER: 6,
  DISPATCHED: 7,
};

export function orderControl(status: string) {
  const controls: Record<string, { task: string; owner: string }> = {
    DRAFT: { task: "Send order for stock check", owner: "Sales & Orders" },
    AWAITING_STOCK_CHECK: { task: "Check released stock", owner: "Stock & Quality" },
    AWAITING_PRODUCTION: { task: "Record finished production", owner: "Stock & Quality" },
    AWAITING_APPROVAL: { task: "Approve order and reserve stock", owner: "Operations Supervisor" },
    APPROVED: { task: "Start picking", owner: "Packing & Dispatch" },
    PICKING: { task: "Finish picking", owner: "Packing & Dispatch" },
    AWAITING_QC: { task: "Record quality check", owner: "Stock & Quality" },
    REWORK_REQUIRED: { task: "Finish rework and inspect again", owner: "Stock & Quality" },
    PACKING: { task: "Finish packing", owner: "Packing & Dispatch" },
    READY_FOR_HANDOVER: { task: "Check documents and confirm handover", owner: "Packing & Dispatch" },
    DISPATCHED: { task: "No action required", owner: "Complete" },
    CANCELLED: { task: "No action required", owner: "Cancelled" },
    BLOCKED: { task: "Resolve the blocking issue", owner: "Operations Supervisor" },
  };
  return controls[status] ?? { task: "Review order", owner: "Operations Supervisor" };
}

export function words(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
