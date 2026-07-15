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
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Truck,
  UserCheck,
  Warehouse,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { initialState } from "@/lib/demo-data";
import type {
  AppState,
  AppUser,
  ControlStatus,
  DispatchRequest,
  InventoryBatch,
  Product,
  WorkflowStatus,
} from "@/lib/types";
import {
  actionLabels,
  availableQty,
  createDispatch,
  getAvailableActions,
  getDispatchAgeHours,
  getWorkflowProgress,
  performWorkflowAction,
  releasedAvailableQty,
  roleLabels,
  statusLabels,
  type CreateDispatchInput,
  type WorkflowAction,
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
}> = [
  { id: "overview", label: "Overview", icon: HomeIcon },
  { id: "dispatches", label: "Dispatch List", icon: ClipboardList },
  { id: "create", label: "Create Dispatch", icon: Plus },
  { id: "details", label: "Dispatch Details", icon: FileText },
  { id: "inventory", label: "Inventory", icon: Warehouse },
  { id: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "audit", label: "Audit Timeline", icon: History },
];

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
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
    status === "CLEAR" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    status === "WARNING" && "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    status === "BLOCKED" && "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  );
}

function statusClasses(status: WorkflowStatus): string {
  return clsx(
    "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1",
    status === "DISPATCHED" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
    status === "REJECTED" && "bg-rose-50 text-rose-700 ring-rose-200",
    status === "CANCELLED" && "bg-zinc-100 text-zinc-700 ring-zinc-200",
    status === "AWAITING_APPROVAL" && "bg-amber-50 text-amber-800 ring-amber-200",
    status.includes("AWAITING_") &&
      status !== "AWAITING_APPROVAL" &&
      "bg-sky-50 text-sky-700 ring-sky-200",
    ["APPROVED", "VEHICLE_ASSIGNED", "VEHICLE_ARRIVED", "LOADING", "CLEARED_FOR_EXIT"].includes(
      status,
    ) && "bg-blue-50 text-blue-700 ring-blue-200",
    status === "DRAFT" && "bg-zinc-50 text-zinc-700 ring-zinc-200",
  );
}

function qualityClasses(status: InventoryBatch["qualityStatus"]): string {
  return clsx(
    "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1",
    status === "RELEASED" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
    status === "PENDING_INSPECTION" && "bg-amber-50 text-amber-800 ring-amber-200",
    status === "BLOCKED" && "bg-rose-50 text-rose-700 ring-rose-200",
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
  const [toast, setToast] = useState("Demo system ready.");
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = loadStoredState();
      if (stored) {
        setState(stored);
        setSelectedDispatchId(stored.dispatches[0]?.id ?? "");
      }
      setHasLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    window.localStorage.setItem("paper-dispatch-demo-state", JSON.stringify(state));
  }, [hasLoaded, state]);

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

  function login(user: AppUser) {
    setCurrentUser(user);
    setActiveView("overview");
    setToast(`Signed in as ${roleLabels[user.role]}.`);
    window.scrollTo({ top: 0, left: 0 });
  }

  function resetDemo() {
    setState(initialState);
    setSelectedDispatchId(initialState.dispatches[0]?.id ?? "");
    setToast("Demo data reset to the prepared scenarios.");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("paper-dispatch-demo-state");
    }
  }

  function runAction(dispatchId: string, action: WorkflowAction) {
    if (!currentUser) return;
    const result = performWorkflowAction(state, dispatchId, currentUser, action);
    setState(result.state);
    setSelectedDispatchId(result.dispatchId);
    setToast(result.message);
  }

  function handleCreate(input: CreateDispatchInput) {
    if (!currentUser) return;
    const result = createDispatch(state, currentUser, input);
    setState(result.state);
    setSelectedDispatchId(result.dispatchId);
    setActiveView("details");
    setToast(result.message);
  }

  if (!currentUser) {
    return <LoginScreen users={state.users} onLogin={login} />;
  }

  return (
    <main className="min-h-screen bg-[#f6f7f2] text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-zinc-200 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-700 text-white">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-950">FG Dispatch Control</p>
                <p className="text-xs text-zinc-500">Finished Goods Pilot</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={clsx(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  activeView === item.id
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="border-t border-zinc-200 p-4">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Signed in</p>
              <p className="mt-1 text-sm font-semibold">{currentUser.name}</p>
              <p className="text-xs text-zinc-500">{roleLabels[currentUser.role]}</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-7">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Paper manufacturing dispatch pilot
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-normal text-zinc-950">
                  Controlled Finished Goods Dispatch Tracking
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Navigate dashboard"
                  value={activeView}
                  onChange={(event) => setActiveView(event.target.value as ViewId)}
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm lg:hidden"
                >
                  {navItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={resetDemo}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentUser(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {toast}
            </p>
          </header>

          <div className="px-4 py-5 lg:px-7">
            {activeView === "overview" && (
              <Overview
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
                onAction={runAction}
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
                onAction={(action) => runAction(selectedDispatch.id, action)}
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
                onAction={runAction}
              />
            )}

            {activeView === "reports" && (
              <Reports dispatches={state.dispatches} inventory={state.inventory} metrics={metrics} />
            )}

            {activeView === "audit" && <AuditTimeline entries={auditEntries} />}
          </div>
        </section>
      </div>
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
    <main className="min-h-screen bg-[#f6f7f2] px-4 py-8 text-zinc-950">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center">
        <div className="max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-emerald-700 text-white">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Reference pilot
              </p>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                Controlled Finished Goods Dispatch Tracking
              </h1>
            </div>
          </div>
          <p className="text-base leading-7 text-zinc-700">
            Role-based demo for factory dispatch control: approval, released-stock reservation,
            vehicle movement, loading, weight verification, document checks, gate clearance, and
            audit logging.
          </p>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onLogin(user)}
              className="min-h-44 rounded-md border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-600 hover:shadow-md"
            >
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-zinc-950 text-white">
                <UserCheck className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-zinc-950">{user.name}</p>
              <p className="mt-1 text-sm text-zinc-600">{roleLabels[user.role]}</p>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {user.department}
              </p>
            </button>
          ))}
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
    <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
          <p className="mt-1 text-sm text-zinc-600">{detail}</p>
        </div>
        <div
          className={clsx(
            "grid h-10 w-10 shrink-0 place-items-center rounded-md",
            tone === "neutral" && "bg-zinc-100 text-zinc-700",
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
  metrics,
  dispatches,
  inventory,
  activeExceptions,
  onSelect,
}: {
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
  const liveDispatches = dispatches.filter((item) => !terminalStatuses.includes(item.status)).slice(0, 6);
  const releasedKg = inventory
    .filter((batch) => batch.unit === "KG" && batch.qualityStatus === "RELEASED")
    .reduce((sum, batch) => sum + availableQty(batch), 0);
  const releasedReam = inventory
    .filter((batch) => batch.unit === "REAM" && batch.qualityStatus === "RELEASED")
    .reduce((sum, batch) => sum + availableQty(batch), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Dispatches Today"
          value={String(metrics.total)}
          detail={`${metrics.dispatched} completed, ${metrics.awaiting} awaiting control`}
          icon={ClipboardCheck}
        />
        <MetricTile
          label="Active Blocks"
          value={String(activeExceptions)}
          detail={`${metrics.blocked} dispatch records need attention`}
          icon={AlertTriangle}
          tone={activeExceptions > 0 ? "red" : "green"}
        />
        <MetricTile
          label="Released Reel Stock"
          value={`${formatNumber(releasedKg)} KG`}
          detail={`${formatNumber(metrics.reservedKg)} KG currently reserved`}
          icon={PackageCheck}
          tone="green"
        />
        <MetricTile
          label="Released Sheet Stock"
          value={`${formatNumber(releasedReam)} REAM`}
          detail={`${formatNumber(metrics.reservedReam)} REAM currently reserved`}
          icon={Boxes}
          tone="amber"
        />
      </div>

      <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Live Dispatch Board</h2>
            <p className="text-sm text-zinc-600">Open items across approval, loading, checks, and gate control.</p>
          </div>
          <span className="text-sm font-medium text-zinc-500">Factory date: 15 Jul 2026</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Control</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {liveDispatches.map((dispatch) => (
                <tr key={dispatch.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium">{dispatch.requestNo}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{dispatch.customerName}</p>
                    <p className="text-xs text-zinc-500">{dispatch.destination}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusClasses(dispatch.status)}>{statusLabels[dispatch.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={controlClasses(dispatch.controlStatus)}>
                      {getControlIcon(dispatch.controlStatus)}
                      {dispatch.controlStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">{getDispatchAgeHours(dispatch)}h</td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-32 rounded-full bg-zinc-100">
                      <div
                        className="h-2 rounded-full bg-emerald-600"
                        style={{ width: `${getWorkflowProgress(dispatch.status)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelect(dispatch.id)}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50"
                    >
                      Open
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-base font-semibold">Dispatch List</h2>
          <p className="text-sm text-zinc-600">Search and act on dispatch requests by role.</p>
        </div>
        <div className="relative w-full xl:w-96">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearch(event.target.value)}
            className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-600"
            placeholder="Search request, customer, status..."
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Request</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Control</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Role Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {dispatches.map((dispatch) => {
              const actions = getAvailableActions(dispatch, currentUser.role).slice(0, 2);
              return (
                <tr
                  key={dispatch.id}
                  className={clsx("hover:bg-zinc-50", selectedId === dispatch.id && "bg-emerald-50/40")}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelect(dispatch.id)}
                      className="font-semibold text-zinc-950 underline-offset-4 hover:underline"
                    >
                      {dispatch.requestNo}
                    </button>
                    <p className="text-xs text-zinc-500">{formatDate(dispatch.requestedDispatchDate)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{dispatch.customerName}</p>
                    <p className="text-xs text-zinc-500">{dispatch.destination}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-zinc-700">{getLineSummary(dispatch)}</td>
                  <td className="px-4 py-3">
                    <span className={statusClasses(dispatch.status)}>{statusLabels[dispatch.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={controlClasses(dispatch.controlStatus)}>
                      {getControlIcon(dispatch.controlStatus)}
                      {dispatch.controlStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {dispatch.vehicle ? (
                      <div>
                        <p className="font-medium">{dispatch.vehicle.vehicleNo}</p>
                        <p className="text-xs text-zinc-500">{dispatch.vehicle.transporter}</p>
                      </div>
                    ) : (
                      <span className="text-zinc-400">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {actions.length === 0 ? (
                        <span className="text-xs text-zinc-400">No action for role</span>
                      ) : (
                        actions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => onAction(dispatch.id, action)}
                            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
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

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-5">
          <h2 className="text-base font-semibold">Create Dispatch</h2>
          <p className="text-sm text-zinc-600">
            Dispatch starts after customer order/request exists. Production and accounting are outside scope.
          </p>
        </div>

        {!allowed && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Current role can view this page, but only Dispatch Clerk or Manager/Admin can create a request.
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
            <span className="text-sm font-medium">Customer Name</span>
            <input
              value={form.customerName}
              onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Customer Type</span>
            <select
              value={form.customerType}
              onChange={(event) =>
                setForm({ ...form, customerType: event.target.value as CreateDispatchInput["customerType"] })
              }
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
            >
              <option value="DISTRIBUTOR">Distributor</option>
              <option value="WHOLESALER">Wholesaler</option>
              <option value="COMMERCIAL">Commercial Customer</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Destination</span>
            <input
              value={form.destination}
              onChange={(event) => setForm({ ...form, destination: event.target.value })}
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Requested Date</span>
            <input
              type="date"
              value={form.requestedDispatchDate}
              onChange={(event) => setForm({ ...form, requestedDispatchDate: event.target.value })}
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Product</span>
            <select
              value={form.productCode}
              onChange={(event) => setForm({ ...form, productCode: event.target.value })}
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
            >
              {products.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.name} ({item.unit})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Requested Quantity</span>
            <input
              type="number"
              min={1}
              value={form.requestedQty}
              onChange={(event) =>
                setForm({ ...form, requestedQty: Number(event.target.value || 0) })
              }
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Priority</span>
            <select
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as CreateDispatchInput["priority"] })
              }
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
            >
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!allowed}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              <Plus className="h-4 w-4" />
              Create Draft
            </button>
          </div>
        </form>
      </div>

      <aside className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold">Selected Product Control</h3>
        {product && (
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label="Product" value={product.name} />
            <InfoRow label="Type" value={product.productType === "PAPER_REEL" ? "Paper Reel" : "Sheet Ream"} />
            <InfoRow label="Unit" value={unitLabel(product)} />
            <InfoRow label="Attributes" value={`${product.gsm} GSM, ${product.grade}, ${product.shade}`} />
            <InfoRow label="Size" value={product.size} />
            <InfoRow
              label="Released Available"
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
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{dispatch.requestNo}</h2>
              <span className={statusClasses(dispatch.status)}>{statusLabels[dispatch.status]}</span>
              <span className={controlClasses(dispatch.controlStatus)}>
                {getControlIcon(dispatch.controlStatus)}
                {dispatch.controlStatus}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              {dispatch.customerName} - {dispatch.destination}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.length === 0 ? (
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                No action available for {roleLabels[currentUser.role]}
              </span>
            ) : (
              actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onAction(action)}
                  className={clsx(
                    "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold",
                    action === "RESOLVE_EXCEPTION"
                      ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                      : action === "CANCEL" || action === "REJECT"
                        ? "bg-rose-700 text-white hover:bg-rose-800"
                        : "bg-zinc-950 text-white hover:bg-zinc-800",
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
        <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h3 className="text-base font-semibold">Dispatch Lines</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Released Stock</th>
                  <th className="px-4 py-3">Reserved Batches</th>
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
                        <span className="font-medium">{line.reservedBatchIds.join(", ")}</span>
                      ) : (
                        <span className="text-zinc-400">Not reserved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">Operational Controls</h3>
          <div className="mt-4 space-y-3 text-sm">
            <InfoRow label="Created By" value={dispatch.createdBy} />
            <InfoRow label="Created" value={formatDateTime(dispatch.createdAt)} />
            <InfoRow label="Requested Date" value={formatDate(dispatch.requestedDispatchDate)} />
            <InfoRow label="Priority" value={dispatch.priority} />
            <InfoRow label="Approved By" value={dispatch.approvedBy ?? "Pending"} />
            <InfoRow
              label="Weight"
              value={
                dispatch.expectedWeightKg
                  ? `${formatNumber(dispatch.actualWeightKg ?? 0)} / ${formatNumber(dispatch.expectedWeightKg)} KG`
                  : "Not applicable for REAM"
              }
            />
            <InfoRow label="Tolerance" value={`${dispatch.weightTolerancePercent}%`} />
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">Vehicle and Gate</h3>
          {dispatch.vehicle ? (
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Vehicle No." value={dispatch.vehicle.vehicleNo} />
              <InfoRow label="Transporter" value={dispatch.vehicle.transporter} />
              <InfoRow label="Driver" value={dispatch.vehicle.driverName} />
              <InfoRow label="Phone" value={dispatch.vehicle.driverPhone} />
              <InfoRow label="Expected Arrival" value={formatDateTime(dispatch.vehicle.expectedArrival)} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Vehicle assignment happens after approval and reservation.</p>
          )}
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">Document Verification</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {dispatch.documents.map((doc) => (
              <div key={doc.type} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{doc.type.replaceAll("_", " ")}</p>
                  {doc.present && doc.verified ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : doc.present ? (
                    <FileCheck2 className="h-4 w-4 text-amber-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600" />
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {doc.present ? (doc.verified ? "Verified" : "Present, pending check") : "Missing"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold">Exceptions and Audit</h3>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            {dispatch.exceptions.length === 0 ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                No active exceptions on this dispatch.
              </p>
            ) : (
              dispatch.exceptions.map((item) => (
                <div key={item.id} className="rounded-md border border-zinc-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={controlClasses(item.resolvedAt ? "WARNING" : item.controlStatus)}>
                      {item.resolvedAt ? "RESOLVED" : item.controlStatus}
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
                <p className="text-sm font-semibold">{entry.action.replaceAll("_", " ")}</p>
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

      <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-base font-semibold">Inventory Batches</h2>
          <p className="text-sm text-zinc-600">Only RELEASED inventory can be reserved or dispatched.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Attributes</th>
                <th className="px-4 py-3">On Hand</th>
                <th className="px-4 py-3">Reserved</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Quality</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {inventory.map((batch) => (
                <tr key={batch.id} className="hover:bg-zinc-50">
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
                      {batch.qualityStatus.replaceAll("_", " ")}
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
    <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold">Exceptions</h2>
        <p className="text-sm text-zinc-600">Operational blocks generated by validation, inventory, quality, weight, and document controls.</p>
      </div>
      <div className="divide-y divide-zinc-100">
        {rows.map(({ dispatch, exception: item }) => {
          const canResolve =
            !item.resolvedAt && getAvailableActions(dispatch, currentUser.role).includes("RESOLVE_EXCEPTION");
          return (
            <div key={item.id} className="grid gap-3 px-4 py-4 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
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
                    {item.resolvedAt ? "RESOLVED" : item.controlStatus}
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
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-amber-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Resolve
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(dispatch.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50"
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No exceptions recorded.</p>
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
          label="Completion Rate"
          value={`${Math.round((metrics.dispatched / Math.max(metrics.total, 1)) * 100)}%`}
          detail={`${metrics.dispatched} of ${metrics.total} dispatches completed`}
          icon={Gauge}
          tone="green"
        />
        <MetricTile
          label="Control Blocks"
          value={String(metrics.blocked)}
          detail="Blocks stop gate exit until resolved"
          icon={LockKeyhole}
          tone={metrics.blocked ? "red" : "green"}
        />
        <MetricTile
          label="Reserved Reel Qty"
          value={`${formatNumber(metrics.reservedKg)} KG`}
          detail="Held after approval, before exit"
          icon={Database}
        />
        <MetricTile
          label="Reserved Sheet Qty"
          value={`${formatNumber(metrics.reservedReam)} REAM`}
          detail="No KG/REAM conversion applied"
          icon={Boxes}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Status Distribution</h2>
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
                    style={{ width: `${(row.count / dispatches.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Demo Scenario Coverage</h2>
          <div className="mt-4 space-y-3 text-sm">
            <ScenarioRow label="Successful dispatch" status="Covered" />
            <ScenarioRow label="Insufficient inventory" status="Covered" />
            <ScenarioRow label="Quality blocked inventory" status="Covered" />
            <ScenarioRow label="Weight variance exceeding tolerance" status="Covered" />
            <ScenarioRow label="Missing documentation" status="Covered" />
          </div>
        </section>
      </div>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Quality Hold and Inspection Stock</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {blockedStock.map((batch) => (
            <div key={batch.id} className="rounded-md border border-zinc-200 p-3">
              <span className={qualityClasses(batch.qualityStatus)}>
                {batch.qualityStatus.replaceAll("_", " ")}
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
    <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold">Audit Timeline</h2>
        <p className="text-sm text-zinc-600">Immutable-style event history for workflow transitions and exceptions.</p>
      </div>
      <div className="divide-y divide-zinc-100">
        {entries.map((entry) => (
          <div key={entry.id} className="grid gap-3 px-4 py-4 xl:grid-cols-[190px_220px_minmax(0,1fr)]">
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
              <p className="text-sm font-semibold">{entry.action.replaceAll("_", " ")}</p>
              <p className="mt-1 text-sm text-zinc-700">{entry.note}</p>
              <p className="mt-1 text-xs text-zinc-500">Actor: {entry.actor}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
