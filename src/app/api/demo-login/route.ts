import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://etykyasaicfhrbbtbdfv.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5";

const DEMO_EMAILS = new Set([
  "manager@agra-demo.example",
  "sales@agra-demo.example",
  "quality@agra-demo.example",
  "packing@agra-demo.example",
  "supervisor@agra-demo.example",
]);

type DemoLoginRequest = { email?: unknown };
type SupabasePasswordResponse = {
  access_token?: string;
  refresh_token?: string;
  error_description?: string;
  msg?: string;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024) {
    return NextResponse.json({ message: "The request is too large." }, { status: 413 });
  }

  const payload = (await request.json().catch(() => null)) as DemoLoginRequest | null;
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!DEMO_EMAILS.has(email)) {
    return NextResponse.json({ message: "Choose one of the available demo roles." }, { status: 400 });
  }

  const password = process.env.AGRA_DEMO_PASSWORD;
  if (!password) {
    return NextResponse.json({ message: "Demo access is not configured." }, { status: 503 });
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("Demo role sign-in service failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { message: "Demo access is temporarily unavailable." },
      { status: 502 },
    );
  }
  const auth = (await authResponse.json().catch(() => null)) as SupabasePasswordResponse | null;

  if (!authResponse.ok || !auth?.access_token || !auth.refresh_token) {
    console.error("Demo role sign-in failed", { email, status: authResponse.status });
    return NextResponse.json(
      { message: "Demo access is temporarily unavailable." },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { accessToken: auth.access_token, refreshToken: auth.refresh_token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
