import { createClient } from "npm:@supabase/supabase-js@2.110.4";

const ALLOWED_ORIGINS = new Set([
  "https://paper-industry-dispatch-control.trafangularlaw01.chatgpt.site",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3101",
  "http://localhost:3000",
  "http://localhost:3101",
]);

const DEMO_EMAILS = new Set([
  "manager@agra-demo.example",
  "sales@agra-demo.example",
  "quality@agra-demo.example",
  "packing@agra-demo.example",
  "supervisor@agra-demo.example",
]);

function jsonResponse(
  origin: string,
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": origin,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      Vary: "Origin",
    },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ message: "Origin not allowed." }), {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        Vary: "Origin",
      },
    });
  }

  if (request.method === "OPTIONS") {
    return jsonResponse(origin, { ok: true });
  }
  if (request.method !== "POST") {
    return jsonResponse(origin, { message: "Method not allowed." }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024) {
    return jsonResponse(origin, { message: "The request is too large." }, 413);
  }

  const payload = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email =
    typeof payload?.email === "string"
      ? payload.email.trim().toLowerCase()
      : "";

  if (!DEMO_EMAILS.has(email)) {
    return jsonResponse(
      origin,
      { message: "Choose one of the available demo roles." },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!supabaseUrl || !publishableKeys || !secretKeys) {
    return jsonResponse(origin, { message: "Demo access is not configured." }, 503);
  }

  const publishableKey = JSON.parse(publishableKeys).default;
  const secretKey = JSON.parse(secretKeys).default;
  const auth = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };
  const admin = createClient(supabaseUrl, secretKey, auth);
  const publicClient = createClient(supabaseUrl, publishableKey, auth);

  const { data: link, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error(
      "Demo link generation failed",
      email,
      linkError?.code ?? "missing_token",
    );
    return jsonResponse(
      origin,
      { message: "Demo access is temporarily unavailable." },
      502,
    );
  }

  const { data, error } = await publicClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (error || !data.session) {
    console.error(
      "Demo link verification failed",
      email,
      error?.code ?? "missing_session",
    );
    return jsonResponse(
      origin,
      { message: "Demo access is temporarily unavailable." },
      502,
    );
  }

  return jsonResponse(origin, {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
});
