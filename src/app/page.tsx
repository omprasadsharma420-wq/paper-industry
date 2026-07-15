"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Database,
  Factory,
  FileCheck2,
  FileText,
  Gauge,
  History,
  Home as HomeIcon,
  LockKeyhole,
  LogOut,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Truck,
  UserCheck,
  Warehouse,
  X,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import {
  createBackendDispatch,
  isBackendConfigured,
  loadBackendState,
  performBackendWorkflowAction,
  resetBackendState,
} from "@/lib/backend";
import { initialState } from "@/lib/demo-data";
import type {
  AppState,
  AppUser,
  ControlStatus,
  DispatchDocument,
  DispatchRequest,
  InventoryBatch,
  Product,
  UserRole,
  WorkflowStatus,
} from "@/lib/types";
import {
  actionLabels,
  availableQty,
  createDispatch,
  getAvailableActions,
  getWorkflowProgress,
  performWorkflowAction,
  releasedAvailableQty,
  roleLabels,
  statusLabels,
  type CreateDispatchInput,
  type WorkflowAction,
  type WorkflowActionInput,
} from "@/lib/workflow";

type ViewId =
  | "overview"
  | "dispatches"
  | "create"
  | "details"
  | "inventory"
  | "exceptions"
  | "reports"
  | "audit";

const navItems: Array<{
  id: ViewId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: UserRole[];
}> = [
  { id: "overview", label: "Home", icon: HomeIcon, roles: ["DISPATCH_CLERK", "WAREHOUSE_QUALITY", "DISPATCH_SUPERVISOR", "GATE_SECURITY", "MANAGER_ADMIN"] },
  { id: "dispatches", label: "Jobs", icon: ClipboardList, roles: ["DISPATCH_CLERK", "WAREHOUSE_QUALITY", "DISPATCH_SUPERVISOR", "GATE_SECURITY", "MANAGER_ADMIN"] },
  { id: "create", label: "New Job", icon: Plus, roles: ["DISPATCH_CLERK", "MANAGER_ADMIN"] },
  { id: "inventory", label: "Stock", icon: Warehouse, roles: ["DISPATCH_CLERK", "WAREHOUSE_QUALITY", "DISPATCH_SUPERVISOR", "MANAGER_ADMIN"] },
  { id: "exceptions", label: "Problems", icon: AlertTriangle, roles: ["DISPATCH_SUPERVISOR", "MANAGER_ADMIN"] },
  { id: "reports", label: "Summary", icon: BarChart3, roles: ["MANAGER_ADMIN"] },
  { id: "audit", label: "Activity", icon: History, roles: ["MANAGER_ADMIN"] },
];

const roleGuidance: Record<UserRole, { title: string; duty: string }> = {
  DISPATCH_CLERK: {
    title: "Dispatch Desk",
    duty: "Create jobs, send them for approval, and book trucks.",
  },
  WAREHOUSE_QUALITY: {
    title: "Store and Quality",
    duty: "Load released stock and record the final weight.",
  },
  DISPATCH_SUPERVISOR: {
    title: "Dispatch Control",
    duty: "Approve jobs, check papers, and handle dispatch problems.",
  },
  GATE_SECURITY: {
    title: "Factory Gate",
    duty: "Record truck arrival, allow exit, and confirm departure.",
  },
  MANAGER_ADMIN: {
    title: "Factory Overview",
    duty: "See all work, clear problems, and review performance.",
  },
};

const inputActions: WorkflowAction[] = [
  "ASSIGN_VEHICLE",
  "VERIFY_WEIGHT",
  "VERIFY_DOCUMENTS",
  "REJECT",
  "RESOLVE_EXCEPTION",
  "CANCEL",
];

const controlLabels: Record<ControlStatus, string> = {
  CLEAR: "Good",
  WARNING: "Check",
  BLOCKED: "Blocked",
};

const documentLabels: Record<DispatchDocument["type"], string> = {
  COMMERCIAL_INVOICE: "Invoice",
  DELIVERY_CHALLAN: "Delivery note",
  PACKING_LIST: "Packing list",
  GATE_PASS: "Gate pass",
};

const qualityLabels: Record<InventoryBatch["qualityStatus"], string> = {
  RELEASED: "Ready",
  PENDING_INSPECTION: "Check pending",
  BLOCKED: "Blocked",
};

const terminalStatuses: WorkflowStatus[] = ["DISPATCHED", "CANCELLED", "REJECTED"];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function controlClasses(status: ControlStatus): string {
  return clsx(
    "inline-flex min-h-6 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
    status === "CLEAR" && "bg-emerald-50 text-emerald-700",
    status === "WARNING" && "bg-amber-50 text-amber-800",
    status === "BLOCKED" && "bg-rose-50 text-rose-700",
  );
}

function statusClasses(status: WorkflowStatus): string {
  return clsx(
    "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-xs font-semibold",
    status === "DISPATCHED" && "bg-emerald-50 text-emerald-700",
    status === "REJECTED" && "bg-rose-50 text-rose-700",
    status === "CANCELLED" && "bg-zinc-100 text-zinc-700",
    status === "AWAITING_APPROVAL" && "bg-amber-50 text-amber-800",
    status.includes("AWAITING_") &&
      status !== "AWAITING_APPROVAL" &&
      "bg-sky-50 text-sky-700",
    ["APPROVED", "VEHICLE_ASSIGNED", "VEHICLE_ARRIVED", "LOADING", "CLEARED_FOR_EXIT"].includes(
      status,
    ) && "bg-blue-50 text-blue-700",
    status === "DRAFT" && "bg-zinc-100 text-zinc-700",
  );
}

function qualityClasses(status: InventoryBatch["qualityStatus"]): string {
  return clsx(
    "inline-flex min-h-6 items-center rounded-md px-2 py-1 text-xs font-semibold",
    status === "RELEASED" && "bg-emerald-50 text-emerald-700",
    status === "PENDING_INSPECTION" && "bg-amber-50 text-amber-800",
    status === "BLOCKED" && "bg-rose-50 text-rose-700",
  );
}

function unitLabel(product: Product): string {
  return product.unit === "KG" ? "KG" : "REAM";
}

function getLineSummary(dispatch: DispatchRequest): string {
  return dispatch.lines
    .map((line) => `${formatNumber(line.requestedQty)} ${line.unit} ${line.productName}`)
    .join(", ");
}

function getControlIcon(status: ControlStatus) {
  if (status === "CLEAR") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "WARNING") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <XCircle className="h-3.5 w-3.5" />;
}

function activityLabel(action: string): string {
  if (action === "CREATED") return "Job created";
  return actionLabels[action as WorkflowAction] ?? action.replaceAll("_", " ").toLowerCase();
}

function loadStoredState(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("paper-dispatch-demo-state");
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [state, setState] = useState<AppState>(initialState);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [selectedDispatchId, setSelectedDispatchId] = useState<string>(
    initialState.dispatches[0]?.id ?? "",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState(
    isBackendConfigured ? "Connecting to Supabase backend..." : "Demo system ready.",
  );
  const [hasLoaded, setHasLoaded] = useState(false);
  const [backendMode, setBackendMode] = useState<"loading" | "supabase" | "local">(
    isBackendConfigured ? "loading" : "local",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    dispatchId: string;
    action: WorkflowAction;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const stored = loadStoredState();

      if (isBackendConfigured) {
        try {
          const backendState = await loadBackendState();
          if (!cancelled && backendState) {
            setState(backendState);
            setSelectedDispatchId(backendState.dispatches[0]?.id ?? "");
            setBackendMode("supabase");
            setLastSynced(new Date());
            setToast("Live data is ready. Workflow checks are online.");
            setHasLoaded(true);
            return;
          }
        } catch (error) {
          console.error(error);
          if (!cancelled) {
            setToast("Supabase connection failed. Running local fallback demo.");
          }
        }
      }

      if (!cancelled) {
        if (stored) {
          setState(stored);
          setSelectedDispatchId(stored.dispatches[0]?.id ?? "");
        }
        setBackendMode("local");
        setHasLoaded(true);
      }
    }

    void loadState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded || backendMode !== "local") return;
    window.localStorage.setItem("paper-dispatch-demo-state", JSON.stringify(state));
  }, [backendMode, hasLoaded, state]);

  useEffect(() => {
    if (!hasLoaded || backendMode !== "supabase" || isBusy) return;

    let cancelled = false;
    async function refresh() {
      try {
        const backendState = await loadBackendState();
        if (!cancelled && backendState) {
          setState(backendState);
          setSelectedDispatchId((current) =>
            backendState.dispatches.some((dispatch) => dispatch.id === current)
              ? current
              : (backendState.dispatches[0]?.id ?? ""),
          );
          setLastSynced(new Date());
        }
      } catch (error) {
        console.error(error);
      }
    }

    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [backendMode, hasLoaded, isBusy]);

  const selectedDispatch = useMemo(
    () => state.dispatches.find((dispatch) => dispatch.id === selectedDispatchId) ?? state.dispatches[0],
    [selectedDispatchId, state.dispatches],
  );

  const filteredDispatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return state.dispatches;
    return state.dispatches.filter((dispatch) =>
      [
        dispatch.requestNo,
        dispatch.customerName,
        dispatch.destination,
        dispatch.status,
        dispatch.controlStatus,
        getLineSummary(dispatch),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [searchTerm, state.dispatches]);

  const activeExceptions = useMemo(
    () =>
      state.dispatches.flatMap((dispatch) =>
        dispatch.exceptions
          .filter((item) => !item.resolvedAt)
          .map((item) => ({ ...item, requestNo: dispatch.requestNo, customer: dispatch.customerName })),
      ),
    [state.dispatches],
  );

  const auditEntries = useMemo(
    () =>
      state.dispatches
        .flatMap((dispatch) =>
          dispatch.audit.map((entry) => ({
            ...entry,
            requestNo: dispatch.requestNo,
            customer: dispatch.customerName,
          })),
        )
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [state.dispatches],
  );

  const metrics = useMemo(() => {
    const total = state.dispatches.length;
    const dispatched = state.dispatches.filter((item) => item.status === "DISPATCHED").length;
    const blocked = state.dispatches.filter((item) => item.controlStatus === "BLOCKED").length;
    const awaiting = state.dispatches.filter((item) => item.status.includes("AWAITING")).length;
    const reservedKg = state.inventory
      .filter((batch) => batch.unit === "KG")
      .reduce((sum, batch) => sum + batch.reservedQty, 0);
    const reservedReam = state.inventory
      .filter((batch) => batch.unit === "REAM")
      .reduce((sum, batch) => sum + batch.reservedQty, 0);
    return { total, dispatched, blocked, awaiting, reservedKg, reservedReam };
  }, [state.dispatches, state.inventory]);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => currentUser && item.roles.includes(currentUser.role)),
    [currentUser],
  );

  function login(user: AppUser) {
    setCurrentUser(user);
    setActiveView("overview");
    setToast(`Signed in as ${roleLabels[user.role]}.`);
    window.scrollTo({ top: 0, left: 0 });
  }

  async function resetDemo() {
    if (isBusy) return;
    setIsBusy(true);

    try {
      if (backendMode === "supabase") {
        const result = await resetBackendState();
        if (result) {
          setState(result.state);
          setSelectedDispatchId(result.dispatchId);
          setToast(result.message);
          setLastSynced(new Date());
          return;
        }
      }

      setState(initialState);
      setSelectedDispatchId(initialState.dispatches[0]?.id ?? "");
      setToast("Demo data reset to the prepared scenarios.");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("paper-dispatch-demo-state");
      }
    } catch (error) {
      console.error(error);
      setToast(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshNow() {
    if (backendMode !== "supabase" || isBusy) return;
    setIsBusy(true);
    try {
      const backendState = await loadBackendState();
      if (backendState) {
        setState(backendState);
        setSelectedDispatchId((current) =>
          backendState.dispatches.some((dispatch) => dispatch.id === current)
            ? current
            : (backendState.dispatches[0]?.id ?? ""),
        );
        setLastSynced(new Date());
        setToast("Latest factory data loaded.");
      }
    } catch (error) {
      console.error(error);
      setToast(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function runAction(
    dispatchId: string,
    action: WorkflowAction,
    input: WorkflowActionInput = {},
  ) {
    if (!currentUser) return;
    if (isBusy) return;
    setIsBusy(true);

    try {
      const result =
        backendMode === "supabase"
          ? await performBackendWorkflowAction(state, dispatchId, currentUser, action, input)
          : performWorkflowAction(state, dispatchId, currentUser, action, input);

      if (!result) return;
      setState(result.state);
      setSelectedDispatchId(result.dispatchId);
      setToast(result.message);
      setLastSynced(new Date());
      setPendingAction(null);
    } catch (error) {
      console.error(error);
      setToast(error instanceof Error ? error.message : "Workflow action failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function requestAction(dispatchId: string, action: WorkflowAction) {
    if (inputActions.includes(action)) {
      setPendingAction({ dispatchId, action });
      return;
    }
    void runAction(dispatchId, action);
  }

  async function handleCreate(input: CreateDispatchInput) {
    if (!currentUser) return;
    if (isBusy) return;
    setIsBusy(true);

    try {
      const result =
        backendMode === "supabase"
          ? await createBackendDispatch(currentUser, input)
          : createDispatch(state, currentUser, input);

      if (!result) return;
      setState(result.state);
      setSelectedDispatchId(result.dispatchId);
      setActiveView("details");
      setToast(result.message);
      setLastSynced(new Date());
    } catch (error) {
      console.error(error);
      setToast(error instanceof Error ? error.message : "Create dispatch failed.");
    } finally {
      setIsBusy(false);
    }
  }

  if (!currentUser) {
    return <LoginScreen users={state.users} onLogin={login} />;
  }

  const pageTitle =
    activeView === "details"
      ? "Job Details"
      : (visibleNavItems.find((item) => item.id === activeView)?.label ?? "Home");

  return (
    <main className="min-h-[100dvh] bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="flex min-h-[100dvh]">
        <aside className="hidden w-[252px] shrink-0 border-r border-black/8 bg-[#fbfbfd]/95 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="px-5 pb-5 pt-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#1d1d1f] text-white shadow-sm">
                <Factory className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#1d1d1f]">Paper Dispatch</p>
                <p className="truncate text-xs text-[#6e6e73]">{roleGuidance[currentUser.role].title}</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main navigation">
            {visibleNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={clsx(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition active:scale-[0.98]",
                  activeView === item.id
                    ? "bg-[#e8f1fb] text-[#0066cc]"
                    : "text-[#515154] hover:bg-black/[0.045] hover:text-[#1d1d1f]",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="border-t border-black/8 p-4">
            <div className="flex items-center gap-3 px-1 py-1">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f1fb] text-sm font-semibold text-[#0066cc]">
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{currentUser.name}</p>
                <p className="truncate text-xs text-[#6e6e73]">{roleLabels[currentUser.role]}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-black/8 bg-[#f5f5f7]/88 px-4 py-3 backdrop-blur-xl lg:px-7">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-normal text-[#1d1d1f]">{pageTitle}</h1>
                <p className="mt-0.5 truncate text-sm text-[#6e6e73]">
                  {roleGuidance[currentUser.role].duty}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Navigate dashboard"
                  value={activeView}
                  onChange={(event) => setActiveView(event.target.value as ViewId)}
                  className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm shadow-sm lg:hidden"
                >
                  {visibleNavItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refreshNow}
                  disabled={isBusy || backendMode !== "supabase"}
                  title="Load latest data"
                  aria-label="Load latest data"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-black/10 bg-white text-[#515154] shadow-sm transition hover:bg-[#fbfbfd] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw className={clsx("h-4 w-4", isBusy && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={resetDemo}
                  disabled={isBusy}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#515154] shadow-sm transition hover:bg-[#fbfbfd] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset demo
                </button>
                <span
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-black/8 bg-white/70 px-3 text-sm font-medium text-[#515154]"
                  title={lastSynced ? `Updated ${lastSynced.toLocaleTimeString()}` : "Connecting"}
                >
                  <Database className="h-4 w-4" />
                  {backendMode === "supabase"
                    ? "Live"
                    : backendMode === "loading"
                      ? "Connecting"
                      : "Demo mode"}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentUser(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1d1d1f] px-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#343437] active:scale-[0.98]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
            <p className="mx-auto mt-3 max-w-[1500px] rounded-lg border border-[#b8d7f4] bg-[#eef6fd] px-3 py-2 text-sm text-[#174f7a]">
              {toast}
            </p>
          </header>

          <div className="mx-auto max-w-[1556px] px-4 py-5 lg:px-7 lg:py-7">
            {activeView === "overview" && (
              <Overview
                currentUser={currentUser}
                metrics={metrics}
                dispatches={state.dispatches}
                inventory={state.inventory}
                activeExceptions={activeExceptions.length}
                onSelect={(id) => {
                  setSelectedDispatchId(id);
                  setActiveView("details");
                }}
              />
            )}

            {activeView === "dispatches" && (
              <DispatchList
                dispatches={filteredDispatches}
                searchTerm={searchTerm}
                onSearch={setSearchTerm}
                selectedId={selectedDispatch?.id}
                currentUser={currentUser}
                onSelect={(id) => {
                  setSelectedDispatchId(id);
                  setActiveView("details");
                }}
                onAction={requestAction}
              />
            )}

            {activeView === "create" && (
              <CreateDispatch
                currentUser={currentUser}
                products={state.products}
                inventory={state.inventory}
                onCreate={handleCreate}
              />
            )}

            {activeView === "details" && selectedDispatch && (
              <DispatchDetails
                dispatch={selectedDispatch}
                inventory={state.inventory}
                currentUser={currentUser}
                onAction={(action) => requestAction(selectedDispatch.id, action)}
              />
            )}

            {activeView === "inventory" && (
              <InventoryView inventory={state.inventory} products={state.products} />
            )}

            {activeView === "exceptions" && (
              <ExceptionsView
                dispatches={state.dispatches}
                currentUser={currentUser}
                onSelect={(id) => {
                  setSelectedDispatchId(id);
                  setActiveView("details");
                }}
                onAction={requestAction}
              />
            )}

            {activeView === "reports" && (
              <Reports dispatches={state.dispatches} inventory={state.inventory} metrics={metrics} />
            )}

            {activeView === "audit" && <AuditTimeline entries={auditEntries} />}
          </div>
        </section>
      </div>
      {pendingAction && (
        <ActionDialog
          action={pendingAction.action}
          dispatch={state.dispatches.find((item) => item.id === pendingAction.dispatchId)!}
          isBusy={isBusy}
          onClose={() => setPendingAction(null)}
          onSubmit={(input) =>
            void runAction(pendingAction.dispatchId, pendingAction.action, input)
          }
        />
      )}
    </main>
  );
}

function LoginScreen({
  users,
  onLogin,
}: {
  users: AppUser[];
  onLogin: (user: AppUser) => void;
}) {
  return (
    <main className="min-h-[100dvh] bg-[#f5f5f7] px-4 py-6 text-[#1d1d1f] sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
        <div className="max-w-lg">
          <div className="mb-8 grid h-14 w-14 place-items-center rounded-2xl bg-[#1d1d1f] text-white shadow-[0_16px_40px_rgba(29,29,31,0.18)]">
            <Factory className="h-7 w-7" />
          </div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            Paper Dispatch
          </h1>
          <p className="mt-4 max-w-md text-lg leading-7 text-[#515154]">
            One live view from finished stock to factory gate.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-5 border-t border-black/10 pt-5 text-sm">
            <div>
              <p className="font-semibold">Live stock</p>
              <p className="mt-1 text-[#6e6e73]">Supabase</p>
            </div>
            <div>
              <p className="font-semibold">Rule checks</p>
              <p className="mt-1 text-[#6e6e73]">n8n</p>
            </div>
            <div>
              <p className="font-semibold">Role views</p>
              <p className="mt-1 text-[#6e6e73]">5 teams</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_24px_70px_rgba(29,29,31,0.10)]">
          <div className="border-b border-black/8 px-5 py-5 sm:px-6">
            <h2 className="text-xl font-semibold">Choose your work area</h2>
            <p className="mt-1 text-sm text-[#6e6e73]">Each person sees only the work they need.</p>
          </div>
          <div className="p-2">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => onLogin(user)}
                className="group flex min-h-20 w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-[#f5f5f7] active:scale-[0.99] sm:px-4"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eef6fd] text-[#0066cc]">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="font-semibold">{roleLabels[user.role]}</p>
                    <p className="text-sm text-[#6e6e73]">{user.name}</p>
                  </div>
                  <p className="mt-1 text-sm text-[#515154]">{roleGuidance[user.role].duty}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#86868b] transition group-hover:translate-x-0.5 group-hover:text-[#0066cc]" />
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return (
    <section className="min-h-32 rounded-xl border border-black/8 bg-white p-4 shadow-[0_10px_28px_rgba(29,29,31,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#6e6e73]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#1d1d1f]">{value}</p>
          <p className="mt-1 text-sm text-[#6e6e73]">{detail}</p>
        </div>
        <div
          className={clsx(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
            tone === "neutral" && "bg-[#eef6fd] text-[#0066cc]",
            tone === "green" && "bg-emerald-50 text-emerald-700",
            tone === "amber" && "bg-amber-50 text-amber-800",
            tone === "red" && "bg-rose-50 text-rose-700",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </section>
  );
}

function Overview({
  currentUser,
  metrics,
  dispatches,
  inventory,
  activeExceptions,
  onSelect,
}: {
  currentUser: AppUser;
  metrics: {
    total: number;
    dispatched: number;
    blocked: number;
    awaiting: number;
    reservedKg: number;
    reservedReam: number;
  };
  dispatches: DispatchRequest[];
  inventory: InventoryBatch[];
  activeExceptions: number;
  onSelect: (id: string) => void;
}) {
  const taskDispatches = dispatches
    .filter((dispatch) =>
      getAvailableActions(dispatch, currentUser.role).some((action) => action !== "CANCEL"),
    )
    .sort((a, b) => {
      const aScore = (a.controlStatus === "BLOCKED" ? 2 : 0) + (a.priority === "URGENT" ? 1 : 0);
      const bScore = (b.controlStatus === "BLOCKED" ? 2 : 0) + (b.priority === "URGENT" ? 1 : 0);
      return bScore - aScore;
    })
    .slice(0, 7);
  const activeJobs = dispatches.filter((item) => !terminalStatuses.includes(item.status)).length;
  const drafts = dispatches.filter((item) => item.status === "DRAFT").length;
  const trucksToBook = dispatches.filter((item) => item.status === "APPROVED").length;
  const loadingJobs = dispatches.filter((item) =>
    ["VEHICLE_ARRIVED", "LOADING"].includes(item.status),
  ).length;
  const weightChecks = dispatches.filter((item) => item.status === "AWAITING_WEIGHT_CHECK").length;
  const approvals = dispatches.filter((item) => item.status === "AWAITING_APPROVAL").length;
  const paperChecks = dispatches.filter((item) => item.status === "AWAITING_DOCUMENT_CHECK").length;
  const trucksExpected = dispatches.filter((item) => item.status === "VEHICLE_ASSIGNED").length;
  const gateJobs = dispatches.filter((item) =>
    ["AWAITING_GATE_CLEARANCE", "CLEARED_FOR_EXIT"].includes(item.status),
  ).length;
  const stockHolds = inventory.filter((batch) => batch.qualityStatus !== "RELEASED").length;
  const releasedKg = inventory
    .filter((batch) => batch.unit === "KG" && batch.qualityStatus === "RELEASED")
    .reduce((sum, batch) => sum + availableQty(batch), 0);
  const releasedReam = inventory
    .filter((batch) => batch.unit === "REAM" && batch.qualityStatus === "RELEASED")
    .reduce((sum, batch) => sum + availableQty(batch), 0);

  const roleMetrics: Record<
    UserRole,
    Array<{
      label: string;
      value: string;
      detail: string;
      icon: ComponentType<{ className?: string }>;
      tone?: "neutral" | "green" | "amber" | "red";
    }>
  > = {
    DISPATCH_CLERK: [
      { label: "My Work", value: String(taskDispatches.length), detail: "Jobs ready for you", icon: ClipboardCheck },
      { label: "Draft Jobs", value: String(drafts), detail: "Send for approval", icon: FileText },
      { label: "Book Truck", value: String(trucksToBook), detail: "Approved jobs", icon: Truck, tone: "amber" },
      { label: "Live Jobs", value: String(activeJobs), detail: "Moving through the factory", icon: Factory, tone: "green" },
    ],
    WAREHOUSE_QUALITY: [
      { label: "My Work", value: String(taskDispatches.length), detail: "Jobs ready for your team", icon: ClipboardCheck },
      { label: "Load Now", value: String(loadingJobs), detail: "Truck at gate or loading", icon: PackageCheck, tone: "green" },
      { label: "Check Weight", value: String(weightChecks), detail: "Loading is complete", icon: Gauge, tone: "amber" },
      { label: "Stock Hold", value: String(stockHolds), detail: "Not available for dispatch", icon: AlertTriangle, tone: stockHolds ? "red" : "green" },
    ],
    DISPATCH_SUPERVISOR: [
      { label: "My Work", value: String(taskDispatches.length), detail: "Jobs needing control", icon: ClipboardCheck },
      { label: "Approve", value: String(approvals), detail: "Stock check is complete", icon: ShieldCheck, tone: "amber" },
      { label: "Check Papers", value: String(paperChecks), detail: "Ready for document check", icon: FileCheck2 },
      { label: "Problems", value: String(activeExceptions), detail: "Open dispatch blocks", icon: AlertTriangle, tone: activeExceptions ? "red" : "green" },
    ],
    GATE_SECURITY: [
      { label: "My Work", value: String(taskDispatches.length), detail: "Gate actions ready", icon: ClipboardCheck },
      { label: "Trucks Due", value: String(trucksExpected), detail: "Booked for arrival", icon: Truck, tone: "amber" },
      { label: "Gate Check", value: String(gateJobs), detail: "Ready to clear or leave", icon: ShieldCheck },
      { label: "Left Today", value: String(metrics.dispatched), detail: "Exit confirmed", icon: CheckCircle2, tone: "green" },
    ],
    MANAGER_ADMIN: [
      { label: "Live Jobs", value: String(activeJobs), detail: `${metrics.total} jobs in the system`, icon: Factory },
      { label: "Needs Action", value: String(taskDispatches.length), detail: "Ready for a next step", icon: ClipboardCheck, tone: "amber" },
      { label: "Problems", value: String(activeExceptions), detail: "Open dispatch blocks", icon: AlertTriangle, tone: activeExceptions ? "red" : "green" },
      { label: "Completed", value: String(metrics.dispatched), detail: "Trucks left the factory", icon: CheckCircle2, tone: "green" },
    ],
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-semibold">Good day, {currentUser.name.split(" ")[0]}</h2>
        <p className="mt-1 text-sm text-[#6e6e73]">Here is the work ready for your role.</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roleMetrics[currentUser.role].map((metric) => (
          <MetricTile key={metric.label} {...metric} />
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
        <div className="flex flex-col gap-2 border-b border-black/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Your next jobs</h2>
            <p className="text-sm text-[#6e6e73]">Open a job to see details or do the next step.</p>
          </div>
          <span className="text-sm font-medium text-[#6e6e73]">{taskDispatches.length} ready</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-[#fbfbfd] text-xs font-medium text-[#6e6e73]">
              <tr>
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Next step</th>
                <th className="px-5 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {taskDispatches.map((dispatch) => {
                const nextAction = getAvailableActions(dispatch, currentUser.role).find(
                  (action) => action !== "CANCEL",
                );
                return (
                <tr key={dispatch.id} className="border-t border-black/6 transition hover:bg-[#fbfbfd]">
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{dispatch.requestNo}</p>
                    <p className="mt-0.5 text-xs text-[#6e6e73]">{getLineSummary(dispatch)}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{dispatch.customerName}</p>
                    <p className="text-xs text-[#6e6e73]">{dispatch.destination}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={statusClasses(dispatch.status)}>{statusLabels[dispatch.status]}</span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-[#0066cc]">
                    {nextAction ? actionLabels[nextAction] : "Open job"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => onSelect(dispatch.id)}
                      className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#0066cc] transition hover:bg-[#eef6fd] active:scale-[0.97]"
                    >
                      Open
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )})}
              {taskDispatches.length === 0 && (
                <tr className="border-t border-black/6">
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
                    <p className="mt-3 font-semibold">No work waiting</p>
                    <p className="mt-1 text-sm text-[#6e6e73]">Your role is up to date.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {currentUser.role === "MANAGER_ADMIN" && (
          <div className="grid gap-3 border-t border-black/8 bg-[#fbfbfd] px-5 py-4 text-sm sm:grid-cols-2">
            <p><span className="font-semibold">Released reels:</span> {formatNumber(releasedKg)} KG</p>
            <p><span className="font-semibold">Released sheets:</span> {formatNumber(releasedReam)} REAM</p>
          </div>
        )}
      </section>
    </div>
  );
}

function DispatchList({
  dispatches,
  searchTerm,
  onSearch,
  selectedId,
  currentUser,
  onSelect,
  onAction,
}: {
  dispatches: DispatchRequest[];
  searchTerm: string;
  onSearch: (value: string) => void;
  selectedId?: string;
  currentUser: AppUser;
  onSelect: (id: string) => void;
  onAction: (dispatchId: string, action: WorkflowAction) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
      <div className="flex flex-col gap-3 border-b border-black/8 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-base font-semibold">All jobs</h2>
          <p className="text-sm text-[#6e6e73]">Every change here appears across the dashboard.</p>
        </div>
        <div className="relative w-full xl:w-96">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#86868b]" />
          <input
            value={searchTerm}
            onChange={(event) => onSearch(event.target.value)}
            className="h-10 w-full rounded-lg border border-black/12 bg-[#f5f5f7] pl-9 pr-3 text-sm outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/15"
            placeholder="Search job, customer, stage"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-[#fbfbfd] text-xs font-medium text-[#6e6e73]">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Goods</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">Truck</th>
              <th className="px-4 py-3">Next step</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map((dispatch) => {
              const actions = getAvailableActions(dispatch, currentUser.role).slice(0, 2);
              return (
                <tr
                  key={dispatch.id}
                  className={clsx(
                    "border-t border-black/6 transition hover:bg-[#fbfbfd]",
                    selectedId === dispatch.id && "bg-[#eef6fd]",
                  )}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelect(dispatch.id)}
                      className="font-semibold text-zinc-950 underline-offset-4 hover:underline"
                    >
                      {dispatch.requestNo}
                    </button>
                    <p className="text-xs text-[#6e6e73]">{formatDate(dispatch.requestedDispatchDate)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{dispatch.customerName}</p>
                    <p className="text-xs text-[#6e6e73]">{dispatch.destination}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-[#515154]">{getLineSummary(dispatch)}</td>
                  <td className="px-4 py-3">
                    <span className={statusClasses(dispatch.status)}>{statusLabels[dispatch.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={controlClasses(dispatch.controlStatus)}>
                      {getControlIcon(dispatch.controlStatus)}
                      {controlLabels[dispatch.controlStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {dispatch.vehicle ? (
                      <div>
                        <p className="font-medium">{dispatch.vehicle.vehicleNo}</p>
                        <p className="text-xs text-[#6e6e73]">{dispatch.vehicle.transporter}</p>
                      </div>
                    ) : (
                      <span className="text-[#86868b]">Not booked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {actions.length === 0 ? (
                        <span className="text-xs text-[#86868b]">View only</span>
                      ) : (
                        actions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => onAction(dispatch.id, action)}
                            className={clsx(
                              "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white transition active:scale-[0.97]",
                              action === "CANCEL" || action === "REJECT"
                                ? "bg-rose-700 hover:bg-rose-800"
                                : "bg-[#0071e3] hover:bg-[#0068d1]",
                            )}
                          >
                            <Send className="h-3.5 w-3.5" />
                            {actionLabels[action]}
                          </button>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreateDispatch({
  currentUser,
  products,
  inventory,
  onCreate,
}: {
  currentUser: AppUser;
  products: Product[];
  inventory: InventoryBatch[];
  onCreate: (input: CreateDispatchInput) => void;
}) {
  const [form, setForm] = useState<CreateDispatchInput>({
    customerName: "New Distributor Pvt. Ltd.",
    customerType: "DISTRIBUTOR",
    destination: "Pokhara, Nepal",
    priority: "NORMAL",
    productCode: products[0]?.code ?? "",
    requestedQty: 1000,
    requestedDispatchDate: "2026-07-16",
  });
  const product = products.find((item) => item.code === form.productCode) ?? products[0];
  const allowed = ["DISPATCH_CLERK", "MANAGER_ADMIN"].includes(currentUser.role);
  const fieldClass =
    "h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15";

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)] sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Create a new job</h2>
          <p className="mt-1 text-sm text-[#6e6e73]">Enter the customer, goods, quantity, and date.</p>
        </div>

        {!allowed && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Only a dispatch worker or factory manager can create a job.
          </div>
        )}

        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!allowed) return;
            onCreate(form);
          }}
        >
          <label className="space-y-1">
            <span className="text-sm font-medium">Customer</span>
            <input
              value={form.customerName}
              onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Customer type</span>
            <select
              value={form.customerType}
              onChange={(event) =>
                setForm({ ...form, customerType: event.target.value as CreateDispatchInput["customerType"] })
              }
              className={fieldClass}
            >
              <option value="DISTRIBUTOR">Distributor</option>
              <option value="WHOLESALER">Wholesaler</option>
              <option value="COMMERCIAL">Commercial Customer</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Delivery city</span>
            <input
              value={form.destination}
              onChange={(event) => setForm({ ...form, destination: event.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Dispatch date</span>
            <input
              type="date"
              value={form.requestedDispatchDate}
              onChange={(event) => setForm({ ...form, requestedDispatchDate: event.target.value })}
              className={fieldClass}
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Goods</span>
            <select
              value={form.productCode}
              onChange={(event) => setForm({ ...form, productCode: event.target.value })}
              className={fieldClass}
            >
              {products.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.name} ({item.unit})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Quantity</span>
            <input
              type="number"
              min={1}
              value={form.requestedQty}
              onChange={(event) =>
                setForm({ ...form, requestedQty: Number(event.target.value || 0) })
              }
              className={fieldClass}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Urgency</span>
            <select
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as CreateDispatchInput["priority"] })
              }
              className={fieldClass}
            >
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!allowed}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0071e3] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0068d1] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              <Plus className="h-4 w-4" />
              Save Draft
            </button>
          </div>
        </form>
      </div>

      <aside className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
        <h3 className="text-sm font-semibold">Stock check</h3>
        {product && (
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label="Product" value={product.name} />
            <InfoRow label="Type" value={product.productType === "PAPER_REEL" ? "Paper Reel" : "Sheet Ream"} />
            <InfoRow label="Unit" value={unitLabel(product)} />
            <InfoRow label="Attributes" value={`${product.gsm} GSM, ${product.grade}, ${product.shade}`} />
            <InfoRow label="Size" value={product.size} />
            <InfoRow
              label="Ready stock"
              value={`${formatNumber(releasedAvailableQty(inventory, product.code))} ${product.unit}`}
            />
          </div>
        )}
      </aside>
    </section>
  );
}

function DispatchDetails({
  dispatch,
  inventory,
  currentUser,
  onAction,
}: {
  dispatch: DispatchRequest;
  inventory: InventoryBatch[];
  currentUser: AppUser;
  onAction: (action: WorkflowAction) => void;
}) {
  const actions = getAvailableActions(dispatch, currentUser.role);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{dispatch.requestNo}</h2>
              <span className={statusClasses(dispatch.status)}>{statusLabels[dispatch.status]}</span>
              <span className={controlClasses(dispatch.controlStatus)}>
                {getControlIcon(dispatch.controlStatus)}
                {controlLabels[dispatch.controlStatus]}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              {dispatch.customerName} - {dispatch.destination}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.length === 0 ? (
              <span className="rounded-lg bg-[#f5f5f7] px-3 py-2 text-sm text-[#6e6e73]">
                No step for you now
              </span>
            ) : (
              actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onAction(action)}
                  className={clsx(
                    "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white transition active:scale-[0.98]",
                    action === "RESOLVE_EXCEPTION"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : action === "CANCEL" || action === "REJECT"
                        ? "bg-rose-700 text-white hover:bg-rose-800"
                        : "bg-[#0071e3] hover:bg-[#0068d1]",
                  )}
                >
                  <Send className="h-4 w-4" />
                  {actionLabels[action]}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 h-2 rounded-full bg-zinc-100">
          <div
            className={clsx(
              "h-2 rounded-full",
              dispatch.controlStatus === "BLOCKED" ? "bg-rose-500" : "bg-emerald-600",
            )}
            style={{ width: `${getWorkflowProgress(dispatch.status)}%` }}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <section className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
          <div className="border-b border-black/8 px-5 py-4">
            <h3 className="text-base font-semibold">Goods</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#fbfbfd] text-xs font-medium text-[#6e6e73]">
                <tr>
                  <th className="px-4 py-3">Paper</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Ready stock</th>
                  <th className="px-4 py-3">Reserved lot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {dispatch.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{line.productName}</p>
                      <p className="text-xs text-zinc-500">{line.productCode}</p>
                    </td>
                    <td className="px-4 py-3">{line.productType === "PAPER_REEL" ? "Paper Reel" : "Sheet Ream"}</td>
                    <td className="px-4 py-3">
                      {formatNumber(line.requestedQty)} {line.unit}
                    </td>
                    <td className="px-4 py-3">
                      {formatNumber(releasedAvailableQty(inventory, line.productCode))} {line.unit}
                    </td>
                    <td className="px-4 py-3">
                      {line.reservedBatchIds.length > 0 ? (
                          <span className="font-medium">
                            {line.reservedBatchIds
                              .map((id) => inventory.find((batch) => batch.id === id)?.batchNo ?? id.slice(0, 8))
                              .join(", ")}
                          </span>
                      ) : (
                          <span className="text-[#86868b]">Not reserved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
          <h3 className="text-base font-semibold">Job facts</h3>
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label="Created by" value={dispatch.createdBy} />
            <InfoRow label="Created" value={formatDateTime(dispatch.createdAt)} />
            <InfoRow label="Dispatch date" value={formatDate(dispatch.requestedDispatchDate)} />
            <InfoRow label="Urgency" value={dispatch.priority === "URGENT" ? "Urgent" : "Normal"} />
            <InfoRow label="Approved by" value={dispatch.approvedBy ?? "Waiting"} />
            <InfoRow
              label="Weight"
              value={
                dispatch.expectedWeightKg
                  ? `${dispatch.actualWeightKg ? formatNumber(dispatch.actualWeightKg) : "Waiting"} / ${formatNumber(dispatch.expectedWeightKg)} KG`
                  : "Not needed for reams"
              }
            />
            <InfoRow label="Tolerance" value={`${dispatch.weightTolerancePercent}%`} />
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
          <h3 className="text-base font-semibold">Truck and gate</h3>
          {dispatch.vehicle ? (
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Truck number" value={dispatch.vehicle.vehicleNo} />
              <InfoRow label="Transport company" value={dispatch.vehicle.transporter} />
              <InfoRow label="Driver" value={dispatch.vehicle.driverName} />
              <InfoRow label="Phone" value={dispatch.vehicle.driverPhone} />
              <InfoRow label="Expected arrival" value={formatDateTime(dispatch.vehicle.expectedArrival)} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6e6e73]">The dispatch worker books a truck after approval.</p>
          )}
        </section>

        <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
          <h3 className="text-base font-semibold">Papers</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {dispatch.documents.map((doc) => (
              <div key={doc.type} className="rounded-lg border border-black/8 bg-[#fbfbfd] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{documentLabels[doc.type]}</p>
                  {doc.present && doc.verified ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : doc.present ? (
                    <FileCheck2 className="h-4 w-4 text-amber-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600" />
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {doc.present ? (doc.verified ? "Checked" : "Present, not checked") : "Missing"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
        <h3 className="text-base font-semibold">Problems and activity</h3>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            {dispatch.exceptions.length === 0 ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                No open problems on this job.
              </p>
            ) : (
              dispatch.exceptions.map((item) => (
                <div key={item.id} className="rounded-md border border-zinc-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={controlClasses(item.resolvedAt ? "WARNING" : item.controlStatus)}>
                      {item.resolvedAt ? "Fixed" : controlLabels[item.controlStatus]}
                    </span>
                    <p className="text-sm font-semibold">{item.code}</p>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">{item.message}</p>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            {dispatch.audit.slice().reverse().map((entry) => (
              <div key={entry.id} className="rounded-md border border-zinc-200 p-3">
                <p className="text-sm font-semibold">{activityLabel(entry.action)}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDateTime(entry.at)} by {entry.actor} ({roleLabels[entry.role]})
                </p>
                <p className="mt-2 text-sm text-zinc-700">{entry.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ActionDialog({
  action,
  dispatch,
  isBusy,
  onClose,
  onSubmit,
}: {
  action: WorkflowAction;
  dispatch: DispatchRequest;
  isBusy: boolean;
  onClose: () => void;
  onSubmit: (input: WorkflowActionInput) => void;
}) {
  const defaultArrival = new Date(
    dispatch.vehicle?.expectedArrival ?? `${dispatch.requestedDispatchDate}T09:00:00+05:45`,
  );
  const [vehicle, setVehicle] = useState({
    vehicleNo: dispatch.vehicle?.vehicleNo ?? "Bagmati 03-001 Kha 7821",
    transporter: dispatch.vehicle?.transporter ?? "Koshi Freight Service",
    driverName: dispatch.vehicle?.driverName ?? "Nabin Shrestha",
    driverPhone: dispatch.vehicle?.driverPhone ?? "9801234567",
    expectedArrival: new Date(defaultArrival.getTime() - defaultArrival.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  });
  const [actualWeightKg, setActualWeightKg] = useState(
    String(
      dispatch.actualWeightKg ??
        (dispatch.expectedWeightKg ? Math.round(dispatch.expectedWeightKg * 1.006) : 0),
    ),
  );
  const [documents, setDocuments] = useState<DispatchDocument[]>(
    dispatch.documents.map((document) => ({ ...document })),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const descriptions: Partial<Record<WorkflowAction, string>> = {
    ASSIGN_VEHICLE: "Enter the truck and driver details for this job.",
    VERIFY_WEIGHT: "Enter the final loaded weight from the scale.",
    VERIFY_DOCUMENTS: "Tick every paper that is present.",
    REJECT: "Write a short reason so the dispatch team can correct it.",
    RESOLVE_EXCEPTION: "Record what was corrected before clearing the problem.",
    CANCEL: "Write why this job is being cancelled.",
  };

  function submit() {
    if (action === "ASSIGN_VEHICLE") {
      if (
        !vehicle.vehicleNo.trim() ||
        !vehicle.transporter.trim() ||
        !vehicle.driverName.trim() ||
        !vehicle.driverPhone.trim() ||
        !vehicle.expectedArrival
      ) {
        setError("Complete all truck and driver fields.");
        return;
      }
      onSubmit({
        vehicle: {
          ...vehicle,
          expectedArrival: new Date(vehicle.expectedArrival).toISOString(),
        },
      });
      return;
    }

    if (action === "VERIFY_WEIGHT") {
      const weight = Number(actualWeightKg);
      if (!Number.isFinite(weight) || weight <= 0) {
        setError("Enter a valid weight above zero.");
        return;
      }
      onSubmit({ actualWeightKg: weight });
      return;
    }

    if (action === "VERIFY_DOCUMENTS") {
      onSubmit({ documents });
      return;
    }

    if (!note.trim()) {
      setError("Add a short note before you continue.");
      return;
    }
    onSubmit({ note: note.trim() });
  }

  const fieldClass =
    "h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-[#1d1d1f] outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15";
  const isDanger = action === "REJECT" || action === "CANCEL";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/40 bg-[#fbfbfd] shadow-[0_28px_90px_rgba(0,0,0,0.28)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/8 px-5 py-5 sm:px-6">
          <div>
            <p className="text-sm font-medium text-[#0066cc]">{dispatch.requestNo}</p>
            <h2 id="action-dialog-title" className="mt-1 text-xl font-semibold">
              {actionLabels[action]}
            </h2>
            <p className="mt-1 text-sm text-[#6e6e73]">{descriptions[action]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/5 text-[#515154] transition hover:bg-black/10 active:scale-[0.96]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {action === "ASSIGN_VEHICLE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Truck number</span>
                <input className={fieldClass} value={vehicle.vehicleNo} onChange={(event) => setVehicle({ ...vehicle, vehicleNo: event.target.value })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Transport company</span>
                <input className={fieldClass} value={vehicle.transporter} onChange={(event) => setVehicle({ ...vehicle, transporter: event.target.value })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Driver name</span>
                <input className={fieldClass} value={vehicle.driverName} onChange={(event) => setVehicle({ ...vehicle, driverName: event.target.value })} />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Driver phone</span>
                <input className={fieldClass} value={vehicle.driverPhone} onChange={(event) => setVehicle({ ...vehicle, driverPhone: event.target.value })} />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium">Expected arrival</span>
                <input type="datetime-local" className={fieldClass} value={vehicle.expectedArrival} onChange={(event) => setVehicle({ ...vehicle, expectedArrival: event.target.value })} />
              </label>
            </div>
          )}

          {action === "VERIFY_WEIGHT" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-[#f0f0f2] p-4">
                <p className="text-sm text-[#6e6e73]">Expected weight</p>
                <p className="mt-1 text-2xl font-semibold">{formatNumber(dispatch.expectedWeightKg ?? 0)} KG</p>
                <p className="mt-1 text-xs text-[#6e6e73]">Allowed change: {dispatch.weightTolerancePercent}%</p>
              </div>
              <label className="space-y-2">
                <span className="text-sm font-medium">Actual weight (KG)</span>
                <input type="number" min={1} step="0.01" className={fieldClass} value={actualWeightKg} onChange={(event) => setActualWeightKg(event.target.value)} />
                <span className="block text-xs text-[#6e6e73]">Use the weight shown on the factory scale.</span>
              </label>
            </div>
          )}

          {action === "VERIFY_DOCUMENTS" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {documents.map((document) => (
                <label key={document.type} className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 bg-white p-4 transition hover:border-[#0071e3]/40">
                  <input
                    type="checkbox"
                    checked={document.present}
                    onChange={(event) =>
                      setDocuments((items) =>
                        items.map((item) =>
                          item.type === document.type
                            ? { ...item, present: event.target.checked, verified: false }
                            : item,
                        ),
                      )
                    }
                    className="h-5 w-5 rounded border-black/20 accent-[#0071e3]"
                  />
                  <span className="font-medium">{documentLabels[document.type]}</span>
                </label>
              ))}
            </div>
          )}

          {["REJECT", "RESOLVE_EXCEPTION", "CANCEL"].includes(action) && (
            <label className="space-y-2">
              <span className="text-sm font-medium">Note</span>
              <textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full resize-none rounded-lg border border-black/15 bg-white px-3 py-3 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/15"
                placeholder="Write a clear, short reason"
              />
            </label>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/8 bg-white/70 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="h-10 rounded-lg px-4 text-sm font-semibold text-[#515154] transition hover:bg-black/5 active:scale-[0.98]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isBusy}
            className={clsx(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55",
              isDanger ? "bg-rose-700 hover:bg-rose-800" : "bg-[#0071e3] hover:bg-[#0068d1]",
            )}
          >
            {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isBusy ? "Saving" : actionLabels[action]}
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-900">{value}</span>
    </div>
  );
}

function InventoryView({
  inventory,
  products,
}: {
  inventory: InventoryBatch[];
  products: Product[];
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {products.map((product) => (
          <MetricTile
            key={product.code}
            label={product.code}
            value={`${formatNumber(releasedAvailableQty(inventory, product.code))} ${product.unit}`}
            detail={`${product.gsm} GSM, ${product.grade}, ${product.size}`}
            icon={product.productType === "PAPER_REEL" ? Truck : Boxes}
            tone={product.productType === "PAPER_REEL" ? "green" : "amber"}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-base font-semibold">Stock lots</h2>
          <p className="text-sm text-[#6e6e73]">Only stock marked Ready can be used.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[#fbfbfd] text-xs font-medium text-[#6e6e73]">
              <tr>
                <th className="px-4 py-3">Lot</th>
                <th className="px-4 py-3">Paper</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">On Hand</th>
                <th className="px-4 py-3">Reserved</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Quality check</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((batch) => (
                <tr key={batch.id} className="border-t border-black/6 transition hover:bg-[#fbfbfd]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{batch.batchNo}</p>
                    <p className="text-xs text-zinc-500">{formatDate(batch.producedOn)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{batch.productName}</p>
                    <p className="text-xs text-zinc-500">{batch.productCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    {batch.gsm} GSM, {batch.grade}, {batch.shade}, {batch.size}
                  </td>
                  <td className="px-4 py-3">
                    {formatNumber(batch.onHandQty)} {batch.unit}
                  </td>
                  <td className="px-4 py-3">
                    {formatNumber(batch.reservedQty)} {batch.unit}
                  </td>
                  <td className="px-4 py-3">
                    {formatNumber(availableQty(batch))} {batch.unit}
                  </td>
                  <td className="px-4 py-3">
                    <span className={qualityClasses(batch.qualityStatus)}>
                      {qualityLabels[batch.qualityStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{batch.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExceptionsView({
  dispatches,
  currentUser,
  onSelect,
  onAction,
}: {
  dispatches: DispatchRequest[];
  currentUser: AppUser;
  onSelect: (id: string) => void;
  onAction: (dispatchId: string, action: WorkflowAction) => void;
}) {
  const rows = dispatches.flatMap((dispatch) =>
    dispatch.exceptions.map((item) => ({ dispatch, exception: item })),
  );

  return (
    <section className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
      <div className="border-b border-black/8 px-5 py-4">
        <h2 className="text-base font-semibold">Dispatch problems</h2>
        <p className="text-sm text-[#6e6e73]">Blocked jobs cannot leave the factory until the problem is fixed.</p>
      </div>
      <div>
        {rows.map(({ dispatch, exception: item }) => {
          const canResolve =
            !item.resolvedAt && getAvailableActions(dispatch, currentUser.role).includes("RESOLVE_EXCEPTION");
          return (
            <div key={item.id} className="grid gap-3 border-t border-black/6 px-5 py-4 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
              <div>
                <button
                  type="button"
                  onClick={() => onSelect(dispatch.id)}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {dispatch.requestNo}
                </button>
                <p className="text-sm text-zinc-500">{dispatch.customerName}</p>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={controlClasses(item.resolvedAt ? "WARNING" : item.controlStatus)}>
                    {item.resolvedAt ? "Fixed" : controlLabels[item.controlStatus]}
                  </span>
                  <p className="text-sm font-semibold">{item.code}</p>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{item.message}</p>
              </div>
              <div className="flex items-center gap-2 xl:justify-end">
                {canResolve && (
                  <button
                    type="button"
                    onClick={() => onAction(dispatch.id, "RESOLVE_EXCEPTION")}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white transition hover:bg-amber-700 active:scale-[0.97]"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Fix problem
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(dispatch.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#0066cc] transition hover:bg-[#eef6fd] active:scale-[0.97]"
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-[#6e6e73]">No problems recorded.</p>
        )}
      </div>
    </section>
  );
}

function Reports({
  dispatches,
  inventory,
  metrics,
}: {
  dispatches: DispatchRequest[];
  inventory: InventoryBatch[];
  metrics: {
    total: number;
    dispatched: number;
    blocked: number;
    awaiting: number;
    reservedKg: number;
    reservedReam: number;
  };
}) {
  const byStatus = Object.entries(statusLabels)
    .map(([status, label]) => ({
      status: status as WorkflowStatus,
      label,
      count: dispatches.filter((dispatch) => dispatch.status === status).length,
    }))
    .filter((row) => row.count > 0);

  const blockedStock = inventory.filter((batch) => batch.qualityStatus !== "RELEASED");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Jobs completed"
          value={`${Math.round((metrics.dispatched / Math.max(metrics.total, 1)) * 100)}%`}
          detail={`${metrics.dispatched} of ${metrics.total} dispatches completed`}
          icon={Gauge}
          tone="green"
        />
        <MetricTile
          label="Blocked jobs"
          value={String(metrics.blocked)}
          detail="Cannot leave until fixed"
          icon={LockKeyhole}
          tone={metrics.blocked ? "red" : "green"}
        />
        <MetricTile
          label="Reserved reels"
          value={`${formatNumber(metrics.reservedKg)} KG`}
          detail="Held after approval, before exit"
          icon={Database}
        />
        <MetricTile
          label="Reserved sheets"
          value={`${formatNumber(metrics.reservedReam)} REAM`}
          detail="No KG/REAM conversion applied"
          icon={Boxes}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
          <h2 className="text-base font-semibold">Jobs by stage</h2>
          <div className="mt-4 space-y-3">
            {byStatus.map((row) => (
              <div key={row.status}>
                <div className="flex items-center justify-between text-sm">
                  <span>{row.label}</span>
                  <span className="font-semibold">{row.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-zinc-100">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{ width: `${(row.count / Math.max(dispatches.length, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
          <h2 className="text-base font-semibold">Rules in use</h2>
          <div className="mt-4 space-y-3 text-sm">
            <ScenarioRow label="Normal dispatch" status="Active" />
            <ScenarioRow label="Not enough ready stock" status="Active" />
            <ScenarioRow label="Quality-blocked stock" status="Active" />
            <ScenarioRow label="Weight outside limit" status="Active" />
            <ScenarioRow label="Missing papers" status="Active" />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
        <h2 className="text-base font-semibold">Stock not ready</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {blockedStock.map((batch) => (
            <div key={batch.id} className="rounded-md border border-zinc-200 p-3">
              <span className={qualityClasses(batch.qualityStatus)}>
                {qualityLabels[batch.qualityStatus]}
              </span>
              <p className="mt-3 text-sm font-semibold">{batch.batchNo}</p>
              <p className="text-sm text-zinc-600">{batch.productName}</p>
              <p className="mt-2 text-sm">
                {formatNumber(batch.onHandQty)} {batch.unit} at {batch.location}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScenarioRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 px-3 py-2">
      <span>{label}</span>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        {status}
      </span>
    </div>
  );
}

function AuditTimeline({
  entries,
}: {
  entries: Array<{
    id: string;
    dispatchId: string;
    at: string;
    actor: string;
    role: AppUser["role"];
    action: string;
    note: string;
    requestNo: string;
    customer: string;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(29,29,31,0.06)]">
      <div className="border-b border-black/8 px-5 py-4">
        <h2 className="text-base font-semibold">Factory activity</h2>
        <p className="text-sm text-[#6e6e73]">Who changed each job and when.</p>
      </div>
      <div>
        {entries.map((entry) => (
          <div key={entry.id} className="grid gap-3 border-t border-black/6 px-5 py-4 xl:grid-cols-[190px_220px_minmax(0,1fr)]">
            <div className="flex items-start gap-3">
              <div className="mt-1 grid h-8 w-8 place-items-center rounded-md bg-zinc-100 text-zinc-700">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{formatDateTime(entry.at)}</p>
                <p className="text-xs text-zinc-500">{roleLabels[entry.role]}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">{entry.requestNo}</p>
              <p className="text-sm text-zinc-500">{entry.customer}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{activityLabel(entry.action)}</p>
              <p className="mt-1 text-sm text-zinc-700">{entry.note}</p>
              <p className="mt-1 text-xs text-zinc-500">By {entry.actor}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
