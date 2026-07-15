export async function POST(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL;

  if (!baseUrl) {
    return Response.json(
      { ok: false, message: "NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL is not configured." },
      { status: 503 },
    );
  }

  const payload = await request.json();
  const endpoint = `${baseUrl.replace(/\/$/, "")}/paper-dispatch-control`;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
