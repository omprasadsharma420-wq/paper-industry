"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Database,
  FileCheck2,
  Home,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  executeAction,
  loadN8nHealth,
  loadSystemHealth,
  loadWorkspace,
  signOut,
} from "@/lib/agra-backend";
import {
  ACTIVE_STATUSES,
  FLOW_STAGE,
  FLOW_STEPS,
  STATUS_ORDER,
  orderControl,
  words,
} from "@/lib/agra-rules";
import type {
  Customer,
  InventoryBatch,
  N8nHealth,
  OperationalException,
  Order,
  Product,
  Profile,
  Role,
  SystemHealth,
  ViewKey,
  Workspace,
} from "@/lib/agra-types";

type DialogState =
  | { type: "newOrder" }
  | { type: "newCustomer" }
  | { type: "newProduct" }
  | { type: "receiveBatch" }
  | { type: "inspectBatch"; batchId: string }
  | { type: "production"; orderId: string }
  | { type: "quality"; orderId: string }
  | { type: "rework"; orderId: string; reworkId: string }
  | { type: "packing"; orderId: string }
  | { type: "documents"; orderId: string }
  | { type: "handover"; orderId: string }
  | { type: "cancel"; orderId: string }
  | { type: "resolve"; orderId: string; exceptionId: string }
  | { type: "team"; profileId: string }
  | null;

const ROLE_LABELS: Record<Role, string> = {
  SALES_ORDER_COORDINATOR: "Sales & Orders",
  INVENTORY_QUALITY: "Stock & Quality",
  PACKING_DISPATCH: "Packing & Dispatch",
  OPERATIONS_SUPERVISOR: "Operations Supervisor",
  MANAGER_ADMIN: "Manager",
};

const ROLE_NAV: Record<Role, ViewKey[]> = {
  SALES_ORDER_COORDINATOR: ["home", "orders", "customers", "products"],
  INVENTORY_QUALITY: ["home", "stock", "quality", "orders", "products"],
  PACKING_DISPATCH: ["home", "dispatch", "orders", "stock"],
  OPERATIONS_SUPERVISOR: ["home", "orders", "issues", "reports"],
  MANAGER_ADMIN: [
    "home",
    "orders",
    "stock",
    "quality",
    "dispatch",
    "issues",
    "reports",
    "team",
    "system",
  ],
};

const VIEW_META: Record<
  ViewKey,
  { label: string; title: string; icon: typeof Home }
> = {
  home: { label: "Home", title: "Today", icon: Home },
  orders: { label: "Orders", title: "Customer orders", icon: ClipboardList },
  customers: { label: "Customers", title: "Customers", icon: Building2 },
  products: { label: "Products", title: "Products", icon: Boxes },
  stock: { label: "Stock", title: "Finished stock", icon: Boxes },
  quality: { label: "Quality", title: "Quality and rework", icon: ShieldCheck },
  dispatch: { label: "Pack & send", title: "Packing and handover", icon: Truck },
  issues: { label: "Issues", title: "Open issues", icon: AlertTriangle },
  reports: { label: "Reports", title: "Operations report", icon: BarChart3 },
  team: { label: "Team", title: "Team access", icon: Users },
  system: { label: "System", title: "System status", icon: Settings2 },
};

function shortDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function number(value: number) {
  return new Intl.NumberFormat("en-NP", { maximumFractionDigits: 2 }).format(value);
}

function statusTone(status: string) {
  if (["DISPATCHED", "RELEASED", "VERIFIED", "PASSED", "COMPLETED"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  }
  if (["BLOCKED", "DAMAGED", "CANCELLED", "CRITICAL"].includes(status)) {
    return "bg-red-50 text-red-700 ring-red-600/15";
  }
  if (["REWORK_REQUIRED", "AWAITING_PRODUCTION", "HIGH", "MISSING"].includes(status)) {
    return "bg-amber-50 text-amber-800 ring-amber-600/20";
  }
  return "bg-blue-50 text-blue-700 ring-blue-600/15";
}

function can(role: Role, roles: Role[]) {
  return roles.includes(role);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md px-2 py-1 text-[11px] font-semibold leading-none ring-1 ring-inset ${statusTone(status)}`}
    >
      {words(status)}
    </span>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Home; title: string; detail: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center border-y border-neutral-200 px-6 text-center">
      <Icon className="mb-3 h-6 w-6 text-neutral-400" aria-hidden="true" />
      <p className="text-sm font-semibold text-neutral-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">{detail}</p>
    </div>
  );
}

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: "neutral" | "green" | "red" | "blue" }) {
  const tones = {
    neutral: "text-neutral-950",
    green: "text-emerald-700",
    red: "text-red-700",
    blue: "text-blue-700",
  };
  return (
    <div className="min-w-0 border-r border-neutral-200 px-5 py-4 last:border-r-0">
      <p className="truncate text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 pb-3">
      <div>
        <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
        {detail ? <p className="mt-0.5 text-sm text-neutral-500">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled = false, type = "button", className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled = false, type = "button", className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, children, onClick, disabled = false }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-neutral-300 bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-950 disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function roleWork(role: Role, orders: Order[], exceptions: OperationalException[]) {
  if (role === "SALES_ORDER_COORDINATOR") return orders.filter((order) => order.fulfillment_status === "DRAFT");
  if (role === "INVENTORY_QUALITY") return orders.filter((order) => ["AWAITING_STOCK_CHECK", "AWAITING_PRODUCTION", "AWAITING_QC", "REWORK_REQUIRED", "BLOCKED"].includes(order.fulfillment_status));
  if (role === "PACKING_DISPATCH") return orders.filter((order) => ["APPROVED", "PICKING", "PACKING", "READY_FOR_HANDOVER"].includes(order.fulfillment_status));
  if (role === "OPERATIONS_SUPERVISOR") return orders.filter((order) => order.fulfillment_status === "AWAITING_APPROVAL" || order.exceptions.some((item) => item.status === "OPEN"));
  const issueOrders = new Set(exceptions.filter((item) => item.status === "OPEN").map((item) => item.order_id));
  return orders.filter((order) => ACTIVE_STATUSES.has(order.fulfillment_status) || issueOrders.has(order.id));
}

export function AgraOperationsApp({ session }: { session: Session }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<ViewKey>("home");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    await Promise.resolve();
    if (!quiet) setRefreshing(true);
    try {
      const data = await loadWorkspace();
      setWorkspace(data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workspace could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(true), 30000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const runAction = useCallback(async (action: string, orderId: string | null, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      const response = await executeAction(session, action, orderId, payload);
      setNotice(response.message);
      setDialog(null);
      await refresh(true);
      window.setTimeout(() => setNotice(null), 4500);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [refresh, session]);

  if (loading) return <WorkspaceLoading />;
  if (!workspace) return <WorkspaceFailure message={error ?? "The workspace is unavailable."} onRetry={() => void refresh()} />;

  const role = workspace.currentUser.role;
  const availableViews = ROLE_NAV[role];
  const defaultOrder = roleWork(role, workspace.orders, workspace.exceptions)[0] ?? workspace.orders[0] ?? null;
  const selectedOrder = workspace.orders.find((order) => order.id === selectedOrderId) ?? defaultOrder;

  const chooseView = (next: ViewKey) => {
    setView(next);
    setMobileNav(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-neutral-950">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[248px] border-r border-neutral-200 bg-white/95 px-3 py-4 backdrop-blur-xl transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-2">
            <button type="button" onClick={() => chooseView("home")} className="flex min-w-0 items-center gap-3 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#176b5c] text-sm font-bold text-white">A</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">Agra Operations</span>
                <span className="block truncate text-xs text-neutral-500">Reference pilot</span>
              </span>
            </button>
            <button type="button" aria-label="Close menu" className="grid h-9 w-9 place-items-center lg:hidden" onClick={() => setMobileNav(false)}><X className="h-5 w-5" /></button>
          </div>

          <nav className="mt-7 space-y-1" aria-label="Main navigation">
            {availableViews.map((key) => {
              const item = VIEW_META[key];
              const Icon = item.icon;
              const active = view === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseView(key)}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${active ? "bg-neutral-950 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                  {key === "issues" && workspace.exceptions.filter((item) => item.status === "OPEN").length > 0 ? (
                    <span className="ml-auto rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      {workspace.exceptions.filter((item) => item.status === "OPEN").length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-neutral-200 pt-4">
            <div className="flex items-center gap-3 px-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700">
                {workspace.currentUser.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{workspace.currentUser.full_name}</span>
                <span className="block truncate text-xs text-neutral-500">{ROLE_LABELS[role]}</span>
              </span>
              <button type="button" title="Sign out" aria-label="Sign out" onClick={() => void signOut()} className="ml-auto grid h-9 w-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileNav ? <button type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" /> : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex min-h-16 items-center border-b border-neutral-200 bg-[#f5f5f7]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setMobileNav(true)} className="mr-3 grid h-9 w-9 place-items-center rounded-md border border-neutral-300 bg-white lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg">{VIEW_META[view].title}</h1>
            <p className="truncate text-xs text-neutral-500">{workspace.organization.name}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">Demo mode</span>
            <span className="hidden text-xs text-neutral-500 md:inline">Updated {dateTime(workspace.loadedAt)}</span>
            <IconButton label="Refresh data" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </IconButton>
          </div>
        </header>

        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
              <button type="button" aria-label="Close error" onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
          {notice ? (
            <div role="status" className="mb-5 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
            </div>
          ) : null}

          {view === "home" ? <HomeView workspace={workspace} onOpenOrder={(id) => { setSelectedOrderId(id); setView("orders"); }} onNewOrder={() => setDialog({ type: "newOrder" })} /> : null}
          {view === "orders" ? <OrdersView workspace={workspace} selectedOrder={selectedOrder} onSelectOrder={setSelectedOrderId} onNewOrder={() => setDialog({ type: "newOrder" })} onRun={runAction} onDialog={setDialog} busy={busy} /> : null}
          {view === "customers" ? <CustomersView customers={workspace.customers} onNew={() => setDialog({ type: "newCustomer" })} /> : null}
          {view === "products" ? <ProductsView products={workspace.products} canAdd={can(role, ["INVENTORY_QUALITY", "MANAGER_ADMIN"])} onNew={() => setDialog({ type: "newProduct" })} /> : null}
          {view === "stock" ? <StockView products={workspace.products} batches={workspace.inventoryBatches} canEdit={can(role, ["INVENTORY_QUALITY", "MANAGER_ADMIN"])} onReceive={() => setDialog({ type: "receiveBatch" })} onInspect={(batchId) => setDialog({ type: "inspectBatch", batchId })} /> : null}
          {view === "quality" ? <QualityView workspace={workspace} onOpenOrder={(id) => { setSelectedOrderId(id); setView("orders"); }} onDialog={setDialog} /> : null}
          {view === "dispatch" ? <DispatchView workspace={workspace} onOpenOrder={(id) => { setSelectedOrderId(id); setView("orders"); }} onDialog={setDialog} /> : null}
          {view === "issues" ? <IssuesView workspace={workspace} onOpenOrder={(id) => { setSelectedOrderId(id); setView("orders"); }} onResolve={(orderId, exceptionId) => setDialog({ type: "resolve", orderId, exceptionId })} /> : null}
          {view === "reports" ? <ReportsView workspace={workspace} /> : null}
          {view === "team" ? <TeamView team={workspace.team} onEdit={(profileId) => setDialog({ type: "team", profileId })} /> : null}
          {view === "system" ? <SystemView workspace={workspace} busy={busy} onReset={async () => { if (!window.confirm("Reset all demo data to the reference starting point?")) return; await runAction("RESET_DEMO", null); }} /> : null}

          <aside className="mt-9 flex items-start gap-3 border-t border-neutral-200 pt-4 text-xs leading-5 text-neutral-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#176b5c]" aria-hidden="true" />
            <p><strong className="font-semibold text-neutral-700">Reference Pilot.</strong> This configuration is based on preliminary information about Agra Industries. Products, roles, controls, approval rules, and reporting fields will be validated through operational discovery.</p>
          </aside>
        </main>
      </div>

      {dialog ? (
        <OperationDialog
          dialog={dialog}
          workspace={workspace}
          busy={busy}
          onClose={() => setDialog(null)}
          onRun={runAction}
        />
      ) : null}
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f5f7]">
      <div className="text-center">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-[#176b5c] font-bold text-white">A</span>
        <RefreshCw className="mx-auto mt-5 h-5 w-5 animate-spin text-neutral-400" />
        <p className="mt-2 text-sm text-neutral-500">Opening operations</p>
      </div>
    </div>
  );
}

function WorkspaceFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f5f7] px-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
        <h1 className="mt-4 text-xl font-semibold">Operations are unavailable</h1>
        <p className="mt-2 text-sm text-neutral-600">{message}</p>
        <PrimaryButton className="mt-5" onClick={onRetry}><RefreshCw className="h-4 w-4" />Try again</PrimaryButton>
      </div>
    </div>
  );
}

function HomeView({ workspace, onOpenOrder, onNewOrder }: { workspace: Workspace; onOpenOrder: (id: string) => void; onNewOrder: () => void }) {
  const role = workspace.currentUser.role;
  const work = roleWork(role, workspace.orders, workspace.exceptions);
  const openOrders = workspace.orders.filter((order) => ACTIVE_STATUSES.has(order.fulfillment_status));
  const openIssues = workspace.exceptions.filter((item) => item.status === "OPEN");
  const lowStock = workspace.products.filter((product) => product.availableStock < product.minimum_stock_level);
  const ready = workspace.orders.filter((order) => order.fulfillment_status === "READY_FOR_HANDOVER");
  const demoOrder = workspace.orders.find((order) => order.order_no === "AGRA-DEMO-001") ?? null;

  const headline = role === "SALES_ORDER_COORDINATOR" ? "Orders waiting for you" : role === "INVENTORY_QUALITY" ? "Stock and quality work" : role === "PACKING_DISPATCH" ? "Packing and handover work" : role === "OPERATIONS_SUPERVISOR" ? "Approvals and issues" : "Operations at a glance";

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Metric label="Your work" value={work.length} detail={ROLE_LABELS[role]} tone="blue" />
          <Metric label="Open orders" value={openOrders.length} detail="Across all stages" />
          <Metric label="Open issues" value={openIssues.length} detail="Needs attention" tone={openIssues.length ? "red" : "green"} />
          <Metric label="Ready to send" value={ready.length} detail="Documents and handover" tone="green" />
        </div>
      </section>

      {role === "MANAGER_ADMIN" && demoOrder ? <DemoProgress order={demoOrder} onOpen={() => onOpenOrder(demoOrder.id)} /> : null}

      <section>
        <SectionHeader
          title={headline}
          detail={`${work.length} item${work.length === 1 ? "" : "s"} in your current queue`}
          action={can(role, ["SALES_ORDER_COORDINATOR", "MANAGER_ADMIN"]) ? <PrimaryButton onClick={onNewOrder}><Plus className="h-4 w-4" />New order</PrimaryButton> : null}
        />
        {work.length ? (
          <div className="divide-y divide-neutral-200">
            {work.slice(0, 7).map((order) => (
              <button key={order.id} type="button" onClick={() => onOpenOrder(order.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4 text-left transition hover:bg-white/70 sm:grid-cols-[160px_minmax(0,1fr)_170px_auto] sm:px-2">
                <div>
                  <p className="text-sm font-semibold">{order.order_no}</p>
                  <p className="mt-1 text-xs text-neutral-500">Due {shortDate(order.requested_dispatch_date)}</p>
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate text-sm font-medium">{order.customer.name}</p>
                  <p className="mt-1 truncate text-xs text-neutral-500">{order.items.map((item) => `${number(item.requested_quantity)} ${item.unit} ${item.product.name}`).join(", ")}</p>
                </div>
                <StatusBadge status={order.fulfillment_status} />
                <ChevronRight className="h-4 w-4 text-neutral-400" />
              </button>
            ))}
          </div>
        ) : <EmptyState icon={CheckCircle2} title="Your queue is clear" detail="New work will appear here when it reaches your role." />}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader title="Stock watch" detail={`${lowStock.length} product${lowStock.length === 1 ? "" : "s"} below minimum`} />
          <div className="divide-y divide-neutral-200">
            {(lowStock.length ? lowStock : workspace.products.slice(0, 4)).map((product) => (
              <div key={product.id} className="flex items-center gap-4 py-3.5">
                <span className={`h-2.5 w-2.5 rounded-full ${product.availableStock < product.minimum_stock_level ? "bg-red-500" : "bg-emerald-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-neutral-500">{product.sku}</p>
                </div>
                <p className="text-right text-sm font-semibold">{number(product.availableStock)} <span className="font-normal text-neutral-500">{product.primary_unit}</span></p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHeader title="Recent automation" detail="n8n checks recorded in Supabase" />
          <div className="divide-y divide-neutral-200">
            {workspace.systemEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="flex items-start gap-3 py-3.5">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${event.success ? "bg-emerald-500" : "bg-red-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{event.message}</p>
                  <p className="mt-1 text-xs text-neutral-500">{words(event.event_type)} - {dateTime(event.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function DemoProgress({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const current = FLOW_STAGE[order.fulfillment_status] ?? 0;
  return (
    <section className="border-y border-neutral-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#176b5c]">Presentation flow - {order.order_no}</p>
          <p className="mt-1 text-sm font-semibold">200 A5 KhoriyaCo handmade diaries</p>
        </div>
        <SecondaryButton onClick={onOpen}>Open order <ChevronRight className="h-4 w-4" /></SecondaryButton>
      </div>
      <ol className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Demo order progress">
        {FLOW_STEPS.map((step, index) => (
          <li key={step} className="min-w-0">
            <span className={`block h-1.5 rounded-sm ${index <= current ? "bg-[#176b5c]" : "bg-neutral-200"}`} />
            <span className={`mt-1.5 block truncate text-[11px] font-medium ${index === current ? "text-neutral-950" : "text-neutral-500"}`}>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OrdersView({ workspace, selectedOrder, onSelectOrder, onNewOrder, onRun, onDialog, busy }: { workspace: Workspace; selectedOrder: Order | null; onSelectOrder: (id: string) => void; onNewOrder: () => void; onRun: (action: string, orderId: string | null, payload?: Record<string, unknown>) => Promise<boolean>; onDialog: (state: DialogState) => void; busy: string | null }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const role = workspace.currentUser.role;
  const filtered = workspace.orders.filter((order) => {
    const haystack = `${order.order_no} ${order.customer.name} ${order.items.map((item) => item.product.name).join(" ")}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && (status === "ALL" || order.fulfillment_status === status);
  });

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-4">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" className="h-9 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm">
            <option value="ALL">All stages</option>
            {STATUS_ORDER.map((item) => <option key={item} value={item}>{words(item)}</option>)}
          </select>
          {can(role, ["SALES_ORDER_COORDINATOR", "MANAGER_ADMIN"]) ? <PrimaryButton onClick={onNewOrder}><Plus className="h-4 w-4" />New order</PrimaryButton> : null}
        </div>
        <div className="divide-y divide-neutral-200">
          {filtered.map((order) => (
            <button key={order.id} type="button" onClick={() => onSelectOrder(order.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-2 py-4 text-left transition sm:grid-cols-[145px_minmax(0,1fr)_130px_auto] ${selectedOrder?.id === order.id ? "bg-white" : "hover:bg-white/70"}`}>
              <div>
                <p className="text-sm font-semibold">{order.order_no}</p>
                <p className="mt-1 text-xs text-neutral-500">{order.priority} priority</p>
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-medium">{order.customer.name}</p>
                <p className="mt-1 truncate text-xs text-neutral-500">{order.items.length} line{order.items.length === 1 ? "" : "s"} - due {shortDate(order.requested_dispatch_date)}</p>
              </div>
              <StatusBadge status={order.fulfillment_status} />
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </button>
          ))}
          {!filtered.length ? <EmptyState icon={Search} title="No matching orders" detail="Change the search or stage filter." /> : null}
        </div>
      </section>
      <aside className="h-fit border-l border-neutral-200 bg-white px-5 py-5 xl:sticky xl:top-24">
        {selectedOrder ? <OrderDetail order={selectedOrder} role={role} busy={busy} onRun={onRun} onDialog={onDialog} /> : <EmptyState icon={ClipboardList} title="Choose an order" detail="Order details and available work will appear here." />}
      </aside>
    </div>
  );
}

function OrderDetail({ order, role, busy, onRun, onDialog }: { order: Order; role: Role; busy: string | null; onRun: (action: string, orderId: string | null, payload?: Record<string, unknown>) => Promise<boolean>; onDialog: (state: DialogState) => void }) {
  const status = order.fulfillment_status;
  const control = orderControl(status);
  const currentStage = FLOW_STAGE[status] ?? 0;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Order</p>
          <h2 className="mt-1 text-xl font-semibold">{order.order_no}</h2>
          <p className="mt-1 text-sm text-neutral-600">{order.customer.name}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-5 border-y border-neutral-200 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs text-neutral-500">Next task</p><p className="mt-1 text-sm font-semibold">{control.task}</p></div>
          <div><p className="text-xs text-neutral-500">Responsible team</p><p className="mt-1 text-sm font-semibold">{control.owner}</p></div>
        </div>
        <ol className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3" aria-label="Order timeline">
          {FLOW_STEPS.map((step, index) => (
            <li key={step} className="flex min-w-0 items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${index <= currentStage ? "bg-[#176b5c]" : "bg-neutral-300"}`} />
              <span className={`truncate text-[11px] font-medium ${index === currentStage ? "text-neutral-950" : "text-neutral-500"}`}>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200">
        <div className="bg-white p-3"><p className="text-xs text-neutral-500">Dispatch date</p><p className="mt-1 text-sm font-semibold">{shortDate(order.requested_dispatch_date)}</p></div>
        <div className="bg-white p-3"><p className="text-xs text-neutral-500">Source</p><p className="mt-1 text-sm font-semibold">{words(order.fulfillment_source)}</p></div>
        <div className="bg-white p-3"><p className="text-xs text-neutral-500">Customer ref.</p><p className="mt-1 truncate text-sm font-semibold">{order.customer_order_reference ?? "Not given"}</p></div>
        <div className="bg-white p-3"><p className="text-xs text-neutral-500">Priority</p><p className="mt-1 text-sm font-semibold">{words(order.priority)}</p></div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">Order lines</h3>
        <div className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
          {order.items.map((item) => (
            <div key={item.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="mt-0.5 text-xs text-neutral-500">{item.product.sku}</p></div>
                <p className="shrink-0 text-sm font-semibold">{number(item.requested_quantity)} {item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {order.is_custom_order ? (
        <div className="mt-5 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-semibold">Custom order</p>
          <p className="mt-1 text-blue-800">{order.customization_summary}</p>
        </div>
      ) : null}

      {order.exceptions.some((item) => item.status === "OPEN") ? (
        <div className="mt-5 space-y-2">
          {order.exceptions.filter((item) => item.status === "OPEN").map((item) => (
            <div key={item.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">{words(item.code)}</p><p className="mt-1">{item.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
        {status === "DRAFT" && can(role, ["SALES_ORDER_COORDINATOR", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => void onRun("SUBMIT_ORDER", order.id)}>Send for stock check <ArrowRight className="h-4 w-4" /></PrimaryButton> : null}
        {["AWAITING_STOCK_CHECK", "BLOCKED"].includes(status) && can(role, ["INVENTORY_QUALITY", "OPERATIONS_SUPERVISOR", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => void onRun("CHECK_STOCK", order.id)}>Check stock <Check className="h-4 w-4" /></PrimaryButton> : null}
        {status === "AWAITING_PRODUCTION" && can(role, ["INVENTORY_QUALITY", "OPERATIONS_SUPERVISOR", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "production", orderId: order.id })}>Record production</PrimaryButton> : null}
        {status === "AWAITING_APPROVAL" && can(role, ["OPERATIONS_SUPERVISOR", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => void onRun("APPROVE_ORDER", order.id)}>Approve & reserve <Check className="h-4 w-4" /></PrimaryButton> : null}
        {status === "APPROVED" && can(role, ["PACKING_DISPATCH", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => void onRun("START_PICKING", order.id)}>Start picking</PrimaryButton> : null}
        {status === "PICKING" && can(role, ["PACKING_DISPATCH", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => void onRun("COMPLETE_PICKING", order.id, { notes: "Picked as reserved." })}>Finish picking</PrimaryButton> : null}
        {status === "AWAITING_QC" && can(role, ["INVENTORY_QUALITY", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "quality", orderId: order.id })}>Record quality check</PrimaryButton> : null}
        {status === "REWORK_REQUIRED" && can(role, ["INVENTORY_QUALITY", "MANAGER_ADMIN"]) && order.reworkRecords.find((item) => item.status !== "COMPLETED") ? <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "rework", orderId: order.id, reworkId: order.reworkRecords.find((item) => item.status !== "COMPLETED")!.id })}>Finish rework</PrimaryButton> : null}
        {status === "PACKING" && can(role, ["PACKING_DISPATCH", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "packing", orderId: order.id })}>Finish packing</PrimaryButton> : null}
        {status === "READY_FOR_HANDOVER" && can(role, ["PACKING_DISPATCH", "OPERATIONS_SUPERVISOR", "MANAGER_ADMIN"]) ? <SecondaryButton disabled={!!busy} onClick={() => onDialog({ type: "documents", orderId: order.id })}><FileCheck2 className="h-4 w-4" />Check documents</SecondaryButton> : null}
        {status === "READY_FOR_HANDOVER" && can(role, ["PACKING_DISPATCH", "OPERATIONS_SUPERVISOR", "MANAGER_ADMIN"]) ? <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "handover", orderId: order.id })}><Truck className="h-4 w-4" />Confirm handover</PrimaryButton> : null}
        {ACTIVE_STATUSES.has(status) && can(role, ["OPERATIONS_SUPERVISOR", "MANAGER_ADMIN"]) ? <button type="button" disabled={!!busy} onClick={() => onDialog({ type: "cancel", orderId: order.id })} className="min-h-9 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50">Cancel order</button> : null}
      </div>
    </div>
  );
}

function CustomersView({ customers, onNew }: { customers: Customer[]; onNew: () => void }) {
  return (
    <section>
      <SectionHeader title="Customer list" detail={`${customers.length} active customer records`} action={<PrimaryButton onClick={onNew}><Plus className="h-4 w-4" />New customer</PrimaryButton>} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-neutral-500"><tr className="border-b border-neutral-200"><th className="px-2 py-3 font-medium">Code</th><th className="px-2 py-3 font-medium">Customer</th><th className="px-2 py-3 font-medium">Type</th><th className="px-2 py-3 font-medium">Contact</th><th className="px-2 py-3 font-medium">Location</th></tr></thead>
          <tbody className="divide-y divide-neutral-200">{customers.map((customer) => <tr key={customer.id} className="hover:bg-white"><td className="px-2 py-4 font-mono text-xs">{customer.customer_code}</td><td className="px-2 py-4 font-semibold">{customer.name}</td><td className="px-2 py-4">{words(customer.customer_type)}</td><td className="px-2 py-4"><span className="block">{customer.contact_name ?? "Not set"}</span><span className="text-xs text-neutral-500">{customer.phone ?? customer.email ?? "No contact"}</span></td><td className="px-2 py-4 text-neutral-600">{customer.address ?? "Not set"}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ProductsView({ products, canAdd, onNew }: { products: Product[]; canAdd: boolean; onNew: () => void }) {
  return (
    <section>
      <SectionHeader title="Finished products" detail="Simplified product and stock master" action={canAdd ? <PrimaryButton onClick={onNew}><Plus className="h-4 w-4" />New product</PrimaryButton> : null} />
      <div className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article key={product.id} className="rounded-md border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-[#176b5c]">{product.sku}</p><h3 className="mt-1 text-sm font-semibold">{product.name}</h3></div><StatusBadge status={product.availableStock < product.minimum_stock_level ? "LOW_STOCK" : "AVAILABLE"} /></div>
            <p className="mt-3 line-clamp-2 text-sm text-neutral-600">{product.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-200 pt-3 text-xs"><div><dt className="text-neutral-500">Available</dt><dd className="mt-1 text-sm font-semibold">{number(product.availableStock)} {product.primary_unit}</dd></div><div><dt className="text-neutral-500">Minimum</dt><dd className="mt-1 text-sm font-semibold">{number(product.minimum_stock_level)} {product.primary_unit}</dd></div><div><dt className="text-neutral-500">Material</dt><dd className="mt-1 font-medium">{product.material ?? "Not set"}</dd></div><div><dt className="text-neutral-500">Pack</dt><dd className="mt-1 font-medium">{product.packaging_specification ?? "Not set"}</dd></div><div className="col-span-2 border-t border-neutral-100 pt-3"><dt className="text-neutral-500">Price</dt><dd className="mt-1 font-medium text-neutral-700">Pricing not configured</dd></div></dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function StockView({ products, batches, canEdit, onReceive, onInspect }: { products: Product[]; batches: InventoryBatch[]; canEdit: boolean; onReceive: () => void; onInspect: (id: string) => void }) {
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white"><div className="grid grid-cols-2 sm:grid-cols-4"><Metric label="Released" value={number(products.reduce((sum, product) => sum + product.releasedStock, 0))} detail="Finished units" tone="green" /><Metric label="Reserved" value={number(products.reduce((sum, product) => sum + product.reservedStock, 0))} detail="Approved orders" tone="blue" /><Metric label="Waiting for QC" value={number(products.reduce((sum, product) => sum + product.pendingStock, 0))} detail="Not available" /><Metric label="Rework / blocked" value={number(products.reduce((sum, product) => sum + product.reworkStock + product.blockedStock, 0))} detail="Separate compartments" tone="red" /></div></section>
      <section>
        <SectionHeader title="Inventory batches" detail="Physical, released, reserved, and quality quantities reconcile by batch" action={canEdit ? <PrimaryButton onClick={onReceive}><Plus className="h-4 w-4" />Receive batch</PrimaryButton> : null} />
        <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="text-xs text-neutral-500"><tr className="border-b border-neutral-200"><th className="px-2 py-3 font-medium">Batch</th><th className="px-2 py-3 font-medium">Product</th><th className="px-2 py-3 font-medium">QC</th><th className="px-2 py-3 font-medium">Physical</th><th className="px-2 py-3 font-medium">Released</th><th className="px-2 py-3 font-medium">Reserved</th><th className="px-2 py-3 font-medium">Available</th><th className="px-2 py-3 font-medium">Location</th><th className="px-2 py-3"></th></tr></thead><tbody className="divide-y divide-neutral-200">{batches.map((batch) => <tr key={batch.id} className="hover:bg-white"><td className="px-2 py-4 font-mono text-xs">{batch.batch_no}</td><td className="px-2 py-4"><p className="font-medium">{batch.product.name}</p><p className="text-xs text-neutral-500">{batch.product.sku}</p></td><td className="px-2 py-4"><StatusBadge status={batch.qc_status} /></td><td className="px-2 py-4 font-semibold">{number(batch.physical_quantity)} {batch.unit}</td><td className="px-2 py-4">{number(batch.released_quantity)}</td><td className="px-2 py-4">{number(batch.reserved_quantity)}</td><td className="px-2 py-4 font-semibold text-emerald-700">{number(batch.available_quantity)}</td><td className="px-2 py-4 text-neutral-600">{batch.storage_location}<br/><span className="text-xs">{batch.shelf_reference}</span></td><td className="px-2 py-4">{canEdit && batch.qc_status === "PENDING_QC" ? <SecondaryButton onClick={() => onInspect(batch.id)}>Inspect</SecondaryButton> : null}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

function QualityView({ workspace, onOpenOrder, onDialog }: { workspace: Workspace; onOpenOrder: (id: string) => void; onDialog: (state: DialogState) => void }) {
  const waiting = workspace.orders.filter((order) => order.fulfillment_status === "AWAITING_QC");
  const rework = workspace.orders.flatMap((order) => order.reworkRecords.filter((item) => item.status !== "COMPLETED").map((item) => ({ order, item })));
  return (
    <div className="space-y-7">
      <section><SectionHeader title="Waiting for quality check" detail={`${waiting.length} order${waiting.length === 1 ? "" : "s"}`} />{waiting.length ? <div className="divide-y divide-neutral-200">{waiting.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-4 py-4"><ShieldCheck className="h-5 w-5 text-blue-600" /><div className="min-w-0 flex-1"><p className="font-semibold">{order.order_no} - {order.customer.name}</p><p className="mt-1 text-xs text-neutral-500">{order.items.map((item) => `${number(item.approved_quantity)} ${item.unit} ${item.product.name}`).join(", ")}</p></div><SecondaryButton onClick={() => onOpenOrder(order.id)}>Open</SecondaryButton><PrimaryButton onClick={() => onDialog({ type: "quality", orderId: order.id })}>Check quality</PrimaryButton></div>)}</div> : <EmptyState icon={CheckCircle2} title="No quality checks waiting" detail="Picked orders will appear here." />}</section>
      <section><SectionHeader title="Open rework" detail={`${rework.length} task${rework.length === 1 ? "" : "s"}`} />{rework.length ? <div className="divide-y divide-neutral-200">{rework.map(({ order, item }) => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[150px_minmax(0,1fr)_130px_auto]"><div><p className="font-semibold">{order.order_no}</p><p className="text-xs text-neutral-500">Due {shortDate(item.due_date)}</p></div><div><p className="text-sm font-medium">{words(item.defect_type)}</p><p className="mt-1 text-xs text-neutral-500">{item.defect_description}</p></div><p className="text-sm font-semibold">{number(item.rework_quantity)} {order.items.find((line) => line.id === item.order_item_id)?.unit}</p><PrimaryButton onClick={() => onDialog({ type: "rework", orderId: order.id, reworkId: item.id })}>Finish rework</PrimaryButton></div>)}</div> : <EmptyState icon={CheckCircle2} title="No open rework" detail="Rework tasks will appear after a quality decision." />}</section>
    </div>
  );
}

function DispatchView({ workspace, onOpenOrder, onDialog }: { workspace: Workspace; onOpenOrder: (id: string) => void; onDialog: (state: DialogState) => void }) {
  const work = workspace.orders.filter((order) => ["APPROVED", "PICKING", "PACKING", "READY_FOR_HANDOVER"].includes(order.fulfillment_status));
  return (
    <section>
      <SectionHeader title="Packing and handover queue" detail={`${work.length} active order${work.length === 1 ? "" : "s"}`} />
      {work.length ? <div className="divide-y divide-neutral-200">{work.map((order) => <div key={order.id} className="grid items-center gap-4 py-4 md:grid-cols-[150px_minmax(0,1fr)_170px_auto]"><div><p className="font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">{shortDate(order.requested_dispatch_date)}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium">{order.customer.name}</p><p className="mt-1 truncate text-xs text-neutral-500">{order.items.map((item) => `${number(item.approved_quantity || item.requested_quantity)} ${item.unit} ${item.product.name}`).join(", ")}</p></div><StatusBadge status={order.fulfillment_status} /><div className="flex gap-2"><SecondaryButton onClick={() => onOpenOrder(order.id)}>Open</SecondaryButton>{order.fulfillment_status === "PACKING" ? <PrimaryButton onClick={() => onDialog({ type: "packing", orderId: order.id })}>Pack</PrimaryButton> : null}{order.fulfillment_status === "READY_FOR_HANDOVER" ? <PrimaryButton onClick={() => onDialog({ type: "handover", orderId: order.id })}>Handover</PrimaryButton> : null}</div></div>)}</div> : <EmptyState icon={PackageCheck} title="Packing queue is clear" detail="Approved orders will appear here." />}
    </section>
  );
}

function IssuesView({ workspace, onOpenOrder, onResolve }: { workspace: Workspace; onOpenOrder: (id: string) => void; onResolve: (orderId: string, exceptionId: string) => void }) {
  const issues = workspace.exceptions.filter((item) => item.status === "OPEN");
  return (
    <section>
      <SectionHeader title="Open operational issues" detail="Problems stay visible until a supervisor records the resolution" />
      {issues.length ? <div className="divide-y divide-neutral-200">{issues.map((issue) => { const order = workspace.orders.find((item) => item.id === issue.order_id); return <div key={issue.id} className="grid gap-3 py-4 md:grid-cols-[140px_minmax(0,1fr)_120px_auto]"><div><p className="font-semibold">{order?.order_no ?? "General"}</p><p className="mt-1 text-xs text-neutral-500">{dateTime(issue.created_at)}</p></div><div><p className="text-sm font-semibold">{words(issue.code)}</p><p className="mt-1 text-sm text-neutral-600">{issue.message}</p></div><StatusBadge status={issue.severity} /><div className="flex gap-2">{order ? <SecondaryButton onClick={() => onOpenOrder(order.id)}>Open</SecondaryButton> : null}{order ? <PrimaryButton onClick={() => onResolve(order.id, issue.id)}>Resolve</PrimaryButton> : null}</div></div>; })}</div> : <EmptyState icon={CheckCircle2} title="No open issues" detail="Operational exceptions will appear here." />}
    </section>
  );
}

function ReportsView({ workspace }: { workspace: Workspace }) {
  const today = new Date().toISOString().slice(0, 10);
  const activeOrders = workspace.orders.filter((order) => ACTIVE_STATUSES.has(order.fulfillment_status));
  const dispatchedOrders = workspace.orders.filter((order) => order.fulfillment_status === "DISPATCHED");
  const delayedOrders = activeOrders.filter((order) => order.requested_dispatch_date < today);
  const qualityChecks = workspace.orders.flatMap((order) => order.qualityChecks);
  const passedChecks = qualityChecks.filter((check) => check.result === "PASSED").length;
  const passRate = qualityChecks.length ? Math.round((passedChecks / qualityChecks.length) * 100) : 0;
  const reworkQuantity = workspace.inventoryBatches.reduce((sum, batch) => sum + batch.rework_quantity, 0);
  const unavailableQuantity = workspace.inventoryBatches.reduce((sum, batch) => sum + batch.blocked_quantity + batch.damaged_quantity, 0);
  const statusCounts = STATUS_ORDER.map((status) => ({ status, count: workspace.orders.filter((order) => order.fulfillment_status === status).length })).filter((item) => item.count > 0);
  const max = Math.max(...statusCounts.map((item) => item.count), 1);
  const skuRows = workspace.products.map((product) => {
    const productOrders = workspace.orders.filter((order) => order.items.some((item) => item.product_id === product.id));
    const productItemIds = new Set(workspace.orders.flatMap((order) => order.items.filter((item) => item.product_id === product.id).map((item) => item.id)));
    const productChecks = qualityChecks.filter((check) => productItemIds.has(String(check.order_item_id)));
    const failedChecks = productChecks.filter((check) => check.result !== "PASSED").length;
    const customerCounts = new Map<string, number>();
    productOrders.forEach((order) => customerCounts.set(order.customer_id, (customerCounts.get(order.customer_id) ?? 0) + 1));
    return {
      product,
      ordered: workspace.orders.reduce((sum, order) => sum + order.items.filter((item) => item.product_id === product.id).reduce((itemSum, item) => itemSum + item.requested_quantity, 0), 0),
      dispatched: dispatchedOrders.reduce((sum, order) => sum + order.items.filter((item) => item.product_id === product.id).reduce((itemSum, item) => itemSum + item.approved_quantity, 0), 0),
      failureRate: productChecks.length ? Math.round((failedChecks / productChecks.length) * 100) : 0,
      repeatCustomers: [...customerCounts.values()].filter((count) => count > 1).length,
      delayed: productOrders.filter((order) => ACTIVE_STATUSES.has(order.fulfillment_status) && order.requested_dispatch_date < today).length,
    };
  });
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Metric label="Open orders" value={activeOrders.length} detail={`${delayedOrders.length} delayed`} tone={delayedOrders.length ? "red" : "blue"} />
          <Metric label="Orders sent" value={dispatchedOrders.length} detail="Closed and deducted" tone="green" />
          <Metric label="Quality pass" value={`${passRate}%`} detail={`${qualityChecks.length} checks recorded`} tone="green" />
          <Metric label="Open issues" value={workspace.exceptions.filter((item) => item.status === "OPEN").length} detail="Needs supervisor action" tone="red" />
        </div>
      </section>

      <section>
        <SectionHeader title="SKU operations" detail="Quantity and quality reporting; pricing is not configured" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="text-xs text-neutral-500"><tr className="border-b border-neutral-200"><th className="px-2 py-3 font-medium">Product</th><th className="px-2 py-3 font-medium">Ordered</th><th className="px-2 py-3 font-medium">Sent</th><th className="px-2 py-3 font-medium">Available</th><th className="px-2 py-3 font-medium">Reserved</th><th className="px-2 py-3 font-medium">QC failed</th><th className="px-2 py-3 font-medium">Repeat customers</th><th className="px-2 py-3 font-medium">Delayed</th></tr></thead>
            <tbody className="divide-y divide-neutral-200">
              {skuRows.map((row) => <tr key={row.product.id} className="hover:bg-white"><td className="px-2 py-4"><p className="font-semibold">{row.product.name}</p><p className="mt-1 font-mono text-xs text-neutral-500">{row.product.sku}</p></td><td className="px-2 py-4 font-semibold">{number(row.ordered)}</td><td className="px-2 py-4">{number(row.dispatched)}</td><td className="px-2 py-4 text-emerald-700">{number(row.product.availableStock)}</td><td className="px-2 py-4">{number(row.product.reservedStock)}</td><td className="px-2 py-4">{row.failureRate}%</td><td className="px-2 py-4">{row.repeatCustomers}</td><td className="px-2 py-4">{row.delayed}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 border-y border-neutral-200 py-5 sm:grid-cols-3">
        <div><p className="text-xs text-neutral-500">Rework stock</p><p className="mt-1 text-xl font-semibold text-amber-700">{number(reworkQuantity)}</p></div>
        <div><p className="text-xs text-neutral-500">Blocked or damaged</p><p className="mt-1 text-xl font-semibold text-red-700">{number(unavailableQuantity)}</p></div>
        <div><p className="text-xs text-neutral-500">Low-stock products</p><p className="mt-1 text-xl font-semibold">{workspace.products.filter((product) => product.availableStock < product.minimum_stock_level).length}</p></div>
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section><SectionHeader title="Orders by stage" detail="Current reference-pilot workload" /><div className="space-y-4 py-5">{statusCounts.map((item) => <div key={item.status}><div className="mb-1.5 flex items-center justify-between text-sm"><span>{words(item.status)}</span><span className="font-semibold">{item.count}</span></div><div className="h-2 rounded-sm bg-neutral-200"><div className="h-2 rounded-sm bg-[#176b5c]" style={{ width: `${Math.max((item.count / max) * 100, 8)}%` }} /></div></div>)}</div></section>
        <section><SectionHeader title="Recent activity" detail="Successful and blocked actions" /><div className="divide-y divide-neutral-200">{workspace.auditEvents.slice(0, 12).map((event) => <div key={event.id} className="flex gap-3 py-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${event.success ? "bg-emerald-500" : "bg-red-500"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{words(event.action)}</p><p className="mt-1 truncate text-xs text-neutral-500">{event.actor_name} - {event.reason ?? (event.success ? "Completed" : "Blocked")}</p></div><time className="shrink-0 text-xs text-neutral-500">{dateTime(event.created_at)}</time></div>)}</div></section>
      </div>
    </div>
  );
}

function TeamView({ team, onEdit }: { team: Profile[]; onEdit: (id: string) => void }) {
  return (
    <section><SectionHeader title="Role access" detail="Each person sees work and actions for their role" /><div className="divide-y divide-neutral-200">{team.map((profile) => <div key={profile.id} className="grid items-center gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_220px_110px_auto]"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-semibold">{profile.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{profile.full_name}</p><p className="truncate text-xs text-neutral-500">{profile.email}</p></div></div><p className="text-sm">{ROLE_LABELS[profile.role]}</p><StatusBadge status={profile.active ? "ACTIVE" : "INACTIVE"} /><SecondaryButton onClick={() => onEdit(profile.id)}>Edit</SecondaryButton></div>)}</div></section>
  );
}

function SystemView({ workspace, busy, onReset }: { workspace: Workspace; busy: string | null; onReset: () => Promise<void> }) {
  const [dbHealth, setDbHealth] = useState<SystemHealth | null>(null);
  const [n8nHealth, setN8nHealth] = useState<N8nHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const lastSuccess = workspace.auditEvents.find((event) => event.success) ?? null;
  const lastFailure = workspace.auditEvents.find((event) => !event.success) ?? null;

  const check = useCallback(async () => {
    await Promise.resolve();
    setChecking(true); setError(null);
    try { const [database, automation] = await Promise.all([loadSystemHealth(), loadN8nHealth()]); setDbHealth(database); setN8nHealth(automation); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "System check failed."); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(initial);
  }, [check]);

  return (
    <div className="space-y-7">
      <SectionHeader title="Live connections" detail="Checks run against production services" action={<div className="flex gap-2"><SecondaryButton onClick={() => void check()} disabled={checking}><RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />Run check</SecondaryButton><SecondaryButton onClick={() => void onReset()} disabled={!!busy}><RefreshCw className="h-4 w-4" />Reset demo</SecondaryButton></div>} />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Database className="h-5 w-5" /></span><div><h3 className="font-semibold">Supabase</h3><p className="text-sm text-neutral-500">Database and sign-in service</p></div><span className={`ml-auto h-2.5 w-2.5 rounded-full ${dbHealth?.ok ? "bg-emerald-500" : "bg-neutral-300"}`} /></div><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-4 text-sm"><div><dt className="text-xs text-neutral-500">Inventory errors</dt><dd className="mt-1 font-semibold">{dbHealth?.invalidInventoryRows ?? "Checking"}</dd></div><div><dt className="text-xs text-neutral-500">Reservation errors</dt><dd className="mt-1 font-semibold">{dbHealth?.reservationMismatches ?? "Checking"}</dd></div><div><dt className="text-xs text-neutral-500">Active users</dt><dd className="mt-1 font-semibold">{dbHealth?.authUserCount ?? workspace.team.filter((item) => item.active).length}</dd></div><div><dt className="text-xs text-neutral-500">App version</dt><dd className="mt-1 truncate font-mono text-xs">{dbHealth?.applicationVersion ?? workspace.demoState.dataset_version}</dd></div></dl></div>
        <div className="rounded-md border border-neutral-200 bg-white p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-700"><Workflow className="h-5 w-5" /></span><div><h3 className="font-semibold">n8n</h3><p className="text-sm text-neutral-500">Action gateway and scheduled checks</p></div><span className={`ml-auto h-2.5 w-2.5 rounded-full ${n8nHealth?.ok ? "bg-emerald-500" : "bg-neutral-300"}`} /></div><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-4 text-sm"><div><dt className="text-xs text-neutral-500">Status</dt><dd className="mt-1 font-semibold">{n8nHealth?.status ?? "Checking"}</dd></div><div><dt className="text-xs text-neutral-500">Authority</dt><dd className="mt-1 font-semibold">{n8nHealth?.databaseAuthority ?? "Supabase"}</dd></div><div className="col-span-2"><dt className="text-xs text-neutral-500">Policy</dt><dd className="mt-1 font-mono text-xs">{n8nHealth?.policyVersion ?? "Checking"}</dd></div></dl></div>
      </div>
      <section>
        <SectionHeader title="Environment" detail="Current pilot and deployment record" />
        <dl className="grid gap-x-8 gap-y-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-xs text-neutral-500">Mode</dt><dd className="mt-1 text-sm font-semibold">{dbHealth?.environment ?? workspace.demoState.environment}</dd></div>
          <div><dt className="text-xs text-neutral-500">Database migration</dt><dd className="mt-1 truncate font-mono text-xs">{dbHealth?.databaseMigration ?? "Checking"}</dd></div>
          <div><dt className="text-xs text-neutral-500">Dataset</dt><dd className="mt-1 truncate font-mono text-xs">{workspace.demoState.dataset_version}</dd></div>
          <div><dt className="text-xs text-neutral-500">Last reset</dt><dd className="mt-1 text-sm font-semibold">{dateTime(workspace.demoState.last_reset_at)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-neutral-500">Last successful action</dt><dd className="mt-1 text-sm font-semibold">{lastSuccess ? `${words(lastSuccess.action)} - ${dateTime(lastSuccess.created_at)}` : "None recorded"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-neutral-500">Last blocked action</dt><dd className="mt-1 text-sm font-semibold">{lastFailure ? `${words(lastFailure.action)} - ${dateTime(lastFailure.created_at)}` : "None recorded"}</dd></div>
        </dl>
      </section>
      <section><SectionHeader title="Automation history" detail="Latest scheduled and service events" /><div className="divide-y divide-neutral-200">{workspace.systemEvents.slice(0, 15).map((event) => <div key={event.id} className="grid gap-2 py-3 sm:grid-cols-[140px_minmax(0,1fr)_160px]"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${event.success ? "bg-emerald-500" : "bg-red-500"}`} /><span className="text-xs font-semibold">{words(event.event_type)}</span></div><p className="text-sm">{event.message}</p><time className="text-xs text-neutral-500 sm:text-right">{dateTime(event.created_at)}</time></div>)}</div></section>
    </div>
  );
}

function OperationDialog({ dialog, workspace, busy, onClose, onRun }: { dialog: Exclude<DialogState, null>; workspace: Workspace; busy: string | null; onClose: () => void; onRun: (action: string, orderId: string | null, payload?: Record<string, unknown>) => Promise<boolean> }) {
  const order = "orderId" in dialog ? workspace.orders.find((item) => item.id === dialog.orderId) ?? null : null;
  const title = { newOrder: "New order", newCustomer: "New customer", newProduct: "New product", receiveBatch: "Receive finished batch", inspectBatch: "Inspect batch", production: "Production update", quality: "Quality check", rework: "Finish rework", packing: "Finish packing", documents: "Check documents", handover: "Confirm handover", cancel: "Cancel order", resolve: "Resolve issue", team: "Edit team access" }[dialog.type];

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-md bg-white shadow-2xl sm:rounded-md">
        <div className="sticky top-0 z-10 flex items-center border-b border-neutral-200 bg-white px-5 py-4"><div><h2 className="text-base font-semibold">{title}</h2>{order ? <p className="text-xs text-neutral-500">{order.order_no} - {order.customer.name}</p> : null}</div><button type="button" aria-label="Close" onClick={onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-md hover:bg-neutral-100"><X className="h-5 w-5" /></button></div>
        <div className="p-5">
          {dialog.type === "newOrder" ? <NewOrderForm workspace={workspace} busy={busy} onSubmit={(payload) => onRun("CREATE_ORDER", null, payload)} onCancel={onClose} /> : null}
          {dialog.type === "newCustomer" ? <SimpleForm busy={busy} onCancel={onClose} fields={[field("customerCode", "Customer code", "text", "CUS-006", true), field("name", "Customer name", "text", "", true), selectField("customerType", "Customer type", ["BUSINESS", "RETAIL", "INSTITUTION", "EXPORT"]), field("contactName", "Contact person"), field("phone", "Phone"), field("email", "Email", "email"), field("address", "Address")]} onSubmit={(payload) => onRun("CREATE_CUSTOMER", null, payload)} /> : null}
          {dialog.type === "newProduct" ? <SimpleForm busy={busy} onCancel={onClose} fields={[field("sku", "SKU", "text", "", true), field("name", "Product name", "text", "", true), selectField("category", "Category", ["HANDCRAFTED_DIARY", "NOTEBOOK", "PAPER_BAG", "HANDMADE_PAPER_SHEET", "GIFT_BOX", "PACKAGING_BOX", "PAPER_FRAME", "DECORATIVE_PAPER_ITEM", "CUSTOM_PRODUCT", "OTHER"]), selectField("primaryUnit", "Unit", ["PIECE", "SHEET", "PACK", "BUNDLE", "CARTON", "KG", "DOZEN"]), field("minimumStockLevel", "Minimum stock", "number", "0", true), field("description", "Description"), field("material", "Material"), field("paperType", "Paper type"), field("packagingSpecification", "Packing specification")]} onSubmit={(payload) => onRun("CREATE_PRODUCT", null, payload)} /> : null}
          {dialog.type === "receiveBatch" ? <SimpleForm busy={busy} onCancel={onClose} fields={[selectField("productId", "Product", workspace.products.map((product) => ({ value: product.id, label: `${product.sku} - ${product.name}` }))), field("batchNo", "Batch number", "text", "", true), field("productionDate", "Production date", "date", "", true), field("quantity", "Quantity", "number", "", true), selectField("unit", "Unit", ["PIECE", "SHEET", "PACK", "BUNDLE", "CARTON", "KG", "DOZEN"]), field("storageLocation", "Storage location", "text", "Finished Goods Room", true), field("shelfReference", "Shelf reference"), field("notes", "Notes")]} onSubmit={(payload) => onRun("RECEIVE_BATCH", null, payload)} /> : null}
          {dialog.type === "inspectBatch" ? <SimpleForm busy={busy} onCancel={onClose} hidden={{ batchId: dialog.batchId }} fields={[selectField("result", "Inspection result", ["RELEASED", "REWORK_REQUIRED", "BLOCKED", "DAMAGED"]), field("notes", "Inspection notes")]} onSubmit={(payload) => onRun("INSPECT_BATCH", null, payload)} /> : null}
          {dialog.type === "production" ? <SimpleForm busy={busy} onCancel={onClose} fields={[field("productionReference", "Production reference", "text", "", true), field("expectedCompletionDate", "Expected finish", "date", "", true), field("completedQuantity", "Completed quantity", "number", "0", true), field("completionNotes", "Notes")]} onSubmit={(payload) => onRun("RECORD_PRODUCTION", dialog.orderId, payload)} /> : null}
          {dialog.type === "quality" ? <SimpleForm busy={busy} onCancel={onClose} fields={[selectField("result", "Result", ["PASSED", "REWORK_REQUIRED", "BLOCKED", "DAMAGED"]), field("affectedQuantity", "Affected quantity", "number"), field("defectType", "Defect type"), field("defectDescription", "Defect details"), field("reworkDueDate", "Rework due date", "date"), field("notes", "Notes")]} onSubmit={(payload) => onRun("RECORD_QC", dialog.orderId, payload)} /> : null}
          {dialog.type === "rework" ? <SimpleForm busy={busy} onCancel={onClose} hidden={{ reworkId: dialog.reworkId }} fields={[selectField("result", "Reinspection result", ["RELEASED", "BLOCKED", "DAMAGED"]), field("completionNote", "Completion note", "text", "", true)]} onSubmit={(payload) => onRun("COMPLETE_REWORK", dialog.orderId, payload)} /> : null}
          {dialog.type === "packing" ? <SimpleForm busy={busy} onCancel={onClose} fields={[field("packageCount", "Package count", "number", "1", true), field("cartonCount", "Carton count", "number", "0"), field("bundleCount", "Bundle count", "number", "0"), field("quantityPerPackage", "Quantity per package", "number"), field("packagingType", "Packing type", "text", "Protective paper packaging", true), field("totalShipmentWeightKg", "Shipment weight (kg)", "number"), checkboxField("moistureProtection", "Moisture protection"), checkboxField("fragile", "Fragile"), field("notes", "Packing notes")]} onSubmit={(payload) => onRun("COMPLETE_PACKING", dialog.orderId, { ...payload, items: order?.items.map((item) => ({ orderItemId: item.id, packedQuantity: item.approved_quantity })) ?? [] })} /> : null}
          {dialog.type === "documents" && order ? <DocumentsForm order={order} busy={busy} onCancel={onClose} onSubmit={(payload) => onRun("VERIFY_DOCUMENTS", order.id, payload)} /> : null}
          {dialog.type === "handover" ? <SimpleForm busy={busy} onCancel={onClose} fields={[selectField("deliveryMethod", "Delivery method", ["CUSTOMER_PICKUP", "OWN_VEHICLE", "THIRD_PARTY_COURIER", "HIRED_TRANSPORTER", "EXPORT_FREIGHT"]), field("companyName", "Courier / company"), field("trackingNumber", "Tracking number"), field("consignmentNumber", "Consignment number"), field("packageCount", "Package count", "number", "1", true), field("shipmentWeightKg", "Shipment weight (kg)", "number"), field("handoverPerson", "Handover person", "text", workspace.currentUser.full_name, true), field("receiverName", "Receiver name", "text", "", true), field("receiverPhone", "Receiver phone"), field("vehicleNumber", "Vehicle number"), field("driverName", "Driver name"), field("driverPhone", "Driver phone"), field("destination", "Destination", "text", order?.customer.address ?? ""), field("acknowledgementReference", "Acknowledgement ref."), field("notes", "Notes")]} onSubmit={(payload) => onRun("CONFIRM_HANDOVER", dialog.orderId, payload)} /> : null}
          {dialog.type === "cancel" ? <SimpleForm busy={busy} onCancel={onClose} fields={[field("reason", "Cancellation reason", "text", "", true)]} danger onSubmit={(payload) => onRun("CANCEL_ORDER", dialog.orderId, payload)} /> : null}
          {dialog.type === "resolve" ? <SimpleForm busy={busy} onCancel={onClose} hidden={{ exceptionId: dialog.exceptionId }} fields={[field("resolutionNote", "Resolution note", "text", "", true)]} onSubmit={(payload) => onRun("RESOLVE_EXCEPTION", dialog.orderId, payload)} /> : null}
          {dialog.type === "team" ? <TeamForm profile={workspace.team.find((item) => item.id === dialog.profileId)!} busy={busy} onCancel={onClose} onSubmit={(payload) => onRun("UPDATE_PROFILE", null, payload)} /> : null}
        </div>
      </div>
    </div>
  );
}

type FieldOption = string | { value: string; label: string };
type FormField = { name: string; label: string; type: "text" | "email" | "number" | "date" | "select" | "checkbox"; placeholder?: string; required?: boolean; options?: FieldOption[] };
function field(name: string, label: string, type: FormField["type"] = "text", placeholder = "", required = false): FormField { return { name, label, type, placeholder, required }; }
function selectField(name: string, label: string, options: FieldOption[]): FormField { return { name, label, type: "select", options, required: true }; }
function checkboxField(name: string, label: string): FormField { return { name, label, type: "checkbox" }; }

function payloadFromForm(form: HTMLFormElement, hidden: Record<string, unknown> = {}) {
  const data = new FormData(form);
  const payload: Record<string, unknown> = { ...hidden };
  for (const [key, value] of data.entries()) {
    const element = form.elements.namedItem(key) as HTMLInputElement | null;
    if (element?.type === "checkbox") payload[key] = element.checked;
    else payload[key] = value.toString();
  }
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement && element.type === "checkbox" && element.name) {
      payload[element.name] = element.checked;
    }
  }
  return payload;
}

function SimpleForm({ fields, hidden = {}, busy, danger = false, onCancel, onSubmit }: { fields: FormField[]; hidden?: Record<string, unknown>; busy: string | null; danger?: boolean; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); await onSubmit(payloadFromForm(event.currentTarget, hidden)); };
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">{fields.map((item) => <FormControl key={item.name} field={item} />)}</div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4"><SecondaryButton onClick={onCancel}>Cancel</SecondaryButton><button type="submit" disabled={!!busy} className={`inline-flex min-h-9 items-center rounded-md px-4 text-sm font-semibold text-white disabled:opacity-45 ${danger ? "bg-red-700 hover:bg-red-600" : "bg-neutral-950 hover:bg-neutral-800"}`}>{busy ? "Saving..." : danger ? "Confirm cancellation" : "Save"}</button></div>
    </form>
  );
}

function FormControl({ field: item }: { field: FormField }) {
  if (item.type === "checkbox") return <label className="flex min-h-10 items-center gap-3 rounded-md border border-neutral-200 px-3 text-sm font-medium"><input name={item.name} type="checkbox" className="h-4 w-4 accent-[#176b5c]" />{item.label}</label>;
  return <label className="block text-sm font-medium text-neutral-700"><span>{item.label}{item.required ? <span className="text-red-600"> *</span> : null}</span>{item.type === "select" ? <select name={item.name} required={item.required} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="">Choose</option>{item.options?.map((option) => { const value = typeof option === "string" ? option : option.value; const label = typeof option === "string" ? words(option) : option.label; return <option key={value} value={value}>{label}</option>; })}</select> : <input name={item.name} type={item.type} required={item.required} defaultValue={item.placeholder} step={item.type === "number" ? "any" : undefined} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm" />}</label>;
}

function NewOrderForm({ workspace, busy, onSubmit, onCancel }: { workspace: Workspace; busy: string | null; onSubmit: (payload: Record<string, unknown>) => Promise<boolean>; onCancel: () => void }) {
  const [lines, setLines] = useState([{ key: crypto.randomUUID(), productId: "", quantity: "", unit: "PIECE" }]);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload = payloadFromForm(event.currentTarget); payload.items = lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unit: line.unit })).filter((line) => line.productId && Number(line.quantity) > 0); await onSubmit(payload); };
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><FormControl field={selectField("customerId", "Customer", workspace.customers.map((customer) => ({ value: customer.id, label: `${customer.customer_code} - ${customer.name}` })))} /><FormControl field={field("customerOrderReference", "Customer order ref.")} /><FormControl field={field("requestedDispatchDate", "Dispatch date", "date", "", true)} /><FormControl field={selectField("priority", "Priority", ["LOW", "NORMAL", "HIGH", "URGENT"])} /><FormControl field={selectField("fulfillmentSource", "Source", ["FINISHED_STOCK", "PRODUCTION_REQUIRED"])} /><FormControl field={field("notes", "Order notes")} /></div>
      <div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Order lines</h3><SecondaryButton onClick={() => setLines((items) => [...items, { key: crypto.randomUUID(), productId: "", quantity: "", unit: "PIECE" }])}><Plus className="h-4 w-4" />Add line</SecondaryButton></div><div className="mt-3 space-y-3">{lines.map((line, index) => <div key={line.key} className="grid items-end gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_36px]"><label className="text-sm font-medium">Product<select value={line.productId} required onChange={(event) => setLines((items) => items.map((item) => item.key === line.key ? { ...item, productId: event.target.value, unit: workspace.products.find((product) => product.id === event.target.value)?.primary_unit ?? item.unit } : item))} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="">Choose</option>{workspace.products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</select></label><label className="text-sm font-medium">Quantity<input value={line.quantity} required type="number" min="0.001" step="any" onChange={(event) => setLines((items) => items.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item))} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 px-3" /></label><label className="text-sm font-medium">Unit<input value={line.unit} readOnly className="mt-1.5 h-10 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm" /></label><IconButton label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((items) => items.filter((item) => item.key !== line.key))}><X className="h-4 w-4" /></IconButton></div>)}</div></div>
      <div className="grid gap-4 sm:grid-cols-2"><FormControl field={field("customizationSummary", "Custom details")} /><FormControl field={field("specialPackagingInstructions", "Special packing")} /><FormControl field={checkboxField("isCustomOrder", "Custom order")} /><FormControl field={checkboxField("logoOrBrandingRequired", "Logo or branding needed")} /><FormControl field={checkboxField("customerSpecificationConfirmed", "Customer details confirmed")} /><FormControl field={checkboxField("sampleApprovalRequired", "Sample approval needed")} /></div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4"><SecondaryButton onClick={onCancel}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={!!busy}>{busy ? "Creating..." : "Create order"}</PrimaryButton></div>
    </form>
  );
}

function DocumentsForm({ order, busy, onCancel, onSubmit }: { order: Order; busy: string | null; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const documents = order.documents.map((doc) => ({ documentType: doc.document_type, referenceNumber: data.get(doc.id)?.toString() ?? "" })); await onSubmit({ documents }); };
  return <form onSubmit={(event) => void submit(event)} className="space-y-4"><p className="text-sm text-neutral-600">Enter a reference for every document that is present. Required documents must be verified before handover.</p><div className="divide-y divide-neutral-200 border-y border-neutral-200">{order.documents.map((doc) => <label key={doc.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_250px]"><span className="text-sm font-medium">{words(doc.document_type)} {doc.required ? <span className="text-red-600">*</span> : null}<span className="mt-1 block"><StatusBadge status={doc.status} /></span></span><input name={doc.id} defaultValue={doc.reference_number ?? ""} placeholder="Reference number" className="h-10 rounded-md border border-neutral-300 px-3 text-sm" /></label>)}</div><div className="flex justify-end gap-2"><SecondaryButton onClick={onCancel}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={!!busy}>{busy ? "Saving..." : "Save checks"}</PrimaryButton></div></form>;
}

function TeamForm({ profile, busy, onCancel, onSubmit }: { profile: Profile; busy: string | null; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(payloadFromForm(event.currentTarget, { profileId: profile.id }));
  };
  return <form onSubmit={(event) => void submit(event)} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Full name<input name="fullName" defaultValue={profile.full_name} required className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 px-3" /></label><label className="text-sm font-medium">Role<select name="role" defaultValue={profile.role} required className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3">{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-medium">Department<input name="department" defaultValue={profile.department} required className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 px-3" /></label><label className="flex min-h-10 items-center gap-3 rounded-md border border-neutral-200 px-3 text-sm font-medium sm:mt-6"><input name="active" type="checkbox" defaultChecked={profile.active} className="h-4 w-4 accent-[#176b5c]" />Active access</label></div><div className="flex justify-end gap-2 border-t border-neutral-200 pt-4"><SecondaryButton onClick={onCancel}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={!!busy}>{busy ? "Saving..." : "Save access"}</PrimaryButton></div></form>;
}
