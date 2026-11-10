import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// FLOW TV — server-side proxy for Xtream Codes JSON API.
// Xtream panels rarely send CORS headers, so browser requests are blocked.
// This route fetches the panel API server-side and returns the JSON payload.
// Only the player_api / xmltv endpoints are allowed to limit the attack surface.

const RequestSchema = z.object({
  base: z.string().url().max(2048),
  // path is the Xtream endpoint, e.g. "player_api.php"
  path: z.enum(["player_api.php", "xmltv.php"]),
  params: z.record(z.string().max(64), z.string().max(256)).optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Global memory cache for large Xtream payloads
const responseCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export const Route = createFileRoute("/api/public/xtream")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "INVALID_BODY", message: "Requisição inválida." }, 400);
        }

        const parsed = RequestSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "INVALID_INPUT", message: "Dados de conexão inválidos." }, 400);
        }

        let baseUrl: URL;
        try {
          baseUrl = new URL(parsed.data.base);
        } catch {
          return json({ error: "DNS_UNAVAILABLE", message: "Endereço do servidor inválido." }, 400);
        }

        if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
          return json({ error: "DNS_UNAVAILABLE", message: "Protocolo do servidor inválido." }, 400);
        }

        const target = new URL(parsed.data.path, baseUrl);
        for (const [k, v] of Object.entries(parsed.data.params ?? {})) {
          target.searchParams.set(k, v);
        }

        const action = parsed.data.params?.action;
        const part = parsed.data.params?.part;
        const shouldCache = parsed.data.path === "player_api.php" && 
                            (action === "get_vod_streams" || action === "get_series" || action === "get_live_streams");

        if (shouldCache) {
          const cacheKey = `${parsed.data.base}-${parsed.data.params?.username}-${action}`;
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
                const cacheKey = `${parsed.data.base}-${parsed.data.params?.username}-${action}`;
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

          const isJson = parsed.data.path === "player_api.php";
          return new Response(text, {
            status: 200,
            headers: {
              "Content-Type": isJson ? "application/json" : "application/xml",
              "Cache-Control": "no-store",
              ...corsHeaders,
            },
          });
        } catch {
          return json(
            { error: "CONNECTION_FAILED", message: "Não foi possível conectar ao servidor (DNS/rede).", fallback: true },
            200,
          );
        }
      },
    },
  },
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
