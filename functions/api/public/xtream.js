// Cloudflare Pages Function: /api/public/xtream
// Server-side proxy for Xtream Codes IPTV API to avoid CORS and Mixed-Content.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return onRequestOptions();
  }

  let body;
  try {
    if (request.method === "POST") {
      body = await request.json();
    } else {
      const url = new URL(request.url);
      const q = Object.fromEntries(url.searchParams.entries());
      const base = q.base;
      const path = q.path || "player_api.php";
      const params = { ...q };
      delete params.base;
      delete params.path;
      body = { base, path, params };
    }
  } catch {
    return new Response(JSON.stringify({ error: "INVALID_BODY", message: "Requisição inválida." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { base, path = "player_api.php", params = {} } = body || {};

  if (!base || typeof base !== "string") {
    return new Response(JSON.stringify({ error: "INVALID_INPUT", message: "Dados de conexão inválidos (base ausente)." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let baseUrl;
  try {
    const rawBase = base.trim();
    baseUrl = new URL(
      rawBase.startsWith("http://") || rawBase.startsWith("https://")
        ? rawBase
        : `http://${rawBase}`
    );
  } catch {
    return new Response(JSON.stringify({ error: "DNS_UNAVAILABLE", message: "Endereço do servidor (DNS) inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    return new Response(JSON.stringify({ error: "DNS_UNAVAILABLE", message: "Protocolo do servidor inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const allowedPath = path === "xmltv.php" ? "xmltv.php" : "player_api.php";
  const target = new URL(allowedPath, baseUrl);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      target.searchParams.set(k, String(v));
    }
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
        Accept: "*/*",
        Referer: `${baseUrl.origin}/`,
      },
    });

    const isJson = allowedPath === "player_api.php";
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", isJson ? "application/json" : "application/xml");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "CONNECTION_FAILED",
        message: "Não foi possível conectar ao servidor IPTV.",
        details: err.message,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
}
