"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, CheckCircle2, Factory } from "lucide-react";
import { AgraOperationsApp } from "@/components/agra-operations-app";
import { getSession, signInDemo, watchSession } from "@/lib/agra-backend";
import type { Role } from "@/lib/agra-types";

const DEMO_ACCOUNTS: Array<{ role: Role; label: string; email: string }> = [
  { role: "MANAGER_ADMIN", label: "Manager", email: "manager@agra-demo.example" },
  { role: "SALES_ORDER_COORDINATOR", label: "Sales", email: "sales@agra-demo.example" },
  { role: "INVENTORY_QUALITY", label: "Stock & quality", email: "quality@agra-demo.example" },
  { role: "PACKING_DISPATCH", label: "Packing", email: "packing@agra-demo.example" },
  { role: "OPERATIONS_SUPERVISOR", label: "Supervisor", email: "supervisor@agra-demo.example" },
];

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void getSession()
      .then((current) => { if (active) setSession(current); })
      .finally(() => { if (active) setReady(true); });
    const subscription = watchSession((_event, current) => {
      setSession(current);
      setReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f5f7]">
        <div className="text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-[#176b5c] font-bold text-white">A</span>
          <p className="mt-4 text-sm text-neutral-500">Opening Agra Operations</p>
        </div>
      </main>
    );
  }

  return session ? <AgraOperationsApp session={session} /> : <LoginScreen onSignedIn={setSession} />;
}

function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enterDemo = async (email: string) => {
    setBusyEmail(email);
    setError(null);
    try {
      const nextSession = await signInDemo(email);
      onSignedIn(nextSession);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo could not be opened.");
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(480px,0.9fr)_minmax(520px,1.1fr)]">
        <section className="flex items-center px-6 py-10 sm:px-12 lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-md">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[#176b5c] text-base font-bold text-white">A</span>
              <div><p className="font-semibold">Agra Operations</p><p className="text-xs text-neutral-500">Reference pilot - Demo data</p></div>
            </div>

            <div className="mt-12">
              <h1 className="text-3xl font-semibold text-neutral-950 sm:text-4xl">Choose your role</h1>
              <p className="mt-3 text-base leading-7 text-neutral-600">Open the Agra Industries reference pilot with the right work view.</p>
            </div>

            {error ? <div role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</div> : null}

            <div className="mt-7 grid grid-cols-2 gap-2" aria-label="Demo roles">
              {DEMO_ACCOUNTS.map((account) => {
                const opening = busyEmail === account.email;
                const isManager = account.role === "MANAGER_ADMIN";
                return (
                  <button
                    key={account.email}
                    type="button"
                    disabled={busyEmail !== null}
                    onClick={() => void enterDemo(account.email)}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-md border px-4 text-left text-sm font-semibold transition disabled:cursor-wait disabled:opacity-55 ${isManager ? "col-span-2 border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800" : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"}`}
                  >
                    <span>{opening ? "Opening..." : account.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex items-start gap-3 border-t border-neutral-200 pt-5 text-sm text-neutral-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p><strong className="font-semibold text-neutral-800">Reference Pilot.</strong> This configuration is based on preliminary information about Agra Industries. Products, roles, controls, approval rules, and reporting fields will be validated through operational discovery.</p>
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-screen overflow-hidden bg-neutral-100 lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/agra-paper-workshop.png" alt="Handmade paper diaries, bags, frames, sheets, and gift boxes in a paper workshop" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 border-t border-white/50 bg-white/90 px-8 py-7 backdrop-blur-xl xl:px-12">
            <div className="flex items-start gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-[#176b5c] shadow-sm"><Factory className="h-5 w-5" /></span><div><p className="font-semibold">KhoriyaCo. paper products</p><p className="mt-1 max-w-xl text-sm leading-6 text-neutral-600">Commercial operations workspace for Agra Industries Pvt. Ltd.</p></div></div>
          </div>
        </section>
      </div>
    </main>
  );
}
