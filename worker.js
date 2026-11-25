// Cloudflare Worker: Entry point for FLOW TV
// Handles /api/public/xtream, /api/public/stream, client-error, backend proxying, and static assets from dist/client

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, HEAD, PUT, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, X-Requested-With, X-Playback-Session-Id",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. Rota de log de erro de cliente (/api/public/client-error)
    if (url.pathname === "/api/public/client-error") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2. Proxy para /api/public/xtream (Chamadas da API Xtream Codes para evitar CORS)
    if (url.pathname === "/api/public/xtream") {
      let body;
      try {
        if (request.method === "POST") {
          body = await request.json();
        } else {
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

      let parsedBase;
      try {
        parsedBase = new URL(base);
        if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
          return new Response(JSON.stringify({ error: "INVALID_URL", message: "Protocolo inválido." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "INVALID_URL", message: "URL base inválida." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const cleanPath = String(path).replace(/^\/+/, "");
      const targetUrl = new URL(cleanPath, parsedBase.origin.endsWith("/") ? parsedBase.origin : `${parsedBase.origin}/`);
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          targetUrl.searchParams.set(k, String(v));
        }
      }

      try {
        const upstream = await fetch(targetUrl.toString(), {
          method: "GET",
          headers: {
            "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
            Accept: "application/json, text/javascript, */*; q=0.01",
          },
        });

        const data = await upstream.text();
        return new Response(data, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") || "application/json",
            ...corsHeaders,
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "UPSTREAM_ERROR", message: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // 3. Proxy de Streaming e Mídia (/api/public/stream e /api/public/stream.m3u8)
    if (url.pathname.startsWith("/api/public/stream")) {
      const target = url.searchParams.get("url");
      if (!target) {
        return new Response("Missing url param", { status: 400, headers: corsHeaders });
      }

      let parsedTarget;
      try {
        parsedTarget = new URL(target);
      } catch {
        return new Response("Invalid target URL", { status: 400, headers: corsHeaders });
      }

      const looksLikeImage =
        url.searchParams.get("kind") === "image" ||
        /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?|$)/i.test(target);
      const isHls = /\.m3u8($|\?)/i.test(target);

      const upstreamHeaders = new Headers({
        "User-Agent": "IPTVSmartersPlayer/1.0.0 (Linux; Android 10)",
        Accept: looksLikeImage ? "image/*,*/*;q=0.8" : "*/*",
        Referer: `${parsedTarget.origin}/`,
      });

      const rangeHeader = request.headers.get("Range");
      if (rangeHeader && !looksLikeImage) {
        upstreamHeaders.set("Range", rangeHeader);
      }

      try {
        let currentTarget = target;
        let upstream = null;
        let finalUrl = target;

        // Segue redirects manualmente para interceptar redirecionamentos para IPs diretos (ex: 38.46.220.125)
        // e convertê-los para sslip.io na porta 80 (HTTP), contornando o erro 1003 do Cloudflare e o erro de certificado SSL autoassinado do painel
        for (let hop = 0; hop < 6; hop++) {
          let u;
          try {
            u = new URL(currentTarget);
          } catch {
            break;
          }

          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) {
            currentTarget = `http://${u.hostname}.sslip.io:80${u.pathname}${u.search}`;
          }

          const fetchHeaders = new Headers(upstreamHeaders);
          try {
            const hUrl = new URL(currentTarget);
            fetchHeaders.set("Referer", `${hUrl.origin}/`);
          } catch {}

          let res;
          try {
            res = await fetch(currentTarget, {
              method: request.method === "HEAD" ? "HEAD" : "GET",
              headers: fetchHeaders,
              redirect: "manual",
            });
          } catch (fetchErr) {
            // Se falhar no HTTPS (ex: certificado autoassinado/COMMON_NAME_INVALID em IPTV), tenta HTTP
            if (currentTarget.startsWith("https://")) {
              currentTarget = currentTarget.replace(/^https:\/\//i, "http://");
              try {
                res = await fetch(currentTarget, {
                  method: request.method === "HEAD" ? "HEAD" : "GET",
                  headers: fetchHeaders,
                  redirect: "manual",
                });
              } catch (err2) {
                throw fetchErr;
              }
            } else {
              throw fetchErr;
            }
          }

          // Se retornar erro de handshake SSL do Cloudflare (525/526), tenta via HTTP
          if ((res.status === 525 || res.status === 526) && currentTarget.startsWith("https://")) {
            currentTarget = currentTarget.replace(/^https:\/\//i, "http://");
            res = await fetch(currentTarget, {
              method: request.method === "HEAD" ? "HEAD" : "GET",
              headers: fetchHeaders,
              redirect: "manual",
            });
          }

          if ([301, 302, 303, 307, 308].includes(res.status)) {
            const loc = res.headers.get("Location");
            if (!loc) {
              upstream = res;
              finalUrl = currentTarget;
              break;
            }
            try {
              currentTarget = new URL(loc, currentTarget).toString();
            } catch {
              currentTarget = loc;
            }
            // Se o redirecionamento apontar para https em nó IPTV, prefere http para evitar falha SSL
            if (currentTarget.startsWith("https://")) {
              currentTarget = currentTarget.replace(/^https:\/\//i, "http://");
            }
            continue;
          }

          upstream = res;
          finalUrl = currentTarget;
          break;
        }

        if (!upstream) {
          return new Response("Upstream unreachable", { status: 502, headers: corsHeaders });
        }

        const upstreamContentType = (upstream.headers.get("Content-Type") || "").toLowerCase();

        // Se o servidor IPTV retornou uma página HTML de erro (ex: 404 ou INVALID_CREDENTIALS do XUI.one),
        // NÃO entregamos como stream 200 para evitar que o AVPlayer do iOS trave em tela preta
        if (!looksLikeImage && upstreamContentType.includes("text/html") && !upstream.ok) {
          return new Response(JSON.stringify({
            error: "IPTV_STREAM_ERROR",
            message: "O servidor IPTV retornou erro ou credenciais inválidas para esta mídia.",
            status: upstream.status
          }), {
            status: upstream.status >= 400 ? upstream.status : 502,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const isRealHls =
          url.pathname.includes(".m3u8") ||
          url.searchParams.get("ext") === ".m3u8" ||
          isHls ||
          upstreamContentType.includes("mpegurl") ||
          upstreamContentType.includes("x-mpegurl");

        const isMp4 =
          url.pathname.includes(".mp4") ||
          url.searchParams.get("ext") === ".mp4" ||
          /\.(mp4|m4v|mov)($|\?)/i.test(finalUrl) ||
          /\.(mp4|m4v|mov)($|\?)/i.test(target);

        const isTs =
          url.pathname.includes(".ts") ||
          /\.ts($|\?)/i.test(finalUrl) ||
          /\.ts($|\?)/i.test(target);

        // Se for playlist HLS de verdade (.m3u8), reescreve as rotas para o proxy HTTPS
        if (isRealHls && upstream.ok) {
          const playlistText = await upstream.text();
          const baseUrl = finalUrl || upstream.url || target;
          const lines = playlistText.split(/\r?\n/);
          const rewritten = lines.map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith("#")) {
              return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
                try {
                  const abs = new URL(uri, baseUrl).toString();
                  return `URI="/api/public/stream?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return _m;
                }
              });
            }
            try {
              const abs = new URL(trimmed, baseUrl).toString();
              return `/api/public/stream?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          }).join("\n");

          const resHeaders = new Headers(upstream.headers);
          for (const [k, v] of Object.entries(corsHeaders)) {
            resHeaders.set(k, v);
          }
          resHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
          resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
          return new Response(rewritten, { status: 200, headers: resHeaders });
        }

        // Para mídia binária (MP4, TS, MKV, imagens, etc.): Streaming contínuo preservando headers de Range
        const passHeaders = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "cache-control",
          "etag",
          "last-modified",
          "content-disposition",
        ];

        const resHeaders = new Headers();
        for (const [k, v] of Object.entries(corsHeaders)) {
          resHeaders.set(k, v);
        }
        for (const h of passHeaders) {
          const v = upstream.headers.get(h);
          if (v) resHeaders.set(h, v);
        }

        // Garante MIME types compatíveis com o AVPlayer nativo do iOS
        if (isMp4) {
          resHeaders.set("Content-Type", "video/mp4");
        } else if (isRealHls) {
          resHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
        } else if (isTs) {
          resHeaders.set("Content-Type", "video/mp2t");
        } else if (!resHeaders.has("Content-Type") || resHeaders.get("Content-Type") === "application/octet-stream") {
          if (/\.mp4($|\?)/i.test(finalUrl) || /\.mp4($|\?)/i.test(target)) {
            resHeaders.set("Content-Type", "video/mp4");
          }
        }

        resHeaders.set("Accept-Ranges", "bytes");

        if (looksLikeImage) {
          resHeaders.set("Cache-Control", "public, max-age=604800, immutable");
        }

        return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
      } catch (err) {
        return new Response(`Proxy error: ${err.message}`, { status: 502, headers: corsHeaders });
      }
    }

    // 4. Rota transcode.m3u8 (requer servidor Express backend com ffmpeg)
    if (url.pathname.startsWith("/api/public/transcode")) {
      if (env.API_ORIGIN) {
        const backendUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
        return fetch(new Request(backendUrl, request));
      }
      return new Response(
        JSON.stringify({
          error: "TRANSCODE_SERVICE_UNAVAILABLE",
          message: "O serviço de transcodificação em tempo real requer backend dedicado com FFmpeg. Configure API_ORIGIN nas variáveis de ambiente.",
        }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 5. Encaminhamento de rotas de API do backend (/api/*)
    if (url.pathname.startsWith("/api/")) {
      // Se houver um backend Express hospedado configurado via API_ORIGIN:
      if (env.API_ORIGIN) {
        try {
          const backendUrl = new URL(url.pathname + url.search, env.API_ORIGIN);
          const fwdHeaders = new Headers(request.headers);
          fwdHeaders.set("X-Forwarded-Host", url.host);
          fwdHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

          const backendReq = new Request(backendUrl.toString(), {
            method: request.method,
            headers: fwdHeaders,
            body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
            redirect: "follow",
          });

          const backendRes = await fetch(backendReq);
          const resHeaders = new Headers(backendRes.headers);
          for (const [k, v] of Object.entries(corsHeaders)) {
            resHeaders.set(k, v);
          }
          return new Response(backendRes.body, {
            status: backendRes.status,
            headers: resHeaders,
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "BACKEND_UNREACHABLE", message: `Falha ao conectar ao backend: ${e.message}` }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }

      // Se não houver backend hospedado configurado:
      // O app FLOW TV usa Supabase e Xtream Codes diretamente no frontend para login e catálogo.
      // Retorna 404 JSON estruturado com instrução clara em vez de 500 ou HTML SPA.
      return new Response(
        JSON.stringify({
          error: "BACKEND_NOT_CONFIGURED",
          message: "Nenhum backend Express configurado em API_ORIGIN. A sincronização em nuvem é executada via Supabase.",
          path: url.pathname,
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 6. Entrega de arquivos estáticos da SPA (Assets) com fallback index.html para TanStack Router
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status === 404 && !url.pathname.includes(".")) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      }
      return response;
    }

    return new Response("Not Found", { status: 404 });
  },
};
