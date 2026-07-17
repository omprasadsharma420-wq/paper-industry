"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  ClipboardList,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Filter,
  Home,
  Layers3,
  ListTodo,
  Lock,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  UserRoundCheck,
  Users,
  Wifi,
  WifiOff,
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
  words,
} from "@/lib/agra-rules";
import {
  DEMO_AGEING_DEFAULTS,
  ROLE_HOME_TITLES,
  ROLE_LABELS,
  actionLabel,
  ageingForDate,
  categoryLabel,
  deriveWorkTasks,
  durationLabel,
  nextRoleAfterAction,
  orderBlocker,
  orderNextAction,
  orderOwnerRole,
  plainLabel,
  productFamily,
  productVariant,
  recentRoleActivity,
  simpleAvailability,
  statusLabel,
  stockState,
  unitLabel,
  type AgeingCategory,
  type WorkTask,
} from "@/lib/agra-presentation";
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

const ROLE_NAV: Record<Role, ViewKey[]> = {
  SALES_ORDER_COORDINATOR: ["home", "orders", "customers", "products"],
  INVENTORY_QUALITY: ["home", "products", "stock", "quality", "orders"],
  PACKING_DISPATCH: ["home", "dispatch", "orders", "stock"],
  OPERATIONS_SUPERVISOR: ["home", "orders", "issues"],
  MANAGER_ADMIN: [
    "home",
    "orders",
    "products",
    "stock",
    "reports",
    "admin",
  ],
};

const VIEW_META: Record<
  ViewKey,
  { label: string; title: string; icon: typeof Home }
> = {
  home: { label: "My Work", title: "My Work", icon: ListTodo },
  orders: { label: "Orders", title: "Customer orders", icon: ClipboardList },
  customers: { label: "Customers", title: "Customers", icon: Building2 },
  products: { label: "Products", title: "Products and SKUs", icon: Layers3 },
  stock: { label: "Inventory", title: "Finished-goods inventory", icon: Boxes },
  quality: { label: "Quality", title: "Quality and rework", icon: ShieldCheck },
  dispatch: { label: "Packing & Dispatch", title: "Packing and dispatch", icon: Truck },
  issues: { label: "Exceptions", title: "Exception centre", icon: AlertTriangle },
  reports: { label: "Reports", title: "Management reports", icon: BarChart3 },
  admin: { label: "Administration", title: "Administration", icon: Settings2 },
  team: { label: "Team", title: "Team access", icon: Users },
  system: { label: "System", title: "System status", icon: Settings2 },
};

function shortDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(new Date(`${value}T00:00:00+05:45`));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-NP", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kathmandu",
  }).format(new Date(value));
}

function nepalToday() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(new Date());
}

function number(value: number) {
  return new Intl.NumberFormat("en-NP", { maximumFractionDigits: 2 }).format(value);
}

function statusTone(status: string) {
  if (["DISPATCHED", "RELEASED", "VERIFIED", "PASSED", "COMPLETED", "READY", "ON_TRACK", "AVAILABLE"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  }
  if (["BLOCKED", "DAMAGED", "CANCELLED", "CRITICAL", "CRITICALLY_OVERDUE", "OVERDUE"].includes(status)) {
    return "bg-red-50 text-red-700 ring-red-600/15";
  }
  if (["REWORK_REQUIRED", "AWAITING_PRODUCTION", "HIGH", "MISSING", "DUE_SOON", "LOW_STOCK"].includes(status)) {
    return "bg-amber-50 text-amber-800 ring-amber-600/20";
  }
  return "bg-blue-50 text-blue-700 ring-blue-600/15";
}

function locationState() {
  if (typeof window === "undefined") return { view: "home" as ViewKey, orderId: null as string | null };
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view") as ViewKey | null;
  return {
    view: requestedView && requestedView in VIEW_META ? requestedView : "home",
    orderId: params.get("order"),
  };
}

function updateLocation(view: ViewKey, orderId: string | null, replace = false) {
  const url = new URL(window.location.href);
  if (view === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view === "orders" && orderId) url.searchParams.set("order", orderId);
  else url.searchParams.delete("order");
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md px-2 py-1 text-[11px] font-semibold leading-none ring-1 ring-inset ${statusTone(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function AgeingBadge({ ageing }: { ageing: AgeingCategory }) {
  return <StatusBadge status={ageing} />;
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
    <div className="min-w-0 border-r border-neutral-200 px-5 py-4 last:border-r-0 max-sm:odd:border-b max-sm:even:border-b max-sm:even:border-r-0">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-neutral-500">{detail}</p>
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-45 ${className}`}
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-45 ${className}`}
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
      className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-neutral-300 bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-950 disabled:opacity-45"
    >
      {children}
    </button>
  );
}

export function AgraOperationsApp({ session }: { session: Session }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<ViewKey>(() => locationState().view);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => locationState().orderId);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

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
    const interval = window.setInterval(() => void refresh(true), 3000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const onPopState = () => {
      const next = locationState();
      setView(next.view);
      setSelectedOrderId(next.orderId);
      setDialog(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);

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
  const activeView = availableViews.includes(view) ? view : "home";
  const selectedOrder = selectedOrderId
    ? workspace.orders.find((order) => order.id === selectedOrderId) ?? null
    : null;
  const assignedTasks = deriveWorkTasks(workspace, role);
  const pageTitle = activeView === "home" ? ROLE_HOME_TITLES[role].title : VIEW_META[activeView].title;

  const chooseView = (next: ViewKey) => {
    setView(next);
    if (next !== "orders") setSelectedOrderId(null);
    updateLocation(next, next === "orders" ? selectedOrderId : null);
    setMobileNav(false);
    setNotificationsOpen(false);
  };
  const chooseOrder = (id: string) => {
    setSelectedOrderId(id);
    setView("orders");
    updateLocation("orders", id);
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
              const active = activeView === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseView(key)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${active ? "bg-neutral-950 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                  {key === "home" && assignedTasks.length > 0 ? (
                    <span className={`ml-auto min-w-5 rounded px-1.5 py-0.5 text-center text-[10px] font-bold ${active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                      {assignedTasks.length}
                    </span>
                  ) : null}
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
        <header className="sticky top-0 z-20 flex min-h-[72px] items-center border-b border-neutral-200 bg-[#f5f5f7]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setMobileNav(true)} className="mr-3 grid h-11 w-11 place-items-center rounded-md border border-neutral-300 bg-white lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg">{pageTitle}</h1>
            <p className="truncate text-xs text-neutral-500">{activeView === "home" ? ROLE_HOME_TITLES[role].detail : workspace.organization.name}</p>
          </div>
          <div className="relative ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex"><CircleDot className="h-3 w-3" />Demo mode · Fictional data</span>
            <span className={`hidden items-center gap-1.5 text-xs ${online ? "text-neutral-500" : "font-semibold text-red-700"} md:inline-flex`}>
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online ? `Updated ${dateTime(workspace.loadedAt)}` : "Connection lost"}
            </span>
            {role !== "MANAGER_ADMIN" ? (
              <IconButton label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}>
                <Bell className="h-4 w-4" />
                {assignedTasks.length ? <span className="sr-only">{assignedTasks.length} assigned items</span> : null}
              </IconButton>
            ) : null}
            <IconButton label="Refresh data" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </IconButton>
            {notificationsOpen ? (
              <div className="absolute right-12 top-14 z-30 w-[min(360px,calc(100vw-2rem))] rounded-md border border-neutral-200 bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
                <div className="flex items-center justify-between px-2 py-2">
                  <div><p className="text-sm font-semibold">Assigned work</p><p className="text-xs text-neutral-500">Only changes that affect your role</p></div>
                  <StatusBadge status={assignedTasks.length ? "READY" : "COMPLETED"} />
                </div>
                <div className="divide-y divide-neutral-100">
                  {assignedTasks.slice(0, 4).map((task) => (
                    <button key={task.id} type="button" onClick={() => chooseOrder(task.orderId)} className="block min-h-11 w-full px-2 py-3 text-left hover:bg-neutral-50">
                      <span className="block text-sm font-semibold">{task.title}</span>
                      <span className="mt-1 block text-xs text-neutral-500">{task.actionLabel}</span>
                    </button>
                  ))}
                  {!assignedTasks.length ? <p className="px-2 py-5 text-sm text-neutral-500">No new work is assigned to your role.</p> : null}
                </div>
              </div>
            ) : null}
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

          {activeView === "home" ? <HomeView workspace={workspace} onOpenOrder={chooseOrder} onNewOrder={() => setDialog({ type: "newOrder" })} /> : null}
          {activeView === "orders" ? <OrdersView workspace={workspace} selectedOrder={selectedOrder} onSelectOrder={chooseOrder} onBack={() => { setSelectedOrderId(null); updateLocation("orders", null); }} onNewOrder={() => setDialog({ type: "newOrder" })} onRun={runAction} onDialog={setDialog} busy={busy} /> : null}
          {activeView === "customers" ? <CustomersView customers={workspace.customers} onNew={() => setDialog({ type: "newCustomer" })} /> : null}
          {activeView === "products" ? <ProductsView workspace={workspace} canAdd={role === "INVENTORY_QUALITY"} onNew={() => setDialog({ type: "newProduct" })} /> : null}
          {activeView === "stock" ? <StockView products={workspace.products} batches={workspace.inventoryBatches} canEdit={role === "INVENTORY_QUALITY"} onReceive={() => setDialog({ type: "receiveBatch" })} onInspect={(batchId) => setDialog({ type: "inspectBatch", batchId })} /> : null}
          {activeView === "quality" ? <QualityView workspace={workspace} onOpenOrder={chooseOrder} onDialog={setDialog} /> : null}
          {activeView === "dispatch" ? <DispatchView workspace={workspace} onOpenOrder={chooseOrder} onDialog={setDialog} /> : null}
          {activeView === "issues" ? <IssuesView workspace={workspace} onOpenOrder={chooseOrder} onResolve={(orderId, exceptionId) => setDialog({ type: "resolve", orderId, exceptionId })} /> : null}
          {activeView === "reports" ? <ReportsView workspace={workspace} /> : null}
          {activeView === "admin" ? <AdministrationView workspace={workspace} busy={busy} onEdit={(profileId) => setDialog({ type: "team", profileId })} onReset={async () => { if (!window.confirm("Reset all demo data to the reference starting point?")) return; await runAction("RESET_DEMO", null); }} /> : null}

          <aside className="mt-9 flex items-start gap-3 border-t border-neutral-200 pt-4 text-xs leading-5 text-neutral-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#176b5c]" aria-hidden="true" />
            <p><strong className="font-semibold text-neutral-700">Reference Pilot.</strong> This reference pilot is configured from preliminary company information. Final products, roles, controls, approval rules, and reporting requirements must be validated with Agra Industries.</p>
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

type WorkView = "MY_TASKS" | "ROLE_QUEUE" | "DUE_TODAY" | "OVERDUE" | "BLOCKED" | "RECENT";

const WORK_VIEWS: Array<{ value: WorkView; label: string }> = [
  { value: "MY_TASKS", label: "My tasks" },
  { value: "ROLE_QUEUE", label: "Role queue" },
  { value: "DUE_TODAY", label: "Due today" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "RECENT", label: "Completed recently" },
];

function HomeView({ workspace, onOpenOrder, onNewOrder }: { workspace: Workspace; onOpenOrder: (id: string) => void; onNewOrder: () => void }) {
  if (workspace.currentUser.role === "MANAGER_ADMIN") {
    return <ManagerHome workspace={workspace} onOpenOrder={onOpenOrder} />;
  }
  return <RoleWorkHome workspace={workspace} onOpenOrder={onOpenOrder} onNewOrder={onNewOrder} />;
}

function RoleWorkHome({ workspace, onOpenOrder, onNewOrder }: { workspace: Workspace; onOpenOrder: (id: string) => void; onNewOrder: () => void }) {
  const role = workspace.currentUser.role;
  const operationalRole = role as Exclude<Role, "MANAGER_ADMIN">;
  const [workView, setWorkView] = useState<WorkView>("MY_TASKS");
  const tasks = useMemo(() => deriveWorkTasks(workspace, role), [workspace, role]);
  const recent = useMemo(() => recentRoleActivity(workspace, role), [workspace, role]);
  const today = nepalToday();
  const dueToday = tasks.filter((task) => task.dueDate === today).length;
  const overdue = tasks.filter((task) => ["OVERDUE", "CRITICALLY_OVERDUE"].includes(task.ageing)).length;
  const blocked = tasks.filter((task) => task.status === "BLOCKED").length;
  const visibleTasks = tasks.filter((task) => {
    if (workView === "MY_TASKS") return task.assignedPerson === workspace.currentUser.full_name;
    if (workView === "DUE_TODAY") return task.dueDate === today;
    if (workView === "OVERDUE") return ["OVERDUE", "CRITICALLY_OVERDUE"].includes(task.ageing);
    if (workView === "BLOCKED") return task.status === "BLOCKED";
    return true;
  });
  const roleGuidance: Record<Exclude<Role, "MANAGER_ADMIN">, string> = {
    SALES_ORDER_COORDINATOR: "Complete the order information, then hand the order to Inventory & Quality.",
    INVENTORY_QUALITY: "Use released batches only. Quality decisions cannot change customer order details.",
    PACKING_DISPATCH: "Picked, packed and approved quantities must match before handover.",
    OPERATIONS_SUPERVISOR: "Approve, coordinate or resolve. Quantity and quality controls remain with the assigned teams.",
  };

  return (
    <div className="space-y-7">
      <section className="border-y border-neutral-200 bg-white">
        <div className="grid grid-cols-3">
          <Metric label="Assigned now" value={tasks.length} detail={ROLE_LABELS[role]} tone="blue" />
          <Metric label="Due or overdue" value={dueToday + overdue} detail={`${dueToday} due today, ${overdue} overdue`} tone={overdue ? "red" : "neutral"} />
          <Metric label="Blocked" value={blocked} detail={blocked ? "A reason is recorded" : "No blocked work"} tone={blocked ? "red" : "green"} />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#176b5c]">Start here</p>
            <h2 className="mt-1 text-lg font-semibold">What needs your attention</h2>
            <p className="mt-1 text-sm text-neutral-500">{roleGuidance[operationalRole]}</p>
          </div>
          {role === "SALES_ORDER_COORDINATOR" ? <PrimaryButton onClick={onNewOrder}><Plus className="h-4 w-4" />New order</PrimaryButton> : null}
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto rounded-md bg-neutral-200/70 p-1" role="tablist" aria-label="Work queue views">
          {WORK_VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={workView === item.value}
              onClick={() => setWorkView(item.value)}
              className={`min-h-10 shrink-0 rounded px-3 text-sm font-medium transition ${workView === item.value ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-600 hover:text-neutral-950"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {workView === "RECENT" ? (
          recent.length ? <div className="mt-2 divide-y divide-neutral-200">{recent.map((event) => <RecentWorkRow key={event.id} event={event} />)}</div> : <EmptyState icon={CheckCircle2} title="No recent completions" detail="Completed work from this role will be listed here." />
        ) : visibleTasks.length ? (
          <div className="mt-2 divide-y divide-neutral-200" data-testid="work-queue">
            {visibleTasks.map((task) => <WorkTaskRow key={task.id} task={task} onOpen={() => onOpenOrder(task.orderId)} />)}
          </div>
        ) : <EmptyState icon={CheckCircle2} title="This view is clear" detail="New work appears here as soon as the previous role completes its handoff." />}
      </section>

      <RoleContext workspace={workspace} />
    </div>
  );
}

function WorkTaskRow({ task, onOpen }: { task: WorkTask; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group grid min-h-[92px] w-full items-center gap-3 px-2 py-4 text-left hover:bg-white sm:grid-cols-[minmax(0,1.5fr)_140px_150px_180px_28px]" data-testid="work-task">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-[#176b5c]">{task.taskType}</span><StatusBadge status={task.fulfillmentStatus} /></div>
        <p className="mt-1.5 text-sm font-semibold text-neutral-950">{task.title}</p>
        <p className="mt-1 truncate text-xs text-neutral-500">{task.customerName} · {task.productSummary}</p>
        {task.blockingReason ? <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-700"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{task.blockingReason}</p> : null}
      </div>
      <div><p className="text-xs text-neutral-500">Due</p><p className="mt-1 text-sm font-semibold">{shortDate(task.dueDate)}</p><div className="mt-2"><AgeingBadge ageing={task.ageing} /></div></div>
      <div><p className="text-xs text-neutral-500">In this stage</p><p className="mt-1 text-sm font-semibold">{task.ageLabel}</p><p className="mt-1 text-xs text-neutral-500">{task.assignedPerson ?? ROLE_LABELS[task.assignedRole]}</p></div>
      <div className="rounded-md border border-neutral-200 bg-white px-3 py-2.5 group-hover:border-neutral-300"><p className="text-[11px] font-medium text-neutral-500">Next action</p><p className="mt-1 text-sm font-semibold">{task.actionLabel}</p><p className="mt-1 text-[11px] text-neutral-500">Then: {task.nextRole}</p></div>
      <ChevronRight className="h-5 w-5 text-neutral-400" />
    </button>
  );
}

function RecentWorkRow({ event }: { event: Workspace["auditEvents"][number] }) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 px-2 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{actionLabel(event.action)}</p><p className="mt-1 truncate text-xs text-neutral-500">{event.reason ?? "Handoff recorded in the order timeline"}</p></div>
      <time className="text-xs text-neutral-500">{dateTime(event.created_at)}</time>
    </div>
  );
}

function RoleContext({ workspace }: { workspace: Workspace }) {
  const role = workspace.currentUser.role;
  if (role === "SALES_ORDER_COORDINATOR") {
    return <section><SectionHeader title="Product availability" detail="Simple guidance for order conversations" /><div className="grid gap-px border-y border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3">{workspace.products.slice(0, 6).map((product) => <div key={product.id} className="bg-[#f5f5f7] px-4 py-4"><p className="text-sm font-semibold">{productFamily(product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(product)}</p><p className="mt-3 text-sm font-semibold text-[#176b5c]">{simpleAvailability(product)}</p></div>)}</div></section>;
  }
  if (role === "INVENTORY_QUALITY") {
    const attention = workspace.products.filter((product) => product.pendingStock + product.reworkStock + product.blockedStock + product.damagedStock > 0);
    return <section><SectionHeader title="Stock requiring attention" detail="Pending quality, rework, blocked and damaged stock stay separate" /><div className="divide-y divide-neutral-200">{attention.map((product) => <div key={product.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(4,100px)]"><div><p className="text-sm font-semibold">{productFamily(product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(product)} · {product.sku}</p></div><StockNumber label="Pending QC" value={product.pendingStock} /><StockNumber label="Rework" value={product.reworkStock} /><StockNumber label="Blocked" value={product.blockedStock} /><StockNumber label="Damaged" value={product.damagedStock} /></div>)}{!attention.length ? <EmptyState icon={CircleCheck} title="No stock needs correction" detail="All current finished stock is in a reconciled state." /> : null}</div></section>;
  }
  if (role === "PACKING_DISPATCH") {
    const documents = workspace.orders.filter((order) => order.documents.some((document) => document.required && document.status !== "VERIFIED"));
    return <section><SectionHeader title="Document readiness" detail="Required references must be verified before handover" /><div className="divide-y divide-neutral-200">{documents.map((order) => <div key={order.id} className="flex items-center gap-4 py-4"><FileText className="h-5 w-5 text-amber-700" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{order.order_no} · {order.customer.name}</p><p className="mt-1 text-xs text-neutral-500">{order.documents.filter((document) => document.required && document.status !== "VERIFIED").map((document) => plainLabel(document.document_type)).join(", ")}</p></div><StatusBadge status="MISSING" /></div>)}</div></section>;
  }
  const openIssues = workspace.exceptions.filter((item) => item.status === "OPEN");
  return <section><SectionHeader title="Exception ownership" detail="See the blocking reason and the team responsible for correction" /><div className="divide-y divide-neutral-200">{openIssues.map((issue) => { const order = workspace.orders.find((item) => item.id === issue.order_id); return <div key={issue.id} className="grid gap-3 py-4 sm:grid-cols-[150px_minmax(0,1fr)_180px]"><div><p className="text-sm font-semibold">{order?.order_no ?? "General"}</p><p className="mt-1 text-xs text-neutral-500">{dateTime(issue.created_at)}</p></div><div><p className="text-sm font-semibold">{plainLabel(issue.code)}</p><p className="mt-1 text-sm text-neutral-600">{issue.message}</p></div><div><p className="text-xs text-neutral-500">Current owner</p><p className="mt-1 text-sm font-semibold">{order ? ROLE_LABELS[orderOwnerRole(order)] : "Operations Supervisor"}</p></div></div>; })}</div></section>;
}

function StockNumber({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs text-neutral-500">{label}</p><p className={`mt-1 text-sm font-semibold ${value ? "text-amber-800" : "text-neutral-700"}`}>{number(value)}</p></div>;
}

function ManagerHome({ workspace, onOpenOrder }: { workspace: Workspace; onOpenOrder: (id: string) => void }) {
  const today = nepalToday();
  const activeOrders = workspace.orders.filter((order) => ACTIVE_STATUSES.has(order.fulfillment_status));
  const delayed = activeOrders.filter((order) => order.requested_dispatch_date < today);
  const dueSoon = activeOrders.filter((order) => order.requested_dispatch_date >= today && deriveWorkTasks(workspace, orderOwnerRole(order)).some((task) => task.orderId === order.id && ["DUE_SOON", "OVERDUE", "CRITICALLY_OVERDUE"].includes(task.ageing)));
  const dispatched = workspace.orders.filter((order) => order.fulfillment_status === "DISPATCHED");
  const openIssues = workspace.exceptions.filter((item) => item.status === "OPEN");
  const stockRisk = workspace.products.filter((product) => product.availableStock < product.minimum_stock_level || product.reworkStock + product.blockedStock + product.damagedStock > 0);
  const qualityChecks = workspace.orders.flatMap((order) => order.qualityChecks);
  const failedChecks = qualityChecks.filter((check) => check.result !== "PASSED");
  const reworkQuantity = workspace.products.reduce((sum, product) => sum + product.reworkStock, 0);
  const workflow = STATUS_ORDER.map((status) => ({ status, count: workspace.orders.filter((order) => order.fulfillment_status === status).length })).filter((item) => item.count > 0);
  const maxWorkflow = Math.max(...workflow.map((item) => item.count), 1);
  const demoOrder = workspace.orders.find((order) => order.order_no === "AGRA-DEMO-001") ?? null;
  const roleWorkload = (["SALES_ORDER_COORDINATOR", "INVENTORY_QUALITY", "PACKING_DISPATCH", "OPERATIONS_SUPERVISOR"] as Role[]).map((item) => ({ role: item, count: deriveWorkTasks(workspace, item).length }));

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label="Orders due" value={dueSoon.length} detail="Within demonstration threshold" tone="blue" />
          <Metric label="Delayed" value={delayed.length} detail="Past required date" tone={delayed.length ? "red" : "green"} />
          <Metric label="Dispatched" value={dispatched.length} detail="Closed orders" tone="green" />
          <Metric label="Open exceptions" value={openIssues.length} detail="Recorded blockers" tone={openIssues.length ? "red" : "green"} />
          <Metric label="Stock risk" value={stockRisk.length} detail="SKUs needing attention" tone={stockRisk.length ? "red" : "green"} />
          <Metric label="Quality risk" value={failedChecks.length} detail={`${number(reworkQuantity)} units in rework`} tone={failedChecks.length ? "red" : "green"} />
        </div>
      </section>

      {demoOrder ? <DemoProgress order={demoOrder} onOpen={() => onOpenOrder(demoOrder.id)} /> : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section>
          <SectionHeader title="Operational flow" detail="Current orders by fulfilment stage" />
          <div className="space-y-4 py-5">{workflow.map((item) => <div key={item.status}><div className="mb-1.5 flex items-center justify-between text-sm"><span>{statusLabel(item.status)}</span><span className="font-semibold">{item.count}</span></div><div className="h-2 rounded-sm bg-neutral-200"><div className="h-2 rounded-sm bg-[#176b5c]" style={{ width: `${Math.max((item.count / maxWorkflow) * 100, 8)}%` }} /></div></div>)}</div>
        </section>
        <section>
          <SectionHeader title="Workload by role" detail="Open tasks derived from current handoffs" />
          <div className="divide-y divide-neutral-200">{roleWorkload.map((item) => <div key={item.role} className="flex items-center gap-4 py-4"><span className="grid h-9 w-9 place-items-center rounded-md bg-neutral-100 text-neutral-700"><UserRoundCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{ROLE_LABELS[item.role]}</p><p className="mt-1 text-xs text-neutral-500">{workspace.team.find((profile) => profile.role === item.role)?.full_name ?? "Unassigned"}</p></div><span className="text-lg font-semibold">{item.count}</span></div>)}</div>
        </section>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <section><SectionHeader title="Delayed and blocked orders" detail="The owner and next action remain visible" />{[...delayed, ...activeOrders.filter((order) => orderBlocker(order))].filter((order, index, items) => items.findIndex((item) => item.id === order.id) === index).slice(0, 6).map((order) => { const owner = orderOwnerRole(order); return <button key={order.id} type="button" onClick={() => onOpenOrder(order.id)} className="grid w-full gap-3 border-b border-neutral-200 py-4 text-left sm:grid-cols-[140px_minmax(0,1fr)_170px_auto]"><div><p className="text-sm font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">Due {shortDate(order.requested_dispatch_date)}</p></div><div><p className="text-sm font-medium">{order.customer.name}</p><p className="mt-1 text-xs text-red-700">{orderBlocker(order) ?? "Required date has passed"}</p></div><div><p className="text-xs text-neutral-500">Owner</p><p className="mt-1 text-sm font-semibold">{ROLE_LABELS[owner]}</p></div><ChevronRight className="h-5 w-5 text-neutral-400" /></button>; })}</section>
        <section><SectionHeader title="SKU attention" detail="Readable variants with stock risk" /><div className="divide-y divide-neutral-200">{(stockRisk.length ? stockRisk : workspace.products).slice(0, 6).map((product) => <div key={product.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_100px_100px]"><div><p className="text-sm font-semibold">{productFamily(product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(product)} · {product.sku}</p></div><div><p className="text-xs text-neutral-500">Available</p><p className="mt-1 text-sm font-semibold">{number(product.availableStock)} {unitLabel(product.primary_unit, product.availableStock)}</p></div><div><p className="text-xs text-neutral-500">State</p><p className="mt-1 text-sm font-semibold">{stockState(product)}</p></div></div>)}</div></section>
      </div>

      <p className="border-t border-neutral-200 pt-4 text-xs leading-5 text-neutral-500">Ageing uses demonstration defaults: due soon within {DEMO_AGEING_DEFAULTS.dueSoonDays} days and critically overdue after {DEMO_AGEING_DEFAULTS.criticallyOverdueDays} days late. These thresholds require validation with Agra Industries.</p>
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

type OrderQuickView = "ALL" | "ACTIVE" | "DUE_TODAY" | "OVERDUE" | "BLOCKED" | "DISPATCHED";
type OrderSection = "OVERVIEW" | "FULFILMENT" | "TIMELINE" | "DOCUMENTS" | "EXCEPTIONS";

function handoverText(order: Order, key: string) {
  return order.handover ? String(order.handover[key] ?? "") : "";
}

function OrdersView({ workspace, selectedOrder, onSelectOrder, onBack, onNewOrder, onRun, onDialog, busy }: { workspace: Workspace; selectedOrder: Order | null; onSelectOrder: (id: string) => void; onBack: () => void; onNewOrder: () => void; onRun: (action: string, orderId: string | null, payload?: Record<string, unknown>) => Promise<boolean>; onDialog: (state: DialogState) => void; busy: string | null }) {
  const [search, setSearch] = useState("");
  const [quickView, setQuickView] = useState<OrderQuickView>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("ALL");
  const [customer, setCustomer] = useState("ALL");
  const [dispatchDate, setDispatchDate] = useState("");
  const [sku, setSku] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [owner, setOwner] = useState("ALL");
  const [delivery, setDelivery] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState("DUE_SOON");
  const role = workspace.currentUser.role;
  const today = nepalToday();
  const owners = [...new Set(workspace.orders.map((order) => ROLE_LABELS[orderOwnerRole(order)]))].sort();
  const categories = [...new Set(workspace.products.map((product) => product.category))].sort();

  if (selectedOrder) {
    return <OrderDetail workspace={workspace} order={selectedOrder} role={role} busy={busy} onBack={onBack} onRun={onRun} onDialog={onDialog} />;
  }

  const filtered = workspace.orders.filter((order) => {
    const haystack = `${order.order_no} ${order.customer.name} ${order.customer_order_reference ?? ""} ${handoverText(order, "tracking_number")} ${order.items.map((item) => `${item.product.sku} ${item.product.name} ${productFamily(item.product)} ${productVariant(item.product)}`).join(" ")}`.toLowerCase();
    const quickMatches = quickView === "ALL"
      || (quickView === "ACTIVE" && ACTIVE_STATUSES.has(order.fulfillment_status))
      || (quickView === "DUE_TODAY" && order.requested_dispatch_date === today)
      || (quickView === "OVERDUE" && ACTIVE_STATUSES.has(order.fulfillment_status) && order.requested_dispatch_date < today)
      || (quickView === "BLOCKED" && Boolean(orderBlocker(order)))
      || (quickView === "DISPATCHED" && order.fulfillment_status === "DISPATCHED");
    return quickMatches
      && (!search || haystack.includes(search.toLowerCase()))
      && (status === "ALL" || order.fulfillment_status === status)
      && (customer === "ALL" || order.customer_id === customer)
      && (!dispatchDate || order.requested_dispatch_date === dispatchDate)
      && (sku === "ALL" || order.items.some((item) => item.product_id === sku))
      && (priority === "ALL" || order.priority === priority)
      && (owner === "ALL" || ROLE_LABELS[orderOwnerRole(order)] === owner)
      && (delivery === "ALL" || handoverText(order, "delivery_method") === delivery)
      && (category === "ALL" || order.items.some((item) => item.product.category === category));
  }).sort((left, right) => {
    if (sort === "ORDER_NO") return left.order_no.localeCompare(right.order_no);
    if (sort === "CUSTOMER") return left.customer.name.localeCompare(right.customer.name) || left.order_no.localeCompare(right.order_no);
    if (sort === "NEWEST") return right.order_date.localeCompare(left.order_date) || right.order_no.localeCompare(left.order_no);
    return left.requested_dispatch_date.localeCompare(right.requested_dispatch_date) || left.order_no.localeCompare(right.order_no);
  });
  const hasAdvancedFilters = Boolean(dispatchDate || [status, customer, sku, priority, owner, delivery, category].some((value) => value !== "ALL"));
  const clearFilters = () => { setSearch(""); setQuickView("ALL"); setStatus("ALL"); setCustomer("ALL"); setDispatchDate(""); setSku("ALL"); setPriority("ALL"); setOwner("ALL"); setDelivery("ALL"); setCategory("ALL"); };
  const quickViews: Array<{ value: OrderQuickView; label: string }> = [{ value: "ALL", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "DUE_TODAY", label: "Due today" }, { value: "OVERDUE", label: "Overdue" }, { value: "BLOCKED", label: "Blocked" }, { value: "DISPATCHED", label: "Dispatched" }];

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-4">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search orders</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, product, SKU or tracking" className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm" />
        </label>
        <SecondaryButton onClick={() => setFiltersOpen((value) => !value)}><Filter className="h-4 w-4" />Filters{hasAdvancedFilters ? " · Active" : ""}<ChevronDown className={`h-4 w-4 transition ${filtersOpen ? "rotate-180" : ""}`} /></SecondaryButton>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort orders" className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="DUE_SOON">Due soon</option><option value="NEWEST">Newest</option><option value="ORDER_NO">Order number</option><option value="CUSTOMER">Customer</option></select>
        {role === "SALES_ORDER_COORDINATOR" ? <PrimaryButton onClick={onNewOrder}><Plus className="h-4 w-4" />New order</PrimaryButton> : null}
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-md bg-neutral-200/70 p-1" aria-label="Saved order views">
        {quickViews.map((item) => <button key={item.value} type="button" onClick={() => setQuickView(item.value)} className={`min-h-10 shrink-0 rounded px-3 text-sm font-medium ${quickView === item.value ? "bg-white shadow-sm" : "text-neutral-600"}`}>{item.label}</button>)}
      </div>

      {filtersOpen ? (
        <div className="mt-3 grid gap-3 border-y border-neutral-200 bg-white px-4 py-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Order filters">
          <FilterSelect label="Stage" value={status} onChange={setStatus} options={STATUS_ORDER.map((value) => ({ value, label: statusLabel(value) }))} allLabel="All stages" />
          <FilterSelect label="Customer" value={customer} onChange={setCustomer} options={workspace.customers.map((item) => ({ value: item.id, label: item.name }))} allLabel="All customers" />
          <label className="text-xs font-medium text-neutral-600">Required date<input value={dispatchDate} onChange={(event) => setDispatchDate(event.target.value)} type="date" aria-label="Filter by dispatch date" className="mt-1.5 h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm" /></label>
          <FilterSelect label="SKU" value={sku} onChange={setSku} options={workspace.products.map((item) => ({ value: item.id, label: `${productFamily(item)} · ${item.sku}` }))} allLabel="All SKUs" />
          <FilterSelect label="Priority" value={priority} onChange={setPriority} options={["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => ({ value, label: plainLabel(value) }))} allLabel="All priorities" />
          <FilterSelect label="Owner" value={owner} onChange={setOwner} options={owners.map((value) => ({ value, label: value }))} allLabel="All teams" />
          <FilterSelect label="Product category" value={category} onChange={setCategory} options={categories.map((value) => ({ value, label: categoryLabel(value) }))} allLabel="All categories" />
          <FilterSelect label="Delivery method" value={delivery} onChange={setDelivery} options={["CUSTOMER_PICKUP", "COMPANY_VEHICLE", "THIRD_PARTY_COURIER", "HIRED_TRANSPORTER", "EXPORT_FREIGHT"].map((value) => ({ value, label: plainLabel(value) }))} allLabel="All delivery methods" />
          <div className="flex items-end lg:col-span-4">{hasAdvancedFilters || search || quickView !== "ALL" ? <SecondaryButton onClick={clearFilters}><X className="h-4 w-4" />Clear filters</SecondaryButton> : null}</div>
        </div>
      ) : null}

      <div className="mt-5 flex items-end justify-between border-b border-neutral-200 pb-3"><div><h2 className="text-base font-semibold">Order register</h2><p className="mt-1 text-sm text-neutral-500">{filtered.length} of {workspace.orders.length} orders</p></div><p className="hidden text-xs text-neutral-500 sm:block">Select an order to open its full workspace</p></div>
      <div data-testid="order-list" className="divide-y divide-neutral-200">
        {filtered.map((order) => {
          const ownerRole = orderOwnerRole(order);
          const ageing = ageingForDate(order.requested_dispatch_date);
          return (
            <button key={order.id} type="button" data-testid="order-row" data-order-id={order.id} onClick={() => onSelectOrder(order.id)} className="grid min-h-[94px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-2 py-4 text-left transition hover:bg-white sm:grid-cols-[150px_minmax(0,1.3fr)_minmax(0,1fr)_150px_28px]">
              <div><p className="text-sm font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">{plainLabel(order.priority)} priority</p><div className="mt-2"><StatusBadge status={order.fulfillment_status} /></div></div>
              <div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-semibold">{order.customer.name}</p><p className="mt-1 truncate text-xs text-neutral-500">{order.items.map((item) => `${productFamily(item.product)} · ${productVariant(item.product)}`).join(", ")}</p></div>
              <div className="hidden min-w-0 sm:block"><p className="text-xs text-neutral-500">Owner · {ROLE_LABELS[ownerRole]}</p><p className="mt-1 truncate text-sm font-semibold">{orderNextAction(order)}</p>{orderBlocker(order) ? <p className="mt-1 truncate text-xs text-red-700">{orderBlocker(order)}</p> : null}</div>
              <div><p className="text-xs text-neutral-500">Required {shortDate(order.requested_dispatch_date)}</p><div className="mt-2"><AgeingBadge ageing={ageing} /></div></div>
              <ChevronRight className="h-5 w-5 text-neutral-400" />
            </button>
          );
        })}
        {!filtered.length ? <EmptyState icon={Search} title="No matching orders" detail="Change the search, saved view or filters." /> : null}
      </div>
    </section>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; allLabel: string }) {
  return <label className="text-xs font-medium text-neutral-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Filter by ${label.toLowerCase()}`} className="mt-1.5 h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="ALL">{allLabel}</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}

function OrderDetail({ workspace, order, role, busy, onBack, onRun, onDialog }: { workspace: Workspace; order: Order; role: Role; busy: string | null; onBack: () => void; onRun: (action: string, orderId: string | null, payload?: Record<string, unknown>) => Promise<boolean>; onDialog: (state: DialogState) => void }) {
  const [section, setSection] = useState<OrderSection>("OVERVIEW");
  const status = order.fulfillment_status;
  const currentStage = FLOW_STAGE[status] ?? 0;
  const ownerRole = orderOwnerRole(order);
  const owner = workspace.team.find((profile) => profile.role === ownerRole && profile.active) ?? null;
  const blocker = orderBlocker(order);
  const ageing = ageingForDate(order.requested_dispatch_date);
  const stageEvent = workspace.auditEvents.find((event) => event.entity_id === order.id && event.success && event.new_status === status);
  const stageAge = durationLabel(stageEvent?.created_at ?? `${order.order_date}T00:00:00+05:45`);
  const orderEvents = workspace.auditEvents.filter((event) => event.entity_id === order.id);
  const requiredDocumentsComplete = order.documents.filter((document) => document.required).every((document) => document.status === "VERIFIED");
  const sections: Array<{ value: OrderSection; label: string; count?: number }> = [
    { value: "OVERVIEW", label: "Overview" },
    { value: "FULFILMENT", label: "Fulfilment" },
    { value: "TIMELINE", label: "Timeline", count: orderEvents.length },
    { value: "DOCUMENTS", label: "Documents", count: order.documents.filter((document) => document.status !== "VERIFIED").length },
    { value: "EXCEPTIONS", label: "Exceptions", count: order.exceptions.filter((item) => item.status === "OPEN").length },
  ];

  return (
    <article className="order-print-view">
      <button type="button" onClick={onBack} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-neutral-600 hover:bg-white hover:text-neutral-950"><ArrowLeft className="h-4 w-4" />Back to orders</button>

      <header className="border-y border-neutral-200 bg-white px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-[#176b5c]">Customer order</span><StatusBadge status={status} /><AgeingBadge ageing={ageing} /></div><h2 className="mt-2 text-2xl font-semibold">{order.order_no}</h2><p className="mt-1 text-sm text-neutral-600">{order.customer.name}{order.customer_order_reference ? ` · Customer reference ${order.customer_order_reference}` : ""}</p></div>
          <div className="flex gap-2 print:hidden"><SecondaryButton onClick={() => window.print()}><Printer className="h-4 w-4" />Print view</SecondaryButton></div>
        </div>

        <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-4">
          <OrderHeaderFact label="Current stage" value={statusLabel(status)} detail={`In stage ${stageAge}`} />
          <OrderHeaderFact label="Current owner" value={ROLE_LABELS[ownerRole]} detail={owner?.full_name ?? "Role queue"} />
          <OrderHeaderFact label="Next required action" value={orderNextAction(order)} detail={`Then: ${nextRoleAfterAction(order)}`} />
          <OrderHeaderFact label="Required date" value={shortDate(order.requested_dispatch_date)} detail={`${plainLabel(order.priority)} priority`} />
        </div>

        {blocker ? <div role="alert" className="mt-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Work is blocked</p><p className="mt-1">{blocker}</p></div></div> : null}

        <ol className="mt-5 grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-8" aria-label="Order progress">
          {FLOW_STEPS.map((step, index) => <li key={step} className="min-w-0"><span className={`block h-1.5 rounded-sm ${index <= currentStage ? "bg-[#176b5c]" : "bg-neutral-200"}`} /><span className={`mt-1.5 block truncate text-[11px] font-medium ${index === currentStage ? "text-neutral-950" : "text-neutral-500"}`}>{step}</span></li>)}
        </ol>
      </header>

      <OrderActionPanel order={order} role={role} busy={busy} documentsComplete={requiredDocumentsComplete} onRun={onRun} onDialog={onDialog} />

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-neutral-200 print:hidden" role="tablist" aria-label="Order sections">
        {sections.map((item) => <button key={item.value} type="button" role="tab" aria-selected={section === item.value} onClick={() => setSection(item.value)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${section === item.value ? "border-[#176b5c] text-neutral-950" : "border-transparent text-neutral-500"}`}>{item.label}{item.count ? ` (${item.count})` : ""}</button>)}
      </div>

      <div className="py-6">
        {section === "OVERVIEW" ? <OrderOverview order={order} /> : null}
        {section === "FULFILMENT" ? <OrderFulfilment order={order} /> : null}
        {section === "TIMELINE" ? <OrderTimeline events={orderEvents} order={order} /> : null}
        {section === "DOCUMENTS" ? <OrderDocuments order={order} /> : null}
        {section === "EXCEPTIONS" ? <OrderExceptions order={order} /> : null}
      </div>
    </article>
  );
}

function OrderHeaderFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 bg-white p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p><p className="mt-1 truncate text-xs text-neutral-500">{detail}</p></div>;
}

function OrderActionPanel({ order, role, busy, documentsComplete, onRun, onDialog }: { order: Order; role: Role; busy: string | null; documentsComplete: boolean; onRun: (action: string, orderId: string | null, payload?: Record<string, unknown>) => Promise<boolean>; onDialog: (state: DialogState) => void }) {
  const status = order.fulfillment_status;
  const openRework = order.reworkRecords.find((item) => item.status !== "COMPLETED");
  let primary: ReactNode = null;
  if (status === "DRAFT" && role === "SALES_ORDER_COORDINATOR") primary = <PrimaryButton disabled={!!busy || Boolean(orderBlocker(order))} onClick={() => void onRun("SUBMIT_ORDER", order.id)}>Submit for stock check <ArrowRight className="h-4 w-4" /></PrimaryButton>;
  if (["AWAITING_STOCK_CHECK", "BLOCKED"].includes(status) && role === "INVENTORY_QUALITY" && !order.exceptions.some((item) => item.status === "OPEN" && item.code === "MISSING_REQUIRED_DOCUMENT")) primary = <PrimaryButton disabled={!!busy} onClick={() => void onRun("CHECK_STOCK", order.id)}>Confirm released stock <Check className="h-4 w-4" /></PrimaryButton>;
  if (status === "AWAITING_PRODUCTION" && role === "INVENTORY_QUALITY") primary = <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "production", orderId: order.id })}>Record finished production</PrimaryButton>;
  if (status === "AWAITING_APPROVAL" && role === "OPERATIONS_SUPERVISOR") primary = <PrimaryButton disabled={!!busy} onClick={() => void onRun("APPROVE_ORDER", order.id)}>Approve and reserve stock <Check className="h-4 w-4" /></PrimaryButton>;
  if (status === "APPROVED" && role === "PACKING_DISPATCH") primary = <PrimaryButton disabled={!!busy} onClick={() => void onRun("START_PICKING", order.id)}>Start picking</PrimaryButton>;
  if (status === "PICKING" && role === "PACKING_DISPATCH") primary = <PrimaryButton disabled={!!busy} onClick={() => void onRun("COMPLETE_PICKING", order.id, { notes: "Picked as reserved." })}>Confirm picked quantity</PrimaryButton>;
  if (status === "AWAITING_QC" && role === "INVENTORY_QUALITY") primary = <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "quality", orderId: order.id })}>Complete quality check</PrimaryButton>;
  if (status === "REWORK_REQUIRED" && role === "INVENTORY_QUALITY" && openRework) primary = <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "rework", orderId: order.id, reworkId: openRework.id })}>Complete rework</PrimaryButton>;
  if (status === "PACKING" && role === "PACKING_DISPATCH") primary = <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "packing", orderId: order.id })}>Complete packing</PrimaryButton>;
  if ((status === "READY_FOR_HANDOVER" || order.exceptions.some((item) => item.status === "OPEN" && item.code === "MISSING_REQUIRED_DOCUMENT")) && role === "PACKING_DISPATCH") {
    primary = documentsComplete
      ? <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "handover", orderId: order.id })}><Truck className="h-4 w-4" />Confirm handover</PrimaryButton>
      : <PrimaryButton disabled={!!busy} onClick={() => onDialog({ type: "documents", orderId: order.id })}><FileCheck2 className="h-4 w-4" />Check required documents</PrimaryButton>;
  }
  const canCancel = ACTIVE_STATUSES.has(status) && role === "OPERATIONS_SUPERVISOR";
  const printLabel = ["APPROVED", "PICKING"].includes(status) ? "Print picking list" : status === "AWAITING_QC" ? "Print QC checklist" : ["PACKING", "READY_FOR_HANDOVER"].includes(status) ? "Print dispatch summary" : "Print order summary";

  return (
    <section className="mt-5 flex flex-wrap items-center gap-3 border-y border-neutral-200 bg-[#eef7f4] px-4 py-4 print:hidden sm:px-6" aria-label="Current order action">
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase text-[#176b5c]">Current action</p><p className="mt-1 text-sm font-semibold">{role === "MANAGER_ADMIN" ? "View operational progress" : orderNextAction(order)}</p><p className="mt-1 text-xs text-neutral-600">{role === "MANAGER_ADMIN" ? "Frontline work remains with the assigned role." : `Completing this hands work to ${nextRoleAfterAction(order)}.`}</p></div>
      <SecondaryButton onClick={() => window.print()}><Printer className="h-4 w-4" />{printLabel}</SecondaryButton>
      {canCancel ? <button type="button" disabled={!!busy} onClick={() => onDialog({ type: "cancel", orderId: order.id })} className="min-h-11 rounded-md px-3 text-sm font-semibold text-red-700 hover:bg-red-50">Cancel order</button> : null}
      {primary}
      {!primary && role !== "MANAGER_ADMIN" && !canCancel ? <span className="inline-flex min-h-11 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm text-neutral-600"><Lock className="h-4 w-4" />Assigned to {ROLE_LABELS[orderOwnerRole(order)]}</span> : null}
    </section>
  );
}

function OrderOverview({ order }: { order: Order }) {
  return <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]"><section><SectionHeader title="Order items" detail="Readable product and variant information" /><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs text-neutral-500"><tr className="border-b border-neutral-200"><th className="px-2 py-3 font-medium">Product</th><th className="px-2 py-3 font-medium">Variant</th><th className="px-2 py-3 font-medium">SKU</th><th className="px-2 py-3 text-right font-medium">Quantity</th><th className="px-2 py-3 font-medium">Availability</th><th className="px-2 py-3 font-medium">Source</th></tr></thead><tbody className="divide-y divide-neutral-200">{order.items.map((item) => <tr key={item.id}><td className="px-2 py-4 font-semibold">{productFamily(item.product)}</td><td className="px-2 py-4 text-neutral-700">{productVariant(item.product)}</td><td className="px-2 py-4 font-mono text-xs text-neutral-500">{item.product.sku}</td><td className="px-2 py-4 text-right font-semibold">{number(item.requested_quantity)} {unitLabel(item.unit, item.requested_quantity)}</td><td className="px-2 py-4"><StatusBadge status={simpleAvailability(item.product) === "Available" ? "AVAILABLE" : "LOW_STOCK"} /></td><td className="px-2 py-4">{plainLabel(order.fulfillment_source)}</td></tr>)}</tbody></table></div></section><section><SectionHeader title="Customer and requirements" /><dl className="divide-y divide-neutral-200"><DetailRow label="Customer" value={order.customer.name} /><DetailRow label="Customer reference" value={order.customer_order_reference ?? "Not provided"} /><DetailRow label="Required date" value={shortDate(order.requested_dispatch_date)} /><DetailRow label="Custom order" value={order.is_custom_order ? "Yes" : "No"} /><DetailRow label="Specifications" value={order.customization_summary ?? "Standard product specifications"} /><DetailRow label="Special packing" value={order.special_packaging_instructions ?? "Standard packing"} /><DetailRow label="Notes" value={order.notes ?? "No notes"} /></dl></section></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="py-3"><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 text-sm font-medium leading-6">{value}</dd></div>;
}

function OrderFulfilment({ order }: { order: Order }) {
  const packedQuantity = order.packing && Array.isArray(order.packing.items) ? order.packing.items.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.packed_quantity ?? 0), 0) : 0;
  return <div className="grid gap-8 lg:grid-cols-3"><section><SectionHeader title="Reservation and picking" /><dl className="divide-y divide-neutral-200"><DetailRow label="Reserved lines" value={`${order.reservations.length}`} /><DetailRow label="Picking records" value={`${order.picks.length}`} /><DetailRow label="Approved quantity" value={`${number(order.items.reduce((sum, item) => sum + item.approved_quantity, 0))}`} /></dl></section><section><SectionHeader title="Quality and packing" /><dl className="divide-y divide-neutral-200"><DetailRow label="Quality checks" value={`${order.qualityChecks.length}`} /><DetailRow label="Open rework" value={`${order.reworkRecords.filter((item) => item.status !== "COMPLETED").length}`} /><DetailRow label="Packed quantity" value={`${number(packedQuantity)}`} /></dl></section><section><SectionHeader title="Delivery" /><dl className="divide-y divide-neutral-200"><DetailRow label="Method" value={plainLabel(handoverText(order, "delivery_method"))} /><DetailRow label="Courier or vehicle" value={handoverText(order, "company_name") || handoverText(order, "vehicle_number") || "Not recorded"} /><DetailRow label="Tracking" value={handoverText(order, "tracking_number") || "Not recorded"} /></dl></section></div>;
}

function OrderTimeline({ events, order }: { events: Workspace["auditEvents"]; order: Order }) {
  return <section className="max-w-4xl"><SectionHeader title="Operational timeline" detail="Actor, role, time and important notes from the audit history" /><ol className="mt-2">{events.map((event) => <li key={event.id} className="grid gap-3 border-b border-neutral-200 py-4 sm:grid-cols-[22px_180px_minmax(0,1fr)_150px]"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${event.success ? "bg-[#176b5c]" : "bg-red-600"}`} /><div><p className="text-sm font-semibold">{actionLabel(event.action)}</p><p className="mt-1 text-xs text-neutral-500">{dateTime(event.created_at)}</p></div><div><p className="text-sm">{event.reason ?? (event.success ? "Action completed and handoff recorded." : "Action was blocked.")}</p>{event.new_status ? <p className="mt-1 text-xs text-neutral-500">Stage: {statusLabel(event.new_status)}</p> : null}</div><div><p className="text-sm font-medium">{event.actor_name}</p><p className="mt-1 text-xs text-neutral-500">{ROLE_LABELS[event.actor_role as Role] ?? plainLabel(event.actor_role)}</p></div></li>)}{!events.length ? <li><EmptyState icon={Clock3} title="No timeline events" detail={`Activity for ${order.order_no} will appear here.`} /></li> : null}</ol></section>;
}

function OrderDocuments({ order }: { order: Order }) {
  return <section className="max-w-4xl"><SectionHeader title="Dispatch documents" detail="Required documents must be verified before handover" /><div className="divide-y divide-neutral-200">{order.documents.map((document) => <div key={document.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px_140px]"><div><p className="text-sm font-semibold">{plainLabel(document.document_type)}</p><p className="mt-1 text-xs text-neutral-500">{document.required ? "Required for handover" : "Optional"}</p></div><p className="text-sm">{document.reference_number ?? "No reference"}</p><StatusBadge status={document.status} /></div>)}</div></section>;
}

function OrderExceptions({ order }: { order: Order }) {
  return <section className="max-w-4xl"><SectionHeader title="Recorded exceptions" detail="Exceptions remain separate from ordinary notifications" />{order.exceptions.length ? <div className="divide-y divide-neutral-200">{order.exceptions.map((exception) => <div key={exception.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_120px_140px]"><div><p className="text-sm font-semibold">{plainLabel(exception.code)}</p><p className="mt-1 text-sm text-neutral-600">{exception.message}</p>{exception.resolution_note ? <p className="mt-2 text-xs text-neutral-500">Resolution: {exception.resolution_note}</p> : null}</div><StatusBadge status={exception.severity} /><StatusBadge status={exception.status} /></div>)}</div> : <EmptyState icon={CircleCheck} title="No exceptions" detail="This order has no recorded operational exceptions." />}</section>;
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

type ProductSection = "OVERVIEW" | "VARIANTS" | "INVENTORY" | "QUALITY" | "ORDERS" | "ACTIVITY";

function ProductsView({ workspace, canAdd, onNew }: { workspace: Workspace; canAdd: boolean; onNew: () => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [stock, setStock] = useState("ALL");
  const [active, setActive] = useState("ACTIVE");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const selected = workspace.products.find((product) => product.id === selectedProductId) ?? null;
  const categories = [...new Set(workspace.products.map((product) => product.category))].sort();
  const filtered = workspace.products.filter((product) => {
    const haystack = `${productFamily(product)} ${productVariant(product)} ${product.sku} ${product.name} ${categoryLabel(product.category)}`.toLowerCase();
    const stockMatches = stock === "ALL"
      || (stock === "AVAILABLE" && product.availableStock >= product.minimum_stock_level)
      || (stock === "LOW" && product.availableStock < product.minimum_stock_level)
      || (stock === "ATTENTION" && product.pendingStock + product.reworkStock + product.blockedStock + product.damagedStock > 0);
    return (!search || haystack.includes(search.toLowerCase()))
      && (category === "ALL" || product.category === category)
      && (active === "ALL" || product.active === (active === "ACTIVE"))
      && stockMatches;
  });

  if (selected) return <ProductDetail workspace={workspace} product={selected} onBack={() => setSelectedProductId(null)} />;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
        <div><h2 className="text-base font-semibold">Product families and SKU variants</h2><p className="mt-1 text-sm text-neutral-500">Readable product identity leads; SKU remains the internal reference</p></div>
        {canAdd ? <PrimaryButton onClick={onNew}><Plus className="h-4 w-4" />New SKU</PrimaryButton> : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_220px_190px_170px]">
        <label className="relative"><span className="sr-only">Search products</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, variant or SKU" className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm" /></label>
        <FilterSelect label="Category" value={category} onChange={setCategory} options={categories.map((value) => ({ value, label: categoryLabel(value) }))} allLabel="All categories" />
        <FilterSelect label="Stock state" value={stock} onChange={setStock} options={[{ value: "AVAILABLE", label: "Available" }, { value: "LOW", label: "Low stock" }, { value: "ATTENTION", label: "Needs attention" }]} allLabel="All stock states" />
        <FilterSelect label="Product state" value={active} onChange={setActive} options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }]} allLabel="All products" />
      </div>

      <div className="mt-5 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="text-xs text-neutral-500"><tr className="border-b border-neutral-200"><th className="px-2 py-3 font-medium">Product and variant</th><th className="px-2 py-3 font-medium">SKU</th><th className="px-2 py-3 font-medium">Unit</th><th className="px-2 py-3 text-right font-medium">Available</th><th className="px-2 py-3 text-right font-medium">Reserved</th><th className="px-2 py-3 font-medium">Quality state</th><th className="px-2 py-3 font-medium">Location</th><th className="px-2 py-3"><span className="sr-only">Action</span></th></tr></thead>
          <tbody className="divide-y divide-neutral-200">{filtered.map((product) => {
            const batches = workspace.inventoryBatches.filter((batch) => batch.product_id === product.id);
            const locations = [...new Set(batches.map((batch) => batch.storage_location))].join(", ") || "Not stocked";
            return <tr key={product.id} className="hover:bg-white"><td className="px-2 py-4"><p className="font-semibold">{productFamily(product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(product)}</p></td><td className="px-2 py-4 font-mono text-xs text-neutral-600">{product.sku}</td><td className="px-2 py-4">{unitLabel(product.primary_unit)}</td><td className="px-2 py-4 text-right font-semibold text-emerald-700">{number(product.availableStock)}</td><td className="px-2 py-4 text-right">{number(product.reservedStock)}</td><td className="px-2 py-4"><StatusBadge status={stockState(product) === "Released" ? "RELEASED" : stockState(product) === "Low stock" ? "LOW_STOCK" : "REWORK_REQUIRED"} /></td><td className="max-w-[190px] truncate px-2 py-4 text-neutral-600">{locations}</td><td className="px-2 py-4 text-right"><SecondaryButton onClick={() => setSelectedProductId(product.id)}>Open</SecondaryButton></td></tr>;
          })}</tbody>
        </table>
      </div>

      <div className="mt-5 divide-y divide-neutral-200 md:hidden">{filtered.map((product) => <button key={product.id} type="button" onClick={() => setSelectedProductId(product.id)} className="block min-h-[112px] w-full py-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{productFamily(product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(product)}</p></div><StatusBadge status={stockState(product) === "Released" ? "RELEASED" : "LOW_STOCK"} /></div><div className="mt-3 flex items-center justify-between text-xs text-neutral-500"><span>{product.sku}</span><span><strong className="text-sm text-neutral-950">{number(product.availableStock)}</strong> {unitLabel(product.primary_unit, product.availableStock)} available</span></div></button>)}</div>
      {!filtered.length ? <EmptyState icon={Search} title="No matching products" detail="Change the search or product filters." /> : null}
    </section>
  );
}

function ProductDetail({ workspace, product, onBack }: { workspace: Workspace; product: Product; onBack: () => void }) {
  const [section, setSection] = useState<ProductSection>("OVERVIEW");
  const batches = workspace.inventoryBatches.filter((batch) => batch.product_id === product.id);
  const orders = workspace.orders.filter((order) => order.items.some((item) => item.product_id === product.id));
  const variants = workspace.products.filter((item) => item.category === product.category);
  const checks = orders.flatMap((order) => order.qualityChecks.filter((check) => String(check.product_id ?? check.order_item_id ?? "").includes(product.id) || order.items.some((item) => item.product_id === product.id)));
  const activity = workspace.auditEvents.filter((event) => event.entity_id === product.id || (event.reason ?? "").includes(product.sku));
  const sections: Array<{ value: ProductSection; label: string }> = [{ value: "OVERVIEW", label: "Overview" }, { value: "VARIANTS", label: "Variants" }, { value: "INVENTORY", label: "Inventory" }, { value: "QUALITY", label: "Quality" }, { value: "ORDERS", label: "Orders" }, { value: "ACTIVITY", label: "Activity" }];
  return <article><button type="button" onClick={onBack} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-neutral-600 hover:bg-white"><ArrowLeft className="h-4 w-4" />Back to products</button><header className="border-y border-neutral-200 bg-white px-5 py-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-[#176b5c]">{categoryLabel(product.category)}</p><h2 className="mt-2 text-2xl font-semibold">{productFamily(product)}</h2><p className="mt-1 text-sm text-neutral-600">{productVariant(product)}</p><p className="mt-2 font-mono text-xs text-neutral-500">{product.sku}</p></div><div className="flex gap-2"><StatusBadge status={product.active ? "ACTIVE" : "INACTIVE"} /><StatusBadge status={stockState(product) === "Released" ? "RELEASED" : "LOW_STOCK"} /></div></div><div className="mt-5 grid gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200 sm:grid-cols-4"><OrderHeaderFact label="Available" value={`${number(product.availableStock)} ${unitLabel(product.primary_unit, product.availableStock)}`} detail={`${number(product.releasedStock)} released`} /><OrderHeaderFact label="Reserved" value={`${number(product.reservedStock)} ${unitLabel(product.primary_unit, product.reservedStock)}`} detail="Approved orders" /><OrderHeaderFact label="Quality hold" value={`${number(product.pendingStock + product.reworkStock + product.blockedStock + product.damagedStock)}`} detail="Pending, rework, blocked or damaged" /><OrderHeaderFact label="Standard pack" value={product.packaging_specification ?? "Not configured"} detail={product.custom_branding_capable ? "Custom branding available" : "Standard product"} /></div></header><div className="mt-6 flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist" aria-label="Product sections">{sections.map((item) => <button key={item.value} type="button" role="tab" aria-selected={section === item.value} onClick={() => setSection(item.value)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${section === item.value ? "border-[#176b5c]" : "border-transparent text-neutral-500"}`}>{item.label}</button>)}</div><div className="py-6">{section === "OVERVIEW" ? <div className="grid gap-8 lg:grid-cols-2"><section><SectionHeader title="Variant identity" /><dl className="divide-y divide-neutral-200"><DetailRow label="Size" value={product.size ?? "Not set"} /><DetailRow label="Colour or finish" value={product.colour ?? "Not set"} /><DetailRow label="Design" value={product.design ?? "Not set"} /><DetailRow label="Page count" value={product.pages ? `${product.pages} pages` : "Not applicable"} /><DetailRow label="Unit" value={unitLabel(product.primary_unit)} /></dl></section><section><SectionHeader title="Material and packing" /><dl className="divide-y divide-neutral-200"><DetailRow label="Material" value={product.material ?? "Not set"} /><DetailRow label="Paper type" value={product.paper_type ?? "Not set"} /><DetailRow label="Standard pack" value={product.packaging_specification ?? "Not set"} /><DetailRow label="Custom or standard" value={product.custom_branding_capable ? "Standard SKU with custom-branding capability" : "Standard SKU"} /><DetailRow label="Description" value={product.description ?? "No description"} /></dl></section></div> : null}{section === "VARIANTS" ? <div className="divide-y divide-neutral-200">{variants.map((item) => <div key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_180px_140px]"><div><p className="text-sm font-semibold">{productVariant(item)}</p><p className="mt-1 font-mono text-xs text-neutral-500">{item.sku}</p></div><p className="text-sm">{number(item.availableStock)} {unitLabel(item.primary_unit, item.availableStock)} available</p><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></div>)}</div> : null}{section === "INVENTORY" ? <div className="divide-y divide-neutral-200">{batches.map((batch) => <BatchSummary key={batch.id} batch={batch} />)}{!batches.length ? <EmptyState icon={Boxes} title="No inventory batches" detail="Received batches for this SKU will appear here." /> : null}</div> : null}{section === "QUALITY" ? <div className="divide-y divide-neutral-200">{batches.map((batch) => <div key={batch.id} className="grid gap-3 py-4 sm:grid-cols-[160px_minmax(0,1fr)_140px]"><div><p className="text-sm font-semibold">{batch.batch_no}</p><p className="mt-1 text-xs text-neutral-500">{batch.storage_location}</p></div><p className="text-sm text-neutral-600">{batch.notes ?? "No quality notes"}</p><StatusBadge status={batch.qc_status} /></div>)}<p className="pt-4 text-xs text-neutral-500">{checks.length} related quality record{checks.length === 1 ? "" : "s"} in current orders.</p></div> : null}{section === "ORDERS" ? <div className="divide-y divide-neutral-200">{orders.map((order) => <div key={order.id} className="grid gap-3 py-4 sm:grid-cols-[150px_minmax(0,1fr)_160px]"><div><p className="text-sm font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">{shortDate(order.requested_dispatch_date)}</p></div><p className="text-sm">{order.customer.name}</p><StatusBadge status={order.fulfillment_status} /></div>)}</div> : null}{section === "ACTIVITY" ? <div className="divide-y divide-neutral-200">{activity.map((event) => <RecentWorkRow key={event.id} event={event} />)}{!activity.length ? <EmptyState icon={Clock3} title="No direct SKU activity" detail="Inventory and quality changes are available through batch records." /> : null}</div> : null}</div></article>;
}

function BatchSummary({ batch }: { batch: InventoryBatch }) {
  return <div className="grid gap-3 py-4 sm:grid-cols-[160px_minmax(0,1fr)_repeat(3,100px)]"><div><p className="text-sm font-semibold">{batch.batch_no}</p><p className="mt-1 text-xs text-neutral-500">{batch.storage_location} · {batch.shelf_reference ?? "No shelf"}</p></div><div><StatusBadge status={batch.qc_status} /><p className="mt-2 text-xs text-neutral-500">Produced {shortDate(batch.production_date)}</p></div><StockNumber label="Released" value={batch.released_quantity} /><StockNumber label="Reserved" value={batch.reserved_quantity} /><StockNumber label="Available" value={batch.available_quantity} /></div>;
}

function StockView({ products, batches, canEdit, onReceive, onInspect }: { products: Product[]; batches: InventoryBatch[]; canEdit: boolean; onReceive: () => void; onInspect: (id: string) => void }) {
  const [mode, setMode] = useState<"SKU" | "BATCH">("SKU");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("ALL");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const filteredProducts = products.filter((product) => {
    const haystack = `${productFamily(product)} ${productVariant(product)} ${product.sku}`.toLowerCase();
    const stateMatches = state === "ALL"
      || (state === "AVAILABLE" && product.availableStock >= product.minimum_stock_level)
      || (state === "PENDING" && product.pendingStock > 0)
      || (state === "REWORK" && product.reworkStock > 0)
      || (state === "BLOCKED" && product.blockedStock + product.damagedStock > 0);
    return (!search || haystack.includes(search.toLowerCase())) && stateMatches;
  });
  const filteredBatches = batches.filter((batch) => {
    const haystack = `${batch.batch_no} ${productFamily(batch.product)} ${productVariant(batch.product)} ${batch.product.sku} ${batch.storage_location} ${batch.shelf_reference ?? ""}`.toLowerCase();
    const stateMatches = state === "ALL"
      || (state === "AVAILABLE" && batch.available_quantity > 0)
      || (state === "PENDING" && batch.pending_quantity > 0)
      || (state === "REWORK" && batch.rework_quantity > 0)
      || (state === "BLOCKED" && batch.blocked_quantity + batch.damaged_quantity > 0);
    return (!search || haystack.includes(search.toLowerCase())) && stateMatches;
  });
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white"><div className="grid grid-cols-2 lg:grid-cols-5"><Metric label="Released" value={number(products.reduce((sum, product) => sum + product.releasedStock, 0))} detail="Passed quality and usable" tone="green" /><Metric label="Reserved" value={number(products.reduce((sum, product) => sum + product.reservedStock, 0))} detail="Held for approved orders" tone="blue" /><Metric label="Available" value={number(products.reduce((sum, product) => sum + product.availableStock, 0))} detail="Released minus reserved" tone="green" /><Metric label="Waiting for quality" value={number(products.reduce((sum, product) => sum + product.pendingStock, 0))} detail="Not available to orders" /><Metric label="Rework / blocked / damaged" value={number(products.reduce((sum, product) => sum + product.reworkStock + product.blockedStock + product.damagedStock, 0))} detail="Kept outside released stock" tone="red" /></div></section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4"><div><h2 className="text-base font-semibold">Finished-goods inventory</h2><p className="mt-1 text-sm text-neutral-500">Every quantity remains in one clearly named stock compartment</p></div>{canEdit ? <PrimaryButton onClick={onReceive}><Plus className="h-4 w-4" />Receive finished batch</PrimaryButton> : null}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(240px,1fr)_200px_auto]">
          <label className="relative"><span className="sr-only">Search inventory</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, batch or location" className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm" /></label>
          <FilterSelect label="Stock state" value={state} onChange={setState} options={[{ value: "AVAILABLE", label: "Available" }, { value: "PENDING", label: "Waiting for quality" }, { value: "REWORK", label: "Rework" }, { value: "BLOCKED", label: "Blocked or damaged" }]} allLabel="All stock states" />
          <div className="flex rounded-md bg-neutral-200/70 p-1" aria-label="Inventory view"><button type="button" onClick={() => setMode("SKU")} className={`min-h-10 rounded px-3 text-sm font-medium ${mode === "SKU" ? "bg-white shadow-sm" : "text-neutral-600"}`}>By SKU</button><button type="button" onClick={() => setMode("BATCH")} className={`min-h-10 rounded px-3 text-sm font-medium ${mode === "BATCH" ? "bg-white shadow-sm" : "text-neutral-600"}`}>By batch</button></div>
        </div>

        {mode === "SKU" ? <div className="mt-5 divide-y divide-neutral-200">{filteredProducts.map((product) => <div key={product.id} className="grid gap-4 py-5 lg:grid-cols-[minmax(240px,1.4fr)_repeat(6,minmax(72px,0.45fr))]"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{productFamily(product)}</p><StatusBadge status={stockState(product) === "Released" ? "RELEASED" : stockState(product) === "Low stock" ? "LOW_STOCK" : "REWORK_REQUIRED"} /></div><p className="mt-1 text-xs text-neutral-500">{productVariant(product)} · {product.sku}</p></div><StockNumber label="Physical" value={product.releasedStock + product.pendingStock + product.reworkStock + product.blockedStock + product.damagedStock} /><StockNumber label="Released" value={product.releasedStock} /><StockNumber label="Reserved" value={product.reservedStock} /><StockNumber label="Available" value={product.availableStock} /><StockNumber label="Rework" value={product.reworkStock} /><StockNumber label="Blocked / damaged" value={product.blockedStock + product.damagedStock} /></div>)}{!filteredProducts.length ? <EmptyState icon={Search} title="No matching SKUs" detail="Change the search or stock-state filter." /> : null}</div> : null}

        {mode === "BATCH" ? <div className="mt-5 divide-y divide-neutral-200">{filteredBatches.map((batch) => { const expanded = expandedBatchId === batch.id; return <div key={batch.id}><div className="grid items-center gap-4 py-4 sm:grid-cols-[160px_minmax(0,1.3fr)_130px_120px_170px_auto]"><div><p className="font-mono text-xs font-semibold">{batch.batch_no}</p><p className="mt-1 text-xs text-neutral-500">{shortDate(batch.production_date)}</p></div><div><p className="text-sm font-semibold">{productFamily(batch.product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(batch.product)} · {batch.product.sku}</p></div><StatusBadge status={batch.qc_status} /><div><p className="text-xs text-neutral-500">Available</p><p className="mt-1 text-sm font-semibold text-emerald-700">{number(batch.available_quantity)} {unitLabel(batch.unit, batch.available_quantity)}</p></div><div><p className="text-xs text-neutral-500">Location</p><p className="mt-1 text-sm font-medium">{batch.storage_location}</p><p className="mt-1 text-xs text-neutral-500">{batch.shelf_reference ?? "No shelf reference"}</p></div><div className="flex gap-2">{canEdit && batch.qc_status === "PENDING_QC" ? <PrimaryButton onClick={() => onInspect(batch.id)}>Inspect</PrimaryButton> : null}<IconButton label={expanded ? "Hide batch quantities" : "Show batch quantities"} onClick={() => setExpandedBatchId(expanded ? null : batch.id)}><ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} /></IconButton></div></div>{expanded ? <div className="mb-4 grid gap-px rounded-md border border-neutral-200 bg-neutral-200 sm:grid-cols-4 lg:grid-cols-8"><OrderHeaderFact label="Physical" value={number(batch.physical_quantity)} detail={unitLabel(batch.unit, batch.physical_quantity)} /><OrderHeaderFact label="Pending quality" value={number(batch.pending_quantity)} detail="Not released" /><OrderHeaderFact label="Released" value={number(batch.released_quantity)} detail="Passed quality" /><OrderHeaderFact label="Reserved" value={number(batch.reserved_quantity)} detail="Approved orders" /><OrderHeaderFact label="Available" value={number(batch.available_quantity)} detail="Released minus reserved" /><OrderHeaderFact label="Rework" value={number(batch.rework_quantity)} detail="Correction required" /><OrderHeaderFact label="Blocked" value={number(batch.blocked_quantity)} detail="Held from use" /><OrderHeaderFact label="Damaged" value={number(batch.damaged_quantity)} detail="Not usable" /></div> : null}</div>; })}{!filteredBatches.length ? <EmptyState icon={Search} title="No matching batches" detail="Change the search or stock-state filter." /> : null}</div> : null}
      </section>
    </div>
  );
}

function QualityView({ workspace, onOpenOrder, onDialog }: { workspace: Workspace; onOpenOrder: (id: string) => void; onDialog: (state: DialogState) => void }) {
  const [queue, setQueue] = useState<"CHECKS" | "REWORK" | "BATCHES">("CHECKS");
  const waiting = workspace.orders.filter((order) => order.fulfillment_status === "AWAITING_QC");
  const rework = workspace.orders.flatMap((order) => order.reworkRecords.filter((item) => item.status !== "COMPLETED").map((item) => ({ order, item })));
  const pendingBatches = workspace.inventoryBatches.filter((batch) => batch.qc_status === "PENDING_QC");
  const failedChecks = workspace.orders.flatMap((order) => order.qualityChecks).filter((check) => check.result !== "PASSED").length;
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white"><div className="grid grid-cols-2 lg:grid-cols-4"><Metric label="Orders waiting" value={waiting.length} detail="Picked and ready to inspect" tone={waiting.length ? "blue" : "green"} /><Metric label="Batches waiting" value={pendingBatches.length} detail="New finished goods" tone={pendingBatches.length ? "blue" : "green"} /><Metric label="Open rework" value={rework.length} detail="Correction still required" tone={rework.length ? "red" : "green"} /><Metric label="Failed checks" value={failedChecks} detail="Recorded in this demo dataset" tone={failedChecks ? "red" : "green"} /></div></section>
      <section>
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist" aria-label="Quality queues">
          {[{ value: "CHECKS", label: `Order checks (${waiting.length})` }, { value: "REWORK", label: `Rework (${rework.length})` }, { value: "BATCHES", label: `Batch checks (${pendingBatches.length})` }].map((item) => <button key={item.value} type="button" role="tab" aria-selected={queue === item.value} onClick={() => setQueue(item.value as typeof queue)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${queue === item.value ? "border-[#176b5c] text-neutral-950" : "border-transparent text-neutral-500"}`}>{item.label}</button>)}
        </div>
        {queue === "CHECKS" ? (waiting.length ? <div className="divide-y divide-neutral-200">{waiting.map((order) => <div key={order.id} className="grid gap-4 py-5 md:grid-cols-[150px_minmax(0,1fr)_150px_auto]"><div><p className="font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">Due {shortDate(order.requested_dispatch_date)}</p><div className="mt-2"><AgeingBadge ageing={ageingForDate(order.requested_dispatch_date)} /></div></div><div><p className="text-sm font-semibold">{order.customer.name}</p><p className="mt-1 text-sm text-neutral-600">{order.items.map((item) => `${number(item.approved_quantity)} ${unitLabel(item.unit, item.approved_quantity)} - ${productFamily(item.product)}`).join(", ")}</p></div><div><p className="text-xs text-neutral-500">Inspection</p><p className="mt-1 text-sm font-semibold">7-point quality check</p><p className="mt-1 text-xs text-neutral-500">Record pass, rework, block or damage</p></div><div className="flex gap-2"><SecondaryButton onClick={() => onOpenOrder(order.id)}>Open</SecondaryButton><PrimaryButton onClick={() => onDialog({ type: "quality", orderId: order.id })}>Start check</PrimaryButton></div></div>)}</div> : <EmptyState icon={CheckCircle2} title="No order checks waiting" detail="Picked orders will appear here." />) : null}
        {queue === "REWORK" ? (rework.length ? <div className="divide-y divide-neutral-200">{rework.map(({ order, item }) => <div key={item.id} className="grid gap-4 py-5 md:grid-cols-[150px_minmax(0,1fr)_150px_auto]"><div><p className="font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">Due {shortDate(item.due_date)}</p>{item.due_date ? <div className="mt-2"><AgeingBadge ageing={ageingForDate(item.due_date)} /></div> : null}</div><div><p className="text-sm font-semibold">{plainLabel(item.defect_type)}</p><p className="mt-1 text-sm text-neutral-600">{item.defect_description}</p></div><div><p className="text-xs text-neutral-500">Quantity</p><p className="mt-1 text-sm font-semibold">{number(item.rework_quantity)} {unitLabel(order.items.find((line) => line.id === item.order_item_id)?.unit ?? "PIECE", item.rework_quantity)}</p></div><PrimaryButton onClick={() => onDialog({ type: "rework", orderId: order.id, reworkId: item.id })}>Record correction</PrimaryButton></div>)}</div> : <EmptyState icon={CheckCircle2} title="No open rework" detail="Correction tasks appear after a quality decision." />) : null}
        {queue === "BATCHES" ? (pendingBatches.length ? <div className="divide-y divide-neutral-200">{pendingBatches.map((batch) => <div key={batch.id} className="grid gap-4 py-5 sm:grid-cols-[150px_minmax(0,1fr)_140px]"><div><p className="font-mono text-xs font-semibold">{batch.batch_no}</p><p className="mt-1 text-xs text-neutral-500">{shortDate(batch.production_date)}</p></div><div><p className="text-sm font-semibold">{productFamily(batch.product)}</p><p className="mt-1 text-xs text-neutral-500">{productVariant(batch.product)} - {batch.storage_location}</p></div><div><p className="text-xs text-neutral-500">Waiting quantity</p><p className="mt-1 text-sm font-semibold">{number(batch.pending_quantity)} {unitLabel(batch.unit, batch.pending_quantity)}</p></div></div>)}</div> : <EmptyState icon={CheckCircle2} title="No batches waiting" detail="Received finished batches will appear here." />) : null}
      </section>
    </div>
  );
}

function DispatchView({ workspace, onOpenOrder, onDialog }: { workspace: Workspace; onOpenOrder: (id: string) => void; onDialog: (state: DialogState) => void }) {
  const [queue, setQueue] = useState<"ALL" | "PICKING" | "PACKING" | "DOCUMENTS" | "HANDOVER">("ALL");
  const work = workspace.orders.filter((order) => ["APPROVED", "PICKING", "PACKING", "READY_FOR_HANDOVER"].includes(order.fulfillment_status) || order.exceptions.some((item) => item.status === "OPEN" && item.code === "MISSING_REQUIRED_DOCUMENT"));
  const queueMatches = (order: Order) => {
    if (queue === "ALL") return true;
    if (queue === "PICKING") return ["APPROVED", "PICKING"].includes(order.fulfillment_status);
    if (queue === "PACKING") return order.fulfillment_status === "PACKING";
    if (queue === "DOCUMENTS") return order.documents.some((document) => document.required && document.status !== "VERIFIED");
    return order.fulfillment_status === "READY_FOR_HANDOVER";
  };
  const visible = work.filter(queueMatches);
  const counts = {
    PICKING: work.filter((order) => ["APPROVED", "PICKING"].includes(order.fulfillment_status)).length,
    PACKING: work.filter((order) => order.fulfillment_status === "PACKING").length,
    DOCUMENTS: work.filter((order) => order.documents.some((document) => document.required && document.status !== "VERIFIED")).length,
    HANDOVER: work.filter((order) => order.fulfillment_status === "READY_FOR_HANDOVER").length,
  };
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white"><div className="grid grid-cols-2 lg:grid-cols-4"><Metric label="Picking" value={counts.PICKING} detail="Approved or in progress" tone={counts.PICKING ? "blue" : "green"} /><Metric label="Packing" value={counts.PACKING} detail="Quality passed" tone={counts.PACKING ? "blue" : "green"} /><Metric label="Documents missing" value={counts.DOCUMENTS} detail="Must clear before handover" tone={counts.DOCUMENTS ? "red" : "green"} /><Metric label="Ready to hand over" value={counts.HANDOVER} detail="Packed and ready" tone={counts.HANDOVER ? "green" : "blue"} /></div></section>
      <section>
        <SectionHeader title="Fulfilment queue" detail="One next action per order, from picking through handover" />
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist" aria-label="Fulfilment queues">{[{ value: "ALL", label: `All (${work.length})` }, { value: "PICKING", label: `Picking (${counts.PICKING})` }, { value: "PACKING", label: `Packing (${counts.PACKING})` }, { value: "DOCUMENTS", label: `Documents (${counts.DOCUMENTS})` }, { value: "HANDOVER", label: `Handover (${counts.HANDOVER})` }].map((item) => <button key={item.value} type="button" role="tab" aria-selected={queue === item.value} onClick={() => setQueue(item.value as typeof queue)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${queue === item.value ? "border-[#176b5c] text-neutral-950" : "border-transparent text-neutral-500"}`}>{item.label}</button>)}</div>
        {visible.length ? <div className="divide-y divide-neutral-200">{visible.map((order) => {
          const missingDocuments = order.documents.filter((document) => document.required && document.status !== "VERIFIED");
          return <div key={order.id} className="grid items-center gap-4 py-5 lg:grid-cols-[150px_minmax(220px,1.2fr)_170px_180px_auto]"><div><p className="font-semibold">{order.order_no}</p><p className="mt-1 text-xs text-neutral-500">Due {shortDate(order.requested_dispatch_date)}</p><div className="mt-2"><AgeingBadge ageing={ageingForDate(order.requested_dispatch_date)} /></div></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{order.customer.name}</p><p className="mt-1 text-sm text-neutral-600">{order.items.map((item) => `${number(item.approved_quantity || item.requested_quantity)} ${unitLabel(item.unit, item.approved_quantity || item.requested_quantity)} - ${productFamily(item.product)}`).join(", ")}</p></div><div><p className="text-xs text-neutral-500">Current stage</p><div className="mt-2"><StatusBadge status={order.fulfillment_status} /></div></div><div><p className="text-xs text-neutral-500">Documents</p><p className={`mt-1 text-sm font-semibold ${missingDocuments.length ? "text-red-700" : "text-emerald-700"}`}>{missingDocuments.length ? `${missingDocuments.length} required document${missingDocuments.length === 1 ? "" : "s"} missing` : "Required documents ready"}</p></div><div className="flex flex-wrap justify-end gap-2"><SecondaryButton onClick={() => onOpenOrder(order.id)}>Open</SecondaryButton>{order.fulfillment_status === "PACKING" ? <PrimaryButton onClick={() => onDialog({ type: "packing", orderId: order.id })}>Record packing</PrimaryButton> : null}{order.fulfillment_status === "READY_FOR_HANDOVER" && missingDocuments.length ? <PrimaryButton onClick={() => onDialog({ type: "documents", orderId: order.id })}>Add documents</PrimaryButton> : null}{order.fulfillment_status === "READY_FOR_HANDOVER" && !missingDocuments.length ? <PrimaryButton onClick={() => onDialog({ type: "handover", orderId: order.id })}>Confirm handover</PrimaryButton> : null}</div></div>;
        })}</div> : <EmptyState icon={PackageCheck} title="This queue is clear" detail="Orders move here after the previous team completes its work." />}
      </section>
    </div>
  );
}

function IssuesView({ workspace, onOpenOrder, onResolve }: { workspace: Workspace; onOpenOrder: (id: string) => void; onResolve: (orderId: string, exceptionId: string) => void }) {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const [owner, setOwner] = useState("ALL");
  const [renderedAt] = useState(() => Date.now());
  const issues = workspace.exceptions.filter((item) => item.status === "OPEN");
  const issueOwner = (issue: OperationalException) => {
    if (issue.code === "MISSING_REQUIRED_DOCUMENT") return "PACKING_DISPATCH" as Role;
    if (issue.code.includes("QUALITY") || issue.code.includes("REWORK") || issue.code.includes("STOCK")) return "INVENTORY_QUALITY" as Role;
    return "OPERATIONS_SUPERVISOR" as Role;
  };
  const visible = issues.filter((issue) => {
    const order = workspace.orders.find((item) => item.id === issue.order_id);
    const haystack = `${issue.code} ${issue.message} ${order?.order_no ?? ""} ${order?.customer.name ?? ""}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (severity === "ALL" || issue.severity === severity)
      && (owner === "ALL" || issueOwner(issue) === owner);
  });
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-md border border-neutral-200 bg-white"><div className="grid grid-cols-2 lg:grid-cols-4"><Metric label="Open exceptions" value={issues.length} detail="Supervisor visibility" tone={issues.length ? "red" : "green"} /><Metric label="High priority" value={issues.filter((issue) => ["HIGH", "CRITICAL"].includes(issue.severity)).length} detail="Review first" tone="red" /><Metric label="Older than one day" value={issues.filter((issue) => renderedAt - new Date(issue.created_at).getTime() >= 86_400_000).length} detail="Ageing operational risk" tone="red" /><Metric label="Affected orders" value={new Set(issues.map((issue) => issue.order_id).filter(Boolean)).size} detail="May block fulfilment" tone="blue" /></div></section>
      <section>
        <SectionHeader title="Exception centre" detail="Every issue has an owner, age and recorded resolution" />
        <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_180px_220px]"><label className="relative"><span className="sr-only">Search exceptions</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer or issue" className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm" /></label><FilterSelect label="Priority" value={severity} onChange={setSeverity} options={[{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }, { value: "CRITICAL", label: "Critical" }]} allLabel="All priorities" /><FilterSelect label="Owner" value={owner} onChange={setOwner} options={(["INVENTORY_QUALITY", "PACKING_DISPATCH", "OPERATIONS_SUPERVISOR"] as Role[]).map((value) => ({ value, label: ROLE_LABELS[value] }))} allLabel="All owners" /></div>
        {visible.length ? <div className="mt-5 divide-y divide-neutral-200">{visible.map((issue) => {
          const order = workspace.orders.find((item) => item.id === issue.order_id);
          const assignedRole = issueOwner(issue);
          return <div key={issue.id} className="grid gap-4 py-5 lg:grid-cols-[155px_minmax(220px,1.4fr)_180px_130px_auto]"><div><p className="font-semibold">{order?.order_no ?? "General issue"}</p><p className="mt-1 text-xs text-neutral-500">Opened {dateTime(issue.created_at)}</p><p className="mt-1 text-xs font-medium text-neutral-700">Age {durationLabel(issue.created_at)}</p></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{plainLabel(issue.code)}</p><StatusBadge status={issue.severity} /></div><p className="mt-1 text-sm text-neutral-600">{issue.message}</p>{order ? <p className="mt-2 text-xs text-neutral-500">{order.customer.name} - {statusLabel(order.fulfillment_status)}</p> : null}</div><div><p className="text-xs text-neutral-500">Operational owner</p><p className="mt-1 text-sm font-semibold">{ROLE_LABELS[assignedRole]}</p><p className="mt-1 text-xs text-neutral-500">{workspace.team.find((profile) => profile.role === assignedRole && profile.active)?.full_name ?? "No active assignee"}</p></div><div><p className="text-xs text-neutral-500">Next step</p><p className="mt-1 text-sm font-semibold">Correct the issue, then record resolution</p></div><div className="flex flex-wrap justify-end gap-2">{order ? <SecondaryButton onClick={() => onOpenOrder(order.id)}>Open order</SecondaryButton> : null}{order ? <PrimaryButton onClick={() => onResolve(order.id, issue.id)}>Record resolution</PrimaryButton> : null}</div></div>;
        })}</div> : <EmptyState icon={CheckCircle2} title="No matching exceptions" detail="Change the filters or continue working from a clear queue." />}
      </section>
    </div>
  );
}

function ReportsView({ workspace }: { workspace: Workspace }) {
  const today = nepalToday();
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

function AdministrationView({ workspace, busy, onEdit, onReset }: { workspace: Workspace; busy: string | null; onEdit: (profileId: string) => void; onReset: () => Promise<void> }) {
  const [section, setSection] = useState<"ACCESS" | "SYSTEM">("ACCESS");
  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist" aria-label="Administration sections">
        <button type="button" role="tab" aria-selected={section === "ACCESS"} onClick={() => setSection("ACCESS")} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${section === "ACCESS" ? "border-[#176b5c] text-neutral-950" : "border-transparent text-neutral-500"}`}><Users className="h-4 w-4" />People and access</button>
        <button type="button" role="tab" aria-selected={section === "SYSTEM"} onClick={() => setSection("SYSTEM")} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${section === "SYSTEM" ? "border-[#176b5c] text-neutral-950" : "border-transparent text-neutral-500"}`}><Settings2 className="h-4 w-4" />System and demo data</button>
      </div>
      {section === "ACCESS" ? <TeamView team={workspace.team} onEdit={onEdit} /> : null}
      {section === "SYSTEM" ? <SystemView workspace={workspace} busy={busy} onReset={onReset} /> : null}
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
  const [dirty, setDirty] = useState(false);
  const order = "orderId" in dialog ? workspace.orders.find((item) => item.id === dialog.orderId) ?? null : null;
  const rework = dialog.type === "rework" ? order?.reworkRecords.find((item) => item.id === dialog.reworkId) ?? null : null;
  const title = { newOrder: "New order", newCustomer: "New customer", newProduct: "New product", receiveBatch: "Receive finished batch", inspectBatch: "Inspect batch", production: "Production update", quality: "Quality check", rework: "Finish rework", packing: "Finish packing", documents: "Check documents", handover: "Confirm handover", cancel: "Cancel order", resolve: "Resolve issue", team: "Edit team access" }[dialog.type];
  const attemptClose = () => {
    if (dirty && !window.confirm("You have unsaved changes. Close this form?")) return;
    onClose();
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-6">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-md bg-white shadow-2xl sm:rounded-md">
        <div className="sticky top-0 z-10 flex items-center border-b border-neutral-200 bg-white px-5 py-4"><div><h2 className="text-base font-semibold">{title}</h2>{order ? <p className="text-xs text-neutral-500">{order.order_no} - {order.customer.name}</p> : null}</div><button type="button" aria-label="Close" onClick={attemptClose} className="ml-auto grid h-9 w-9 place-items-center rounded-md hover:bg-neutral-100"><X className="h-5 w-5" /></button></div>
        <div className="p-5" onChange={() => setDirty(true)}>
          {dialog.type === "newOrder" ? <NewOrderForm workspace={workspace} busy={busy} onSubmit={(payload) => onRun("CREATE_ORDER", null, payload)} onCancel={attemptClose} /> : null}
          {dialog.type === "newCustomer" ? <SimpleForm busy={busy} onCancel={attemptClose} fields={[field("customerCode", "Customer code", "text", "CUS-006", true), field("name", "Customer name", "text", "", true), selectField("customerType", "Customer type", ["BUSINESS", "RETAIL", "INSTITUTION", "EXPORT"]), field("contactName", "Contact person"), field("phone", "Phone"), field("email", "Email", "email"), field("address", "Address")]} onSubmit={(payload) => onRun("CREATE_CUSTOMER", null, payload)} /> : null}
          {dialog.type === "newProduct" ? <GuidedForm busy={busy} onCancel={attemptClose} submitLabel="Add product" steps={[{ title: "Identity", detail: "Give the product a clear family name and unique internal SKU.", fields: [field("sku", "SKU", "text", "KHK-DIA-A6-NAT", true), field("name", "Internal product name", "text", "Handmade diary", true), selectField("category", "Product family", ["HANDCRAFTED_DIARY", "NOTEBOOK", "PAPER_BAG", "HANDMADE_PAPER_SHEET", "GIFT_BOX", "PACKAGING_BOX", "PAPER_FRAME", "DECORATIVE_PAPER_ITEM", "CUSTOM_PRODUCT", "OTHER"])] }, { title: "Variant", detail: "Capture the attributes workers need to identify the right item.", fields: [field("size", "Size", "text", "A6"), field("colour", "Colour or finish", "text", "Natural"), field("design", "Design", "text", "Plain"), field("pages", "Page count", "number", "120"), field("material", "Material", "text", "Handmade paper"), field("paperType", "Paper type", "text", "Recycled cotton blend")] }, { title: "Stock rules", detail: "Set how the item is counted and when it needs attention.", fields: [selectField("primaryUnit", "Count unit", ["PIECE", "SHEET", "PACK", "BUNDLE", "CARTON", "KG", "DOZEN"]), field("standardPackageQuantity", "Standard pack quantity", "number", "1", true), field("minimumStockLevel", "Minimum stock level", "number", "0", true), field("packagingSpecification", "Standard packing", "text", "Protective paper packaging")] }, { title: "Review", detail: "Add a short description so the floor team can recognise the SKU.", fields: [field("description", "Plain product description", "text", "Natural A6 handmade diary, 120 pages"), checkboxField("customBrandingCapable", "Can accept customer branding")] }]} onSubmit={(payload) => onRun("CREATE_PRODUCT", null, payload)} /> : null}
          {dialog.type === "receiveBatch" ? <GuidedForm busy={busy} onCancel={attemptClose} submitLabel="Receive batch" steps={[{ title: "Product", detail: "Choose the exact SKU and record the batch reference.", fields: [selectField("productId", "Product", workspace.products.map((product) => ({ value: product.id, label: `${productFamily(product)} - ${productVariant(product)} - ${product.sku}` }))), field("batchNo", "Batch number", "text", "BATCH-2026-001", true)] }, { title: "Quantity", detail: "Record the physical quantity received.", fields: [field("productionDate", "Production date", "date", "", true), field("quantity", "Quantity", "number", "", true), selectField("unit", "Unit", ["PIECE", "SHEET", "PACK", "BUNDLE", "CARTON", "KG", "DOZEN"])] }, { title: "Location", detail: "Tell the team where this batch is stored before quality release.", fields: [field("storageLocation", "Storage location", "text", "Finished Goods Room", true), field("shelfReference", "Shelf reference", "text", "A-01"), field("notes", "Notes")] }]} onSubmit={(payload) => onRun("RECEIVE_BATCH", null, payload)} /> : null}
          {dialog.type === "inspectBatch" ? <SimpleForm busy={busy} onCancel={attemptClose} hidden={{ batchId: dialog.batchId }} fields={[selectField("result", "Inspection result", ["RELEASED", "REWORK_REQUIRED", "BLOCKED", "DAMAGED"]), field("notes", "Inspection notes")]} onSubmit={(payload) => onRun("INSPECT_BATCH", null, payload)} /> : null}
          {dialog.type === "production" ? <GuidedForm busy={busy} onCancel={attemptClose} submitLabel="Save production" steps={[{ title: "Production", detail: "Record what was completed and when.", fields: [field("productionReference", "Production reference", "text", "PROD-2026-001", true), field("expectedCompletionDate", "Expected finish", "date", "", true), field("completedQuantity", "Completed quantity", "number", "0", true), field("completionNotes", "Notes")] }]} onSubmit={(payload) => onRun("RECORD_PRODUCTION", dialog.orderId, payload)} /> : null}
          {dialog.type === "quality" ? <GuidedForm busy={busy} onCancel={attemptClose} submitLabel="Save quality result" steps={[{ title: "Result", detail: "Choose the result for the full inspected quantity.", fields: [selectField("result", "Result", ["PASSED", "REWORK_REQUIRED", "BLOCKED", "DAMAGED"]), field("affectedQuantity", "Affected quantity", "number"), field("reworkDueDate", "Rework due date", "date")] }, { title: "Seven checks", detail: "Confirm the physical checks before saving the result.", fields: [checkboxField("qcPageCount", "Page count is correct"), checkboxField("qcDimensions", "Dimensions are correct"), checkboxField("qcBinding", "Binding is secure"), checkboxField("qcCover", "Cover is correct"), checkboxField("qcBranding", "Branding is correct"), checkboxField("qcPagesClean", "Pages are clean"), checkboxField("qcDamageFree", "No torn pages")] }, { title: "Notes", detail: "Describe the defect when the result is not passed.", fields: [field("defectType", "Defect type", "text", "Binding or paper defect"), field("defectDescription", "Defect details"), field("notes", "Notes")] }]} onSubmit={(payload) => onRun("RECORD_QC", dialog.orderId, { ...payload, checklist: qualityChecklist(payload) })} /> : null}
          {dialog.type === "rework" ? <GuidedForm busy={busy} onCancel={attemptClose} hidden={{ reworkId: dialog.reworkId }} submitLabel="Save reinspection" steps={[{ title: "Quantities", detail: `This task has ${number(rework?.rework_quantity ?? 0)} units. Split them between released, damaged and blocked stock.`, fields: [field("releasedQuantity", "Released quantity", "number", `${rework?.rework_quantity ?? 0}`, true), field("damagedQuantity", "Damaged quantity", "number", "0", true), field("blockedQuantity", "Blocked quantity", "number", "0", true)] }, { title: "Notes", detail: "Leave a clear handoff note for the supervisor.", fields: [field("completionNote", "Completion note", "text", "Corrected and checked again", true)] }]} onSubmit={(payload) => onRun("COMPLETE_REWORK", dialog.orderId, payload)} /> : null}
          {dialog.type === "packing" ? <GuidedForm busy={busy} onCancel={attemptClose} submitLabel="Save packing" steps={[{ title: "Packages", detail: "Count the packages and cartons made for this order.", fields: [field("packageCount", "Package count", "number", "1", true), field("cartonCount", "Carton count", "number", "0"), field("bundleCount", "Bundle count", "number", "0"), field("quantityPerPackage", "Quantity per package", "number")] }, { title: "Protection", detail: "Record how the order was protected for delivery.", fields: [field("packagingType", "Packing type", "text", "Protective paper packaging", true), field("totalShipmentWeightKg", "Shipment weight (kg)", "number"), checkboxField("moistureProtection", "Moisture protection"), checkboxField("fragile", "Fragile"), field("customPackagingInstructions", "Special packing notes"), field("notes", "Packing notes")] }]} onSubmit={(payload) => onRun("COMPLETE_PACKING", dialog.orderId, { ...payload, items: order?.items.map((item) => ({ orderItemId: item.id, packedQuantity: item.approved_quantity })) ?? [] })} /> : null}
          {dialog.type === "documents" && order ? <DocumentsForm order={order} busy={busy} onCancel={attemptClose} onSubmit={(payload) => onRun("VERIFY_DOCUMENTS", order.id, payload)} /> : null}
          {dialog.type === "handover" ? <HandoverForm order={order} userName={workspace.currentUser.full_name} busy={busy} onCancel={attemptClose} onSubmit={(payload) => onRun("CONFIRM_HANDOVER", dialog.orderId, payload)} /> : null}
          {dialog.type === "cancel" ? <SimpleForm busy={busy} onCancel={attemptClose} fields={[field("reason", "Cancellation reason", "text", "", true)]} danger onSubmit={(payload) => onRun("CANCEL_ORDER", dialog.orderId, payload)} /> : null}
          {dialog.type === "resolve" ? <SimpleForm busy={busy} onCancel={attemptClose} hidden={{ exceptionId: dialog.exceptionId }} fields={[field("resolutionNote", "Resolution note", "text", "", true)]} onSubmit={(payload) => onRun("RESOLVE_EXCEPTION", dialog.orderId, payload)} /> : null}
          {dialog.type === "team" ? <TeamForm profile={workspace.team.find((item) => item.id === dialog.profileId)!} busy={busy} onCancel={attemptClose} onSubmit={(payload) => onRun("UPDATE_PROFILE", null, payload)} /> : null}
        </div>
      </div>
    </div>
  );
}

type FieldOption = string | { value: string; label: string };
type FormField = { name: string; label: string; type: "text" | "email" | "number" | "date" | "select" | "checkbox"; placeholder?: string; required?: boolean; options?: FieldOption[] };
function qualityChecklist(payload: Record<string, unknown>) {
  return {
    pageCount: payload.qcPageCount === true,
    dimensions: payload.qcDimensions === true,
    binding: payload.qcBinding === true,
    coverFinish: payload.qcCover === true,
    branding: payload.qcBranding === true,
    pagesClean: payload.qcPagesClean === true,
    damageFree: payload.qcDamageFree === true,
  };
}

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

type GuidedStep = { title: string; detail: string; fields: FormField[] };

function GuidedForm({ steps, hidden = {}, busy, submitLabel = "Save", onCancel, onSubmit }: { steps: GuidedStep[]; hidden?: Record<string, unknown>; busy: string | null; submitLabel?: string; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const current = steps[step];
  const advance = () => {
    if (!formRef.current) return;
    const controls = Array.from(formRef.current.querySelectorAll(`[data-form-step="${step}"] input, [data-form-step="${step}"] select`)) as HTMLInputElement[];
    if (!controls.every((control) => control.checkValidity())) {
      controls.find((control) => !control.checkValidity())?.reportValidity();
      return;
    }
    setStep((value) => Math.min(value + 1, steps.length - 1));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < steps.length - 1) { advance(); return; }
    await onSubmit(payloadFromForm(event.currentTarget, hidden));
  };
  return (
    <form ref={formRef} onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="flex items-start gap-2" aria-label="Form progress">{steps.map((item, index) => <div key={item.title} className="min-w-0 flex-1"><div className={`h-1 rounded-full ${index <= step ? "bg-[#176b5c]" : "bg-neutral-200"}`} /><p className={`mt-2 truncate text-xs font-semibold ${index === step ? "text-neutral-950" : "text-neutral-500"}`}>{index + 1}. {item.title}</p></div>)}</div>
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3"><p className="text-sm font-semibold">{current.title}</p><p className="mt-1 text-xs text-neutral-600">{current.detail}</p></div>
      {steps.map((item, index) => <section key={item.title} data-form-step={index} className={step === index ? "grid gap-4 sm:grid-cols-2" : "hidden"} aria-hidden={step !== index}>{item.fields.map((fieldItem) => <FormControl key={fieldItem.name} field={fieldItem} />)}</section>)}
      <div className="flex items-center justify-between border-t border-neutral-200 pt-4"><SecondaryButton type="button" onClick={onCancel}>Cancel</SecondaryButton><div className="flex gap-2">{step > 0 ? <SecondaryButton type="button" onClick={() => setStep((value) => value - 1)}>Back</SecondaryButton> : null}{step < steps.length - 1 ? <PrimaryButton type="button" onClick={advance}>Next <ArrowRight className="h-4 w-4" /></PrimaryButton> : <PrimaryButton type="submit" disabled={!!busy}>{busy ? "Saving..." : submitLabel}</PrimaryButton>}</div></div>
    </form>
  );
}

function FormControl({ field: item }: { field: FormField }) {
  if (item.type === "checkbox") return <label className="flex min-h-10 items-center gap-3 rounded-md border border-neutral-200 px-3 text-sm font-medium"><input name={item.name} type="checkbox" className="h-4 w-4 accent-[#176b5c]" />{item.label}</label>;
  return <label className="block text-sm font-medium text-neutral-700"><span>{item.label}{item.required ? <span className="text-red-600"> *</span> : null}</span>{item.type === "select" ? <select name={item.name} required={item.required} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="">Choose</option>{item.options?.map((option) => { const value = typeof option === "string" ? option : option.value; const label = typeof option === "string" ? words(option) : option.label; return <option key={value} value={value}>{label}</option>; })}</select> : <input name={item.name} type={item.type} required={item.required} defaultValue={item.placeholder} step={item.type === "number" ? "any" : undefined} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm" />}</label>;
}

function NewOrderForm({ workspace, busy, onSubmit, onCancel }: { workspace: Workspace; busy: string | null; onSubmit: (payload: Record<string, unknown>) => Promise<boolean>; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState([{ key: crypto.randomUUID(), productId: "", quantity: "", unit: "PIECE" }]);
  const formRef = useRef<HTMLFormElement>(null);
  const steps = ["Customer", "Products", "Dispatch", "Details", "Review"];
  const canAdvance = () => {
    if (!formRef.current) return false;
    if (step === 1 && (!lines.length || lines.some((line) => !line.productId || Number(line.quantity) <= 0))) return false;
    const controls = Array.from(formRef.current.querySelectorAll(`[data-order-step="${step}"] input, [data-order-step="${step}"] select`)) as HTMLInputElement[];
    const invalid = controls.find((control) => !control.checkValidity());
    invalid?.reportValidity();
    return !invalid;
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < steps.length - 1) { if (canAdvance()) setStep((value) => value + 1); return; }
    const payload = payloadFromForm(event.currentTarget);
    payload.items = lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unit: line.unit })).filter((line) => line.productId && Number(line.quantity) > 0);
    await onSubmit(payload);
  };
  return (
    <form ref={formRef} onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="flex items-start gap-2" aria-label="New order progress">{steps.map((label, index) => <div key={label} className="min-w-0 flex-1"><div className={`h-1 rounded-full ${index <= step ? "bg-[#176b5c]" : "bg-neutral-200"}`} /><p className={`mt-2 truncate text-xs font-semibold ${index === step ? "text-neutral-950" : "text-neutral-500"}`}>{index + 1}. {label}</p></div>)}</div>
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3"><p className="text-sm font-semibold">{steps[step]}</p><p className="mt-1 text-xs text-neutral-600">{["Choose the customer and their reference.", "Add every product and quantity on this order.", "Set when the order is needed and how it will be fulfilled.", "Capture custom work and packing instructions.", "Check the summary before creating the order."][step]}</p></div>
      <section data-order-step="0" className={step === 0 ? "grid gap-4 sm:grid-cols-2" : "hidden"}><FormControl field={selectField("customerId", "Customer", workspace.customers.map((customer) => ({ value: customer.id, label: `${customer.customer_code} - ${customer.name}` })))} /><FormControl field={field("customerOrderReference", "Customer order reference", "text", "PO-2026-001")} /></section>
      <section data-order-step="1" className={step === 1 ? "space-y-3" : "hidden"}><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Order products</p><p className="mt-1 text-xs text-neutral-500">Product family and variant are shown together so the correct SKU is easy to choose.</p></div><SecondaryButton type="button" onClick={() => setLines((items) => [...items, { key: crypto.randomUUID(), productId: "", quantity: "", unit: "PIECE" }])}><Plus className="h-4 w-4" />Add product</SecondaryButton></div>{lines.map((line, index) => <div key={line.key} className="grid items-end gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-[minmax(0,1fr)_130px_120px_36px]"><label className="text-sm font-medium">Product<select name={`orderLineProduct${index}`} value={line.productId} required onChange={(event) => setLines((items) => items.map((item) => item.key === line.key ? { ...item, productId: event.target.value, unit: workspace.products.find((product) => product.id === event.target.value)?.primary_unit ?? item.unit } : item))} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"><option value="">Choose product and variant</option>{workspace.products.map((product) => <option key={product.id} value={product.id}>{productFamily(product)} - {productVariant(product)} - {product.sku}</option>)}</select></label><label className="text-sm font-medium">Quantity<input name={`orderLineQuantity${index}`} value={line.quantity} required type="number" min="0.001" step="any" onChange={(event) => setLines((items) => items.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item))} className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 px-3" /></label><label className="text-sm font-medium">Unit<input value={unitLabel(line.unit)} readOnly className="mt-1.5 h-10 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm" /></label><IconButton label={`Remove product ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((items) => items.filter((item) => item.key !== line.key))}><X className="h-4 w-4" /></IconButton></div>)}</section>
      <section data-order-step="2" className={step === 2 ? "grid gap-4 sm:grid-cols-2" : "hidden"}><FormControl field={field("requestedDispatchDate", "Required dispatch date", "date", "", true)} /><FormControl field={field("deliveryDeadline", "Delivery deadline", "date")} /><FormControl field={selectField("priority", "Priority", ["LOW", "NORMAL", "HIGH", "URGENT"])} /><FormControl field={selectField("fulfillmentSource", "Fulfilment source", ["FINISHED_STOCK", "PRODUCTION_REQUIRED"])} /><FormControl field={field("notes", "Order notes")} /></section>
      <section data-order-step="3" className={step === 3 ? "grid gap-4 sm:grid-cols-2" : "hidden"}><FormControl field={field("customizationSummary", "Custom details")} /><FormControl field={field("specialPackagingInstructions", "Special packing")} /><FormControl field={field("requestedColour", "Requested colour")} /><FormControl field={field("requestedDimensions", "Requested dimensions")} /><FormControl field={field("printText", "Print or branding text")} /><FormControl field={checkboxField("isCustomOrder", "Custom order")} /><FormControl field={checkboxField("logoOrBrandingRequired", "Logo or branding needed")} /><FormControl field={checkboxField("customerSpecificationConfirmed", "Customer details confirmed")} /><FormControl field={checkboxField("sampleApprovalRequired", "Sample approval needed")} /></section>
      <section className={step === 4 ? "space-y-4" : "hidden"}><div className="grid gap-px overflow-hidden rounded-md border border-neutral-200 bg-neutral-200 sm:grid-cols-3"><OrderHeaderFact label="Customer" value="Chosen above" detail="Customer reference retained" /><OrderHeaderFact label="Products" value={`${lines.filter((line) => line.productId).length} line${lines.filter((line) => line.productId).length === 1 ? "" : "s"}`} detail="Quantities included" /><OrderHeaderFact label="Next step" value="Stock check" detail="The inventory team will receive this order" /></div><p className="text-sm text-neutral-600">Creating this order sends it to the inventory team for a stock check. The order can still be reviewed from the Orders page after creation.</p></section>
      <div className="flex items-center justify-between border-t border-neutral-200 pt-4"><SecondaryButton type="button" onClick={onCancel}>Cancel</SecondaryButton><div className="flex gap-2">{step > 0 ? <SecondaryButton type="button" onClick={() => setStep((value) => value - 1)}>Back</SecondaryButton> : null}{step < steps.length - 1 ? <PrimaryButton type="button" onClick={() => { if (canAdvance()) setStep((value) => value + 1); }}>Next <ArrowRight className="h-4 w-4" /></PrimaryButton> : <PrimaryButton type="submit" disabled={!!busy}>{busy ? "Creating..." : "Create order"}</PrimaryButton>}</div></div>
    </form>
  );
}

function HandoverForm({ order, userName, busy, onCancel, onSubmit }: { order: Order | null; userName: string; busy: string | null; onCancel: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [method, setMethod] = useState("THIRD_PARTY_COURIER");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = payloadFromForm(event.currentTarget);
    if (method === "CUSTOMER_PICKUP") payload.customerRepresentative = payload.receiverName;
    await onSubmit(payload);
  };
  const isCourier = ["THIRD_PARTY_COURIER", "HIRED_TRANSPORTER", "EXPORT_FREIGHT"].includes(method);

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">
          <span>Delivery method<span className="text-red-600"> *</span></span>
          <select name="deliveryMethod" value={method} onChange={(event) => setMethod(event.target.value)} required className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm">
            {["CUSTOMER_PICKUP", "COMPANY_VEHICLE", "THIRD_PARTY_COURIER", "HIRED_TRANSPORTER", "EXPORT_FREIGHT"].map((value) => <option key={value} value={value}>{words(value)}</option>)}
          </select>
        </label>
        <FormControl field={field("packageCount", "Package count", "number", "1", true)} />
        <FormControl field={field("handoverPerson", "Handover person", "text", userName, true)} />
        {isCourier ? <FormControl field={field("companyName", "Courier / company", "text", "", true)} /> : null}
        {isCourier ? <FormControl field={field("trackingNumber", "Tracking number", "text", "", true)} /> : null}
        {isCourier ? <FormControl field={field("consignmentNumber", "Consignment number")} /> : null}
        {isCourier ? <FormControl field={field("shipmentWeightKg", "Shipment weight (kg)", "number")} /> : null}
        {method === "CUSTOMER_PICKUP" ? <FormControl field={field("receiverName", "Customer representative", "text", "", true)} /> : null}
        {method === "CUSTOMER_PICKUP" ? <FormControl field={field("receiverPhone", "Contact number", "text", "", true)} /> : null}
        {method === "CUSTOMER_PICKUP" ? <FormControl field={field("acknowledgementReference", "Pickup acknowledgement", "text", "", true)} /> : null}
        {method === "COMPANY_VEHICLE" ? <FormControl field={field("vehicleNumber", "Vehicle number", "text", "", true)} /> : null}
        {method === "COMPANY_VEHICLE" ? <FormControl field={field("driverName", "Driver name", "text", "", true)} /> : null}
        {method === "COMPANY_VEHICLE" ? <FormControl field={field("driverPhone", "Driver phone")} /> : null}
        {(isCourier || method === "COMPANY_VEHICLE") ? <FormControl field={field("destination", "Destination", "text", order?.customer.address ?? "", method === "COMPANY_VEHICLE")} /> : null}
        <FormControl field={field("notes", "Notes")} />
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4"><SecondaryButton onClick={onCancel}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={!!busy}>{busy ? "Saving..." : "Confirm handover"}</PrimaryButton></div>
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
