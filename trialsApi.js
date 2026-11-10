import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "/root/site-flow/data";
const DATA_FILE = path.join(DATA_DIR, "trials.json");
const USED_IPS_FILE = path.join(DATA_DIR, "used_ips.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "leandro1805";

const SERVERS = {
  primelux: {
    id: "primelux",
    name: "PRIME ZEROUM",
    apiEndpoint: "https://primelux.sigma.st/api/chatbot/lKWOzOeDzo/JOALyo0W4w",
    webPlayerUrl: "http://zro1.site:80",
    defaultPayUrl: "https://flowtv.duckdns.org/#planos",
    defaultPackage: "PRIME ZEROUM Teste",
    defaultConnections: 2,
  },
  playvision: {
    id: "playvision",
    name: "Play Vision",
    apiEndpoint: "https://playvision.store/api/chatbot/ryJDzVzDge/gQBWQ5WGRe",
    webPlayerUrl: "https://flowsite.duckdns.org/login",
    defaultPayUrl: "https://flowtv.duckdns.org/#planos",
    defaultPackage: "Play Vision Teste",
    defaultConnections: 1,
  },
};

// Inicializa arquivos se não existirem
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}
if (!fs.existsSync(USED_IPS_FILE)) {
  fs.writeFileSync(USED_IPS_FILE, "[]", "utf-8");
}

function readTrials() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8") || "[]");
  } catch (err) {
    console.error("[TrialsAPI] Erro ao ler trials.json:", err);
    return [];
  }
}

function saveTrials(trials) {
  try {
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(trials, null, 2), "utf-8");
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error("[TrialsAPI] Erro ao salvar trials.json:", err);
    return false;
  }
}

function readUsedIps() {
  try {
    if (!fs.existsSync(USED_IPS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USED_IPS_FILE, "utf-8") || "[]");
  } catch {
    return [];
  }
}

function saveUsedIp(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "localhost" || ip.startsWith("192.168.") || ip.startsWith("10.")) return;
  const ips = readUsedIps();
  if (!ips.includes(ip)) {
    ips.push(ip);
    try {
      fs.writeFileSync(USED_IPS_FILE, JSON.stringify(ips, null, 2), "utf-8");
      console.log(`[TrialsAPI] 🚫 IP registrado na lista global de bloqueio: ${ip}`);
    } catch (e) {
      console.error("[TrialsAPI] Erro ao salvar IP:", e);
    }
  }
}

function getClientIp(req) {
  let ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "";
  if (ip.includes(",")) ip = ip.split(",")[0];
  ip = ip.trim().replace(/^::ffff:/, "");
  return ip;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function extractCredentials(data, fallbackDns) {
  let replyText = data.reply || "";
  if (!replyText && Array.isArray(data.data) && data.data[0]?.message) {
    replyText = data.data[0].message;
  }

  let username = data.username || "";
  let password = data.password || "";
  let dns = data.dns || "";

  if (replyText) {
    if (!username) {
      const matchUser = replyText.match(/(?:Usuário|Usu\u00e1rio|\*Usuário:\*)\s*:?\s*\*?([a-zA-Z0-9_-]+)/i);
      if (matchUser) username = matchUser[1];
    }
    if (!password) {
      const matchPass = replyText.match(/(?:Senha|\*Senha:\*)\s*:?\s*\*?([a-zA-Z0-9_-]+)/i);
      if (matchPass) password = matchPass[1];
    }
    if (!dns) {
      const matchDns = replyText.match(/http:\/\/[a-zA-Z0-9.-]+(?::\d+)?/i);
      if (matchDns) dns = matchDns[0];
    }
  }

  return { username, password, dns: dns || fallbackDns, replyText };
}

export function handleTrialsRequest(req, res, pathname, urlObj) {
  if (!urlObj || !pathname) {
    try {
      urlObj = new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`);
      pathname = urlObj.pathname;
    } catch {
      pathname = (req.url || "/").split("?")[0];
      urlObj = { searchParams: new URLSearchParams((req.url || "").split("?")[1] || "") };
    }
  }
  const method = req.method;

  // GET /api/user-payurl?username=...
  if (pathname === "/api/user-payurl" && method === "GET") {
    const userQuery = urlObj.searchParams.get("username") || "";
    const cleanUser = userQuery.trim().toLowerCase();
    const fallbackPayUrl = "https://flowtv.duckdns.org/#planos";

    if (!cleanUser) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, payUrl: fallbackPayUrl }));
      return true;
    }

    const trials = readTrials();
    const match = trials.find((t) => (t.username || "").toLowerCase() === cleanUser);

    if (match && match.payUrl) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, payUrl: match.payUrl, trial: match }));
      return true;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, payUrl: fallbackPayUrl }));
    return true;
  }

  // GET /api/device-trial?deviceId=...
  if (pathname === "/api/device-trial" && method === "GET") {
    const devId = (urlObj.searchParams.get("deviceId") || "").trim();
    if (!devId) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ hasTrial: false }));
      return true;
    }

    const trials = readTrials();
    const match = trials.find((t) => t.deviceId && t.deviceId === devId);
    if (match) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        hasTrial: true,
        trial: {
          username: match.username,
          expiresAtFormatted: match.expiresAtFormatted,
          payUrl: match.payUrl,
          customerName: match.customerName,
          maskedPhone: match.customerPhone ? match.customerPhone.slice(0, 4) + "****" + match.customerPhone.slice(-2) : "",
        },
      }));
      return true;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ hasTrial: false }));
    return true;
  }

  // POST /api/generate-trial (com Bloqueio Estrito de Aparelho)
  if (pathname === "/api/generate-trial" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { nome, telefone, serverId, deviceId } = JSON.parse(body || "{}");

        if (!nome || !telefone) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Nome e telefone são obrigatórios." }));
          return;
        }

        const srvId = serverId || "primelux";
        const server = SERVERS[srvId] || SERVERS.primelux;
        const normPhone = normalizePhone(telefone);
        const cleanDeviceId = String(deviceId || "").trim();
        const clientIp = getClientIp(req);
        const trials = readTrials();

        // 1. CHECAGEM DE BLOQUEIO DE APARELHO (Anti-Fraude / Multi-Contas)
        if (cleanDeviceId) {
          const deviceTrial = trials.find((t) => t.deviceId && t.deviceId === cleanDeviceId);
          if (deviceTrial) {
            const samePhone = normalizePhone(deviceTrial.customerPhone) === normPhone;
            if (!samePhone) {
              console.log(`[TrialsAPI] 🚫 Bloqueio de aparelho ativado para DeviceID: ${cleanDeviceId} (tentou telefone: ${normPhone}, já cadastrado anteriormente com: ${deviceTrial.customerPhone})`);
              res.writeHead(403, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  success: false,
                  blocked: true,
                  reason: "DEVICE_ALREADY_USED",
                  error: "Este aparelho já utilizou o teste gratuito com outro número. Não é permitido criar múltiplos testes no mesmo dispositivo.",
                  existingTrial: {
                    username: deviceTrial.username,
                    payUrl: deviceTrial.payUrl || server.defaultPayUrl,
                    maskedPhone: deviceTrial.customerPhone
                      ? deviceTrial.customerPhone.slice(0, 4) + "****" + deviceTrial.customerPhone.slice(-2)
                      : "",
                  },
                })
              );
              return;
            } else {
              // Mesmo telefone no mesmo aparelho -> Reenvia o acesso já existente
              console.log(`[TrialsAPI] ℹ️ Reenviando teste existente do mesmo aparelho/telefone: ${normPhone}`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, trial: deviceTrial, isExisting: true }));
              return;
            }
          }
        }

        // 2. CHECAGEM POR TELEFONE
        const existingForPhone = trials.find(
          (t) => normalizePhone(t.customerPhone) === normPhone && t.serverId === srvId
        );
        if (existingForPhone) {
          console.log(`[TrialsAPI] ℹ️ Reenviando teste existente para o telefone ${normPhone}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, trial: existingForPhone, isExisting: true }));
          return;
        }

        // 3. SOLICITAÇÃO UPSTREAM NA API SIGMA
        console.log(`[TrialsAPI] Solicitando teste ao servidor ${server.name} para ${nome} - ${normPhone} (Device: ${cleanDeviceId || "N/A"}, IP: ${clientIp})...`);
        const upstreamRes = await fetch(server.apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            nome: nome,
            telefone: normPhone,
          }),
        });

        if (!upstreamRes.ok) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Erro no servidor de geração de testes (${upstreamRes.status})` }));
          return;
        }

        const data = await upstreamRes.json();
        const extracted = extractCredentials(data, server.webPlayerUrl);

        const trialRecord = {
          deviceId: cleanDeviceId || undefined,
          dns: extracted.dns || data.dns || server.webPlayerUrl,
          username: data.username || extracted.username,
          password: data.password || extracted.password,
          package: data.package || server.defaultPackage,
          connections: data.connections || server.defaultConnections,
          createdAt: data.createdAt,
          createdAtFormatted: data.createdAtFormatted || new Date().toLocaleString("pt-BR"),
          expiresAt: data.expiresAt,
          expiresAtFormatted: data.expiresAtFormatted || data.expiresAt || "4 Horas",
          payUrl: data.payUrl || server.defaultPayUrl,
          reply: extracted.replyText || data.reply,
          serverId: srvId,
          serverName: server.name,
          customerName: nome,
          customerPhone: normPhone,
          clientIp,
          createdAtTimestamp: Date.now(),
        };

        const updated = [
          trialRecord,
          ...trials.filter(
            (t) => normalizePhone(t.customerPhone) !== normPhone || t.serverId !== srvId
          ),
        ];
        saveTrials(updated);
        saveUsedIp(clientIp);

        console.log(`[TrialsAPI] ✅ Novo teste gerado e salvo: ${trialRecord.customerName} (${normPhone}) [DevID: ${cleanDeviceId}] -> Usuário: ${trialRecord.username}`);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, trial: trialRecord }));
      } catch (err) {
        console.error("[TrialsAPI] Erro ao gerar teste:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Erro interno ao processar teste." }));
      }
    });
    return true;
  }

  // GET /api/trials (Admin)
  if (pathname === "/api/trials" && method === "GET") {
    const authHeader = req.headers["x-admin-password"] || urlObj.searchParams.get("password");
    if (authHeader !== ADMIN_PASSWORD) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Senha de administrador inválida." }));
      return true;
    }
    const trials = readTrials();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(trials));
    return true;
  }

  // POST /api/trials (Salva teste direto)
  if (pathname === "/api/trials" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const record = JSON.parse(body || "{}");
        if (!record.customerPhone || !record.username) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Dados incompletos." }));
          return;
        }
        const normPhone = normalizePhone(record.customerPhone);
        const trials = readTrials();
        const newRecord = {
          ...record,
          customerPhone: normPhone,
          createdAtTimestamp: record.createdAtTimestamp || Date.now(),
        };
        const updated = [
          newRecord,
          ...trials.filter(
            (t) => normalizePhone(t.customerPhone) !== normPhone || t.serverId !== record.serverId
          ),
        ];
        saveTrials(updated);
        console.log(`[TrialsAPI] Teste salvo via POST direto: ${record.customerName} (${normPhone})`);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, trial: newRecord }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Erro ao processar JSON." }));
      }
    });
    return true;
  }

  // GET /api/trials/customer/:phone
  if (pathname.startsWith("/api/trials/customer/") && method === "GET") {
    const phone = pathname.replace("/api/trials/customer/", "");
    const normPhone = normalizePhone(phone);
    const trials = readTrials();
    const customerTrials = trials.filter((t) => normalizePhone(t.customerPhone) === normPhone);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(customerTrials));
    return true;
  }

  // PATCH /api/trials/renew
  if (pathname === "/api/trials/renew" && method === "PATCH") {
    const authHeader = req.headers["x-admin-password"] || urlObj.searchParams.get("password");
    if (authHeader !== ADMIN_PASSWORD) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Senha de administrador inválida." }));
      return true;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { customerPhone, serverId } = JSON.parse(body || "{}");
        const normPhone = normalizePhone(customerPhone);
        const trials = readTrials();
        let target = null;
        const updated = trials.map((r) => {
          if (normalizePhone(r.customerPhone) === normPhone && r.serverId === serverId) {
            target = {
              ...r,
              renewed: !r.renewed,
              renewedAt: !r.renewed ? Date.now() : undefined,
            };
            return target;
          }
          return r;
        });
        saveTrials(updated);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, record: target }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Erro ao processar JSON." }));
      }
    });
    return true;
  }

  // DELETE /api/trials
  if (pathname === "/api/trials" && method === "DELETE") {
    const authHeader = req.headers["x-admin-password"] || urlObj.searchParams.get("password");
    if (authHeader !== ADMIN_PASSWORD) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Senha de administrador inválida." }));
      return true;
    }
    const all = urlObj.searchParams.get("all");
    const phone = urlObj.searchParams.get("phone");
    const serverId = urlObj.searchParams.get("serverId");

    if (all === "true") {
      saveTrials([]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Todos os registros foram excluídos." }));
      return true;
    }

    if (phone && serverId) {
      const normPhone = normalizePhone(phone);
      const trials = readTrials();
      const updated = trials.filter(
        (r) => !(normalizePhone(r.customerPhone) === normPhone && r.serverId === serverId)
      );
      saveTrials(updated);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Registro excluído com sucesso." }));
      return true;
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Parâmetros inválidos." }));
    return true;
  }

  return false;
}
