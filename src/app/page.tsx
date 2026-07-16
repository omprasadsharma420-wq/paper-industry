"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, CheckCircle2, Factory, LockKeyhole, UserRound } from "lucide-react";
import { AgraOperationsApp } from "@/components/agra-operations-app";
import { getSession, signIn, watchSession } from "@/lib/agra-backend";
import type { Role } from "@/lib/agra-types";

const DEMO_ACCOUNTS: Array<{ role: Role; label: string; email: string }> = [
  { role: "SALES_ORDER_COORDINATOR", label: "Sales", email: "sales@agra-demo.example" },
  { role: "INVENTORY_QUALITY", label: "Stock & quality", email: "quality@agra-demo.example" },
  { role: "PACKING_DISPATCH", label: "Packing", email: "packing@agra-demo.example" },
  { role: "OPERATIONS_SUPERVISOR", label: "Supervisor", email: "supervisor@agra-demo.example" },
  { role: "MANAGER_ADMIN", label: "Manager", email: "manager@agra-demo.example" },
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
  const [email, setEmail] = useState(DEMO_ACCOUNTS[4].email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const nextSession = await signIn(email.trim(), password);
      onSignedIn(nextSession);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
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
              <h1 className="text-3xl font-semibold text-neutral-950 sm:text-4xl">Sign in to operations</h1>
              <p className="mt-3 text-base leading-7 text-neutral-600">Secure access for the Agra Industries paper-products reference pilot.</p>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Demo roles">
              {DEMO_ACCOUNTS.map((account) => {
                const selected = email === account.email;
                return (
                  <button key={account.email} type="button" onClick={() => setEmail(account.email)} className={`min-h-10 rounded-md border px-3 text-left text-xs font-semibold transition ${selected ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
                    {account.label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
              <label className="block text-sm font-medium text-neutral-700">
                Email
                <span className="relative mt-1.5 block"><UserRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-10 pr-3 text-sm" /></span>
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Password
                <span className="relative mt-1.5 block"><LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-10 pr-3 text-sm" /></span>
              </label>
              {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</div> : null}
              <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50">
                {busy ? "Signing in..." : "Sign in"}<ArrowRight className="h-4 w-4" />
              </button>
            </form>

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
