export type UserRole =
  | "DISPATCH_CLERK"
  | "WAREHOUSE_QUALITY"
  | "DISPATCH_SUPERVISOR"
  | "GATE_SECURITY"
  | "MANAGER_ADMIN";

export type WorkflowStatus =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "REJECTED"
  | "APPROVED"
  | "VEHICLE_ASSIGNED"
  | "VEHICLE_ARRIVED"
  | "LOADING"
  | "AWAITING_WEIGHT_CHECK"
  | "AWAITING_DOCUMENT_CHECK"
  | "AWAITING_GATE_CLEARANCE"
  | "CLEARED_FOR_EXIT"
  | "DISPATCHED"
  | "CANCELLED";

export type ControlStatus = "CLEAR" | "WARNING" | "BLOCKED";

export type QualityStatus = "PENDING_INSPECTION" | "RELEASED" | "BLOCKED";

export type ProductType = "PAPER_REEL" | "SHEET_REAM";

export type ProductUnit = "KG" | "REAM";

export type CustomerType = "DISTRIBUTOR" | "WHOLESALER" | "COMMERCIAL";

export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH";

export type DocumentType =
  | "COMMERCIAL_INVOICE"
  | "DELIVERY_CHALLAN"
  | "PACKING_LIST"
  | "GATE_PASS";

export type Priority = "NORMAL" | "URGENT";

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  department: string;
}

export interface Product {
  code: string;
  name: string;
  productType: ProductType;
  unit: ProductUnit;
  gsm: number;
  grade: string;
  shade: string;
  size: string;
}

export interface InventoryBatch {
  id: string;
  batchNo: string;
  productCode: string;
  productName: string;
  productType: ProductType;
  unit: ProductUnit;
  onHandQty: number;
  reservedQty: number;
  qualityStatus: QualityStatus;
  location: string;
  gsm: number;
  grade: string;
  shade: string;
  size: string;
  producedOn: string;
}

export interface DispatchLine {
  id: string;
  productCode: string;
  productName: string;
  productType: ProductType;
  unit: ProductUnit;
  requestedQty: number;
  reservedBatchIds: string[];
}

export interface VehicleAssignment {
  vehicleNo: string;
  transporter: string;
  driverName: string;
  driverPhone: string;
  expectedArrival: string;
}

export interface DispatchDocument {
  type: DocumentType;
  present: boolean;
  verified: boolean;
}

export interface DispatchException {
  id: string;
  dispatchId: string;
  code: string;
  message: string;
  severity: ExceptionSeverity;
  controlStatus: ControlStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditEntry {
  id: string;
  dispatchId: string;
  at: string;
  actor: string;
  role: UserRole;
  action: string;
  fromStatus?: WorkflowStatus;
  toStatus?: WorkflowStatus;
  note: string;
}

export interface DispatchRequest {
  id: string;
  requestNo: string;
  customerName: string;
  customerType: CustomerType;
  destination: string;
  status: WorkflowStatus;
  controlStatus: ControlStatus;
  priority: Priority;
  createdAt: string;
  requestedDispatchDate: string;
  createdBy: string;
  approvedBy?: string;
  lines: DispatchLine[];
  vehicle?: VehicleAssignment;
  documents: DispatchDocument[];
  expectedWeightKg?: number;
  actualWeightKg?: number;
  weightTolerancePercent: number;
  exceptions: DispatchException[];
  audit: AuditEntry[];
}

export interface AppState {
  users: AppUser[];
  products: Product[];
  inventory: InventoryBatch[];
  dispatches: DispatchRequest[];
}

export interface WorkflowResult {
  state: AppState;
  dispatchId: string;
  message: string;
}
