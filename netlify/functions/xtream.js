// Netlify Function: /api/public/xtream
// Server-side proxy for Xtream Codes IPTV API to avoid CORS and Mixed-Content restrictions in browsers.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

// Global memory cache for large Xtream payloads (e.g. VOD, series catalogs)
const responseCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  let body;
  try {
    if (event.httpMethod === "POST") {
      body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    } else {
      const q = event.queryStringParameters || {};
      const { base, path = "player_api.php", ...params } = q;
      body = { base, path, params };
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ error: "INVALID_BODY", message: "Requisição inválida." }),
    };
  }

  const { base, path = "player_api.php", params = {} } = body || {};

  if (!base || typeof base !== "string") {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ error: "INVALID_INPUT", message: "Dados de conexão inválidos (base ausente)." }),
    };
  }

  let baseUrl;
  try {
    const rawBase = base.trim();
    baseUrl = new URL(rawBase.startsWith("http://") || rawBase.startsWith("https://") ? rawBase : `http://${rawBase}`);
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ error: "DNS_UNAVAILABLE", message: "Endereço do servidor (DNS) inválido." }),
    };
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ error: "DNS_UNAVAILABLE", message: "Protocolo do servidor inválido." }),
    };
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
    const isJson = allowedPath === "player_api.php";
    return {
      statusCode: upstream.ok ? 200 : upstream.status,
      headers: {
        "Content-Type": isJson ? "application/json" : "application/xml",
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        error: "CONNECTION_FAILED",
        message: "Não foi possível conectar ao servidor (DNS/rede).",
        fallback: true,
      }),
    };
  }
}

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let body;
  try {
    if (request.method === "POST") {
      body = await request.json();
    } else {
      const url = new URL(request.url);
      const base = url.searchParams.get("base");
      const path = url.searchParams.get("path") || "player_api.php";
      const params = {};
      url.searchParams.forEach((v, k) => {
        if (k !== "base" && k !== "path") params[k] = v;
      });
      body = { base, path, params };
    }
  } catch (err) {
    return json({ error: "INVALID_BODY", message: "Requisição inválida." }, 400);
  }

  const { base, path = "player_api.php", params = {} } = body || {};

  if (!base || typeof base !== "string") {
    return json({ error: "INVALID_INPUT", message: "Dados de conexão inválidos (base ausente)." }, 400);
  }

  let baseUrl;
  try {
    const rawBase = base.trim();
    baseUrl = new URL(rawBase.startsWith("http://") || rawBase.startsWith("https://") ? rawBase : `http://${rawBase}`);
  } catch {
    return json({ error: "DNS_UNAVAILABLE", message: "Endereço do servidor (DNS) inválido." }, 400);
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    return json({ error: "DNS_UNAVAILABLE", message: "Protocolo do servidor inválido." }, 400);
  }

  const allowedPath = path === "xmltv.php" ? "xmltv.php" : "player_api.php";
  const target = new URL(allowedPath, baseUrl);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      target.searchParams.set(k, String(v));
    }
  }

  const action = params?.action;
  const part = params?.part;
  const shouldCache = allowedPath === "player_api.php" && 
                      (action === "get_vod_streams" || action === "get_series" || action === "get_live_streams");

  if (shouldCache) {
    const cacheKey = `${baseUrl.origin}-${params?.username}-${action}`;
    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      let resultData = cached.data;
      if (Array.isArray(resultData)) {
        if (part === "1") {
          resultData = resultData.slice(0, Math.ceil(resultData.length / 2));
        } else if (part === "2") {
          resultData = resultData.slice(Math.ceil(resultData.length / 2));
        }
      }
      return new Response(JSON.stringify(resultData), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...corsHeaders,
        },
      });
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
      return json(
        { error: "UPSTREAM_ERROR", status: upstream.status, message: "Servidor indisponível.", fallback: true },
        200,
      );
    }

    if (shouldCache) {
      try {
        const jsonParsed = JSON.parse(text);
        if (Array.isArray(jsonParsed)) {
          const cacheKey = `${baseUrl.origin}-${params?.username}-${action}`;
          responseCache.set(cacheKey, { data: jsonParsed, timestamp: Date.now() });
          
          let resultData = jsonParsed;
          if (part === "1") {
            resultData = jsonParsed.slice(0, Math.ceil(jsonParsed.length / 2));
          } else if (part === "2") {
            resultData = jsonParsed.slice(Math.ceil(jsonParsed.length / 2));
          }
          return new Response(JSON.stringify(resultData), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              ...corsHeaders,
            },
          });
        }
      } catch (e) {
        // fallback
      }
    }

    const isJson = allowedPath === "player_api.php";
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": isJson ? "application/json" : "application/xml",
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
    });
  } catch (err) {
    return json(
      { error: "CONNECTION_FAILED", message: "Não foi possível conectar ao servidor (DNS/rede).", fallback: true },
      200,
    );
  }
};

export const config = {
  path: "/api/public/xtream",
};

