export type Role =
  | "SALES_ORDER_COORDINATOR"
  | "INVENTORY_QUALITY"
  | "PACKING_DISPATCH"
  | "OPERATIONS_SUPERVISOR"
  | "MANAGER_ADMIN";

export type ViewKey =
  | "home"
  | "orders"
  | "customers"
  | "products"
  | "stock"
  | "quality"
  | "dispatch"
  | "issues"
  | "reports"
  | "admin"
  | "team"
  | "system";

export interface Profile {
  id: string;
  user_id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: Role;
  department: string;
  active: boolean;
  updated_at: string;
}

export interface Organization {
  id: string;
  code: string;
  name: string;
  is_demo: boolean;
  active: boolean;
}

export interface Customer {
  id: string;
  customer_code: string;
  name: string;
  customer_type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string | null;
  size: string | null;
  colour: string | null;
  design: string | null;
  material: string | null;
  paper_type: string | null;
  pages: number | null;
  packaging_specification: string | null;
  custom_branding_capable: boolean;
  primary_unit: string;
  minimum_stock_level: number;
  availableStock: number;
  releasedStock: number;
  reservedStock: number;
  pendingStock: number;
  reworkStock: number;
  blockedStock: number;
  damagedStock: number;
  active: boolean;
}

export interface InventoryBatch {
  id: string;
  product_id: string;
  product: Product;
  batch_no: string;
  production_date: string | null;
  qc_status: string;
  qc_release_date: string | null;
  storage_location: string;
  shelf_reference: string | null;
  physical_quantity: number;
  pending_quantity: number;
  released_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  rework_quantity: number;
  blocked_quantity: number;
  damaged_quantity: number;
  unit: string;
  notes: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product: Product;
  requested_quantity: number;
  approved_quantity: number;
  unit: string;
  customization: Record<string, unknown>;
  notes: string | null;
}

export interface OrderDocument {
  id: string;
  document_type: string;
  reference_number: string | null;
  required: boolean;
  status: "MISSING" | "PRESENT" | "VERIFIED";
  notes: string | null;
}

export interface OperationalException {
  id: string;
  order_id: string | null;
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "RESOLVED";
  affected_quantity: number | null;
  unit: string | null;
  created_at: string;
  resolution_note: string | null;
}

export interface ReworkRecord {
  id: string;
  order_id: string;
  order_item_id: string;
  inventory_batch_id: string;
  defect_type: string;
  defect_description: string;
  affected_quantity: number;
  rework_quantity: number;
  rejected_quantity: number;
  due_date: string | null;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED";
  completion_note: string | null;
}

export interface Order {
  id: string;
  order_no: string;
  customer_id: string;
  customer: Customer;
  customer_order_reference: string | null;
  order_status: string;
  fulfillment_status: string;
  fulfillment_source: string;
  payment_status: "NOT_TRACKED";
  priority: string;
  order_date: string;
  requested_dispatch_date: string;
  delivery_deadline: string | null;
  is_custom_order: boolean;
  customization_summary: string | null;
  customer_specification_confirmed: boolean;
  sample_approval_required: boolean;
  sample_approved: boolean;
  special_packaging_instructions: string | null;
  production_reference: string | null;
  notes: string | null;
  dispatched_at: string | null;
  items: OrderItem[];
  reservations: Array<Record<string, unknown>>;
  picks: Array<Record<string, unknown>>;
  qualityChecks: Array<Record<string, unknown>>;
  reworkRecords: ReworkRecord[];
  packing: Record<string, unknown> | null;
  documents: OrderDocument[];
  handover: Record<string, unknown> | null;
  exceptions: OperationalException[];
}

export interface AuditEvent {
  id: string;
  action: string;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  success: boolean;
  reason: string | null;
  source: string;
  error_code: string | null;
  created_at: string;
}

export interface SystemEvent {
  id: string;
  source: string;
  event_type: string;
  success: boolean;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Workspace {
  currentUser: Profile;
  organization: Organization;
  team: Profile[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  inventoryBatches: InventoryBatch[];
  exceptions: OperationalException[];
  auditEvents: AuditEvent[];
  systemEvents: SystemEvent[];
  demoState: {
    dataset_version: string;
    last_reset_at: string;
    environment: "DEMO";
  };
  loadedAt: string;
}

export interface ActionResponse {
  ok: boolean;
  code: string;
  message: string;
  entityId?: string;
  idempotentReplay?: boolean;
  [key: string]: unknown;
}

export interface SystemHealth {
  ok: boolean;
  supabase: string;
  applicationVersion: string;
  databaseMigration: string;
  environment: string;
  invalidInventoryRows: number;
  reservationMismatches: number;
  authUserCount: number;
  checkedAt: string;
}

export interface N8nHealth {
  ok: boolean;
  service: string;
  status: string;
  policyVersion: string;
  environment: string;
  databaseAuthority: string;
  checkedAt: string;
}
