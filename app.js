import https from "https";
import tls from "tls";
import { handleTrialsRequest } from "./trialsApi.js";
import { fork, execSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "80", 10);
const API_PORT = 3001;
const SSR_PORT = 82;

const APP_CLIENT_DIR = path.join(__dirname, "dist/client");
const LANDING_DIR = "/root/site-flow/dist";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".apk": "application/vnd.android.package-archive",
  ".exe": "application/x-msdownload",
  ".aab": "application/octet-stream",
};

function freePort(port) {
  try {
    execSync(`fuser -k ${port}/tcp || true`, { stdio: "ignore" });
  } catch (_) {}
}

// Initial cleanup before starting
freePort(API_PORT);
freePort(SSR_PORT);

let backendProcess = null;
let frontendProcess = null;
let isShuttingDown = false;

function startBackend() {
  if (isShuttingDown) return;
  freePort(API_PORT);
  console.log("[Manager] Starting Backend API on port", API_PORT);
  backendProcess = fork(path.join(__dirname, "backend/src/server.js"), [], {
    env: { ...process.env, PORT: String(API_PORT), HOST: "127.0.0.1" },
    stdio: "pipe",
  });
  backendProcess.stdout?.on("data", (d) => process.stdout.write(`[API] ${d}`));
  backendProcess.stderr?.on("data", (d) => process.stderr.write(`[API] ${d}`));

  backendProcess.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    console.warn(`[Manager] Backend exited with code ${code} (signal: ${signal}). Freeing port & restarting in 2s...`);
    freePort(API_PORT);
    setTimeout(startBackend, 2000);
  });
}

function startFrontend() {
  if (isShuttingDown) return;
  freePort(SSR_PORT);
  console.log("[Manager] Starting Frontend SSR on port", SSR_PORT);
  frontendProcess = fork(path.join(__dirname, "dist/server/server.js"), [], {
    env: { ...process.env, PORT: String(SSR_PORT), HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1", NITRO_PORT: String(SSR_PORT) },
    stdio: "pipe",
  });
  frontendProcess.stdout?.on("data", (d) => process.stdout.write(`[SSR] ${d}`));
  frontendProcess.stderr?.on("data", (d) => process.stderr.write(`[SSR] ${d}`));

  frontendProcess.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    console.warn(`[Manager] Frontend SSR exited with code ${code} (signal: ${signal}). Freeing port & restarting in 2s...`);
    freePort(SSR_PORT);
    setTimeout(startFrontend, 2000);
  });
}

process.on("uncaughtException", (err) => {
  console.error("[Manager] Uncaught exception:", err.message);
});

// Start children
startBackend();
startFrontend();

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("[Manager] Shutting down processes...");
  if (backendProcess) backendProcess.kill("SIGKILL");
  if (frontendProcess) frontendProcess.kill("SIGKILL");
  freePort(API_PORT);
  freePort(SSR_PORT);
}

process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });

function waitForServer(port, checkPath) {
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}${checkPath}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(check, 300));
      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(check, 300);
      });
    };
    check();
  });
}

await Promise.all([
  waitForServer(API_PORT, "/health"),
  waitForServer(SSR_PORT, "/"),
]);

console.log("[Proxy] Ready on port", PORT);

// Core Request Handler
function handleRequest(req, res) {
  if (handleTrialsRequest(req, res)) return;
  
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const urlPath = parsedUrl.pathname;
  const hostHeader = (req.headers.host || "").toLowerCase();

  const isLandingDomain = hostHeader.includes("flowtv.duckdns.org") || hostHeader.includes("flowtvsite.com");
  const isWebPlayerDomain = hostHeader.includes("flowsite.duckdns.org");

  // 1. Privacy Policy
  if (urlPath.startsWith("/privacy-policy") || urlPath.startsWith("/privacy") || urlPath.startsWith("/politica-de-privacidade")) {
    const filePath = path.join(__dirname, "public", "privacy.html");
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // 2. Downloads
  if (urlPath.includes("/baixar-windows")) {
    const filePath = path.join(__dirname, "downloads", "FLOW-TV-Setup.exe");
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        "Content-Type": "application/x-msdownload",
        "Content-Disposition": 'attachment; filename="FLOW-TV-Setup.exe"',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }
  if (urlPath.includes("/baixar-aab") || urlPath.includes("/download-aab")) {
    const downloadsDir = path.join(__dirname, "downloads");
    let aabFile = "app-release-v1.1.0.aab";
    if (fs.existsSync(downloadsDir)) {
      const aabFiles = fs.readdirSync(downloadsDir).filter((f) => f.endsWith(".aab")).sort().reverse();
      if (aabFiles.length > 0) aabFile = aabFiles[0];
    }
    const filePath = path.join(downloadsDir, aabFile);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="app-release-v1.2.2.aab"',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }
  if (urlPath === "/baixar-playstore" || urlPath === "/playstore" || urlPath === "/googleplay") {
    res.writeHead(302, { Location: "https://play.google.com/store/apps/details?id=com.flowtv.player&pcampaignid=web_share" });
    res.end();
    return;
  }
  if (urlPath.includes("/baixar") || urlPath.includes("app.apk") || urlPath.includes("/download") || urlPath.includes("/downloads")) {
    const filePath = path.join(__dirname, "downloads", "FLOW.apk");
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="FLOW.apk"',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // 3. LANDING PAGE / SITE DE TESTES (flowtv.duckdns.org ou caminhos /site, /site-flow, /teste, etc.)
  const isExplicitLandingPath = (
    urlPath.startsWith("/site") ||
    urlPath.startsWith("/site-flow") ||
    urlPath.startsWith("/siteflow") ||
    urlPath.startsWith("/institucional") ||
    urlPath.startsWith("/oficial") ||
    urlPath.startsWith("/planos") ||
    urlPath.startsWith("/teste") ||
    urlPath.startsWith("/testes")
  );

  if (isLandingDomain || isExplicitLandingPath) {
    // Se estiver no domínio landing mas acessar rotas específicas de API
    if (urlPath.startsWith("/api/trials") || urlPath.startsWith("/api/generate-trial") || urlPath.startsWith("/trials")) {
      // Já tratado por handleTrialsRequest ou continua para API
    } else if (urlPath.startsWith("/api/")) {
      // Deixa passar para o backend
    } else {
      let subPath = urlPath;
      if (isExplicitLandingPath) {
        subPath = urlPath.replace(/^\/(site-flow|siteflow|site|institucional|oficial|planos|testes|teste)/, "");
      }
      if (!subPath || subPath === "/") {
        subPath = "/index.html";
      }

      let filePath = path.join(LANDING_DIR, subPath);
      // Se não existir o arquivo específico no landing (ex: /assets/..., imagem, etc), tenta carregar index.html
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(LANDING_DIR, "index.html");
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }
  }

  // 4. WEB PLAYER & APP (flowsite.duckdns.org ou IP direto)
  // 4.1 Direct Static File Serving para APP-FLOW-TV
  if (urlPath.startsWith("/assets/") || urlPath === "/favicon.png" || urlPath === "/favicon.ico" || urlPath === "/manifest.json" || urlPath === "/hls.min.js") {
    const filePath = path.join(APP_CLIENT_DIR, urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // 4.2 API vs Frontend SSR Routing
  const isApi = urlPath.startsWith("/api/public/xtream")
    ? false
    : [
        "/api/auth",
        "/api/users",
        "/api/favorites",
        "/api/history",
        "/api/settings",
        "/api/ads",
        "/api/admin",
        "/api/public",
        "/health",
        "/tv",
      ].some((p) => urlPath.startsWith(p));

  const targetPort = isApi ? API_PORT : SSR_PORT;

  const reqHeaders = { ...req.headers };
  reqHeaders.host = `127.0.0.1:${targetPort}`;
  reqHeaders["x-forwarded-for"] = req.socket.remoteAddress || "";
  reqHeaders["x-forwarded-proto"] = req.connection?.encrypted ? "https" : "http";

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: reqHeaders,
    },
    (proxyRes) => {
      const cleanHeaders = { ...proxyRes.headers };
      delete cleanHeaders["transfer-encoding"];
      
      // Avoid stale caching of HTML
      if (!urlPath.startsWith("/assets/") && !urlPath.includes(".")) {
        cleanHeaders["cache-control"] = "no-cache, no-store, must-revalidate";
        cleanHeaders["pragma"] = "no-cache";
        cleanHeaders["expires"] = "0";
      }
      res.writeHead(proxyRes.statusCode || 200, cleanHeaders);
      proxyRes.pipe(res);
    }
  );

  res.on("close", () => {
    if (!res.writableEnded) {
      proxyReq.destroy();
    }
  });

  proxyReq.on("error", (err) => {
    const isIgnored = ["ECONNRESET", "socket hang up", "EPIPE", "ECANCELED", "ERR_STREAM_PREMATURE_CLOSE"].some(
      (code) => err.code === code || (err.message && err.message.includes(code))
    );
    if (!isIgnored && !res.headersSent) {
      console.error("[Proxy]", err.message);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway");
    }
  });

  req.pipe(proxyReq);
}

// HTTP Server
const server = http.createServer(handleRequest);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy listening on 0.0.0.0:${PORT}`);
});

// HTTPS Multi-Domain SNI Configuration
const certs = {};

function loadCert(domain) {
  const certDir = `/etc/letsencrypt/live/${domain}`;
  const keyFile = path.join(certDir, "privkey.pem");
  const certFile = path.join(certDir, "fullchain.pem");
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    try {
      return tls.createSecureContext({
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile),
      });
    } catch (e) {
      console.error(`[Proxy] Erro ao carregar certificado para ${domain}:`, e.message);
    }
  }
  return null;
}

const defaultDomain = "flowtv.duckdns.org";
certs["flowtv.duckdns.org"] = loadCert("flowtv.duckdns.org");
certs["flowsite.duckdns.org"] = loadCert("flowsite.duckdns.org");

const defaultContext = certs["flowtv.duckdns.org"] || certs["flowsite.duckdns.org"];

if (defaultContext) {
  try {
    const httpsServer = https.createServer(
      {
        SNICallback: (servername, cb) => {
          const ctx = certs[servername] || defaultContext;
          if (cb) cb(null, ctx);
          return ctx;
        },
      },
      handleRequest
    );

    httpsServer.listen(443, "0.0.0.0", () => {
      console.log("[Proxy] HTTPS Multi-Domain SNI Server listening on 0.0.0.0:443 🔒");
    });
  } catch (err) {
    console.error("[Proxy] HTTPS Error:", err.message);
  }
}
