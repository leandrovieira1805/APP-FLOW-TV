// Netlify Function (v1 classic): /api/public/xtream
// Server-side proxy for Xtream Codes IPTV API to avoid CORS and Mixed-Content.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

function jsonResponse(data, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
    body: JSON.stringify(data),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  let body;
  try {
    if (event.httpMethod === "POST" && event.body) {
      body = JSON.parse(event.body);
    } else {
      const q = event.queryStringParameters || {};
      const base = q.base;
      const path = q.path || "player_api.php";
      const params = { ...q };
      delete params.base;
      delete params.path;
      body = { base, path, params };
    }
  } catch (err) {
    return jsonResponse({ error: "INVALID_BODY", message: "Requisição inválida." }, 400);
  }

  const { base, path = "player_api.php", params = {} } = body || {};

  if (!base || typeof base !== "string") {
    return jsonResponse({ error: "INVALID_INPUT", message: "Dados de conexão inválidos (base ausente)." }, 400);
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
    return jsonResponse({ error: "DNS_UNAVAILABLE", message: "Endereço do servidor (DNS) inválido." }, 400);
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    return jsonResponse({ error: "DNS_UNAVAILABLE", message: "Protocolo do servidor inválido." }, 400);
  }

  const allowedPath = path === "xmltv.php" ? "xmltv.php" : "player_api.php";
  const target = new URL(allowedPath, baseUrl);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      target.searchParams.set(k, String(v));
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 FlowTV/1.0",
        Accept: "*/*",
        Referer: `${baseUrl.origin}/`,
      },
    });
    clearTimeout(timeout);

    const text = await upstream.text();

    if (!upstream.ok) {
      return jsonResponse(
        { error: "UPSTREAM_ERROR", status: upstream.status, message: "Servidor indisponível.", fallback: true },
        200
      );
    }

    const isJson = allowedPath === "player_api.php";
    return {
      statusCode: 200,
      headers: {
        "Content-Type": isJson ? "application/json" : "application/xml",
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
      body: text,
    };
  } catch (err) {
    return jsonResponse(
      { error: "CONNECTION_FAILED", message: "Não foi possível conectar ao servidor (DNS/rede).", fallback: true },
      200
    );
  }
};
