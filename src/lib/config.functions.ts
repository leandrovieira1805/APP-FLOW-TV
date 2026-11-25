import { supabase, useSupabase } from "./supabase";
import { loadSettings, saveSettings } from "./storage";
import type { PaymentInfo } from "@/types/payment";

export interface Provider {
  id?: string;
  code: string;
  name: string;
  admin_password?: string;
  credits_limit: number;
  credits_used: number;
  status: "active" | "suspended";
  notes?: string;
  created_at?: string;
  expires_at?: string;
}

export interface PublicConfig {
  logo: string | null;
  background: string | null;
  banner: string | null;
  bannerLink: string | null;
  banners: Array<{ image: string; link?: string }> | null;
  dnsList: string[];
  paymentInfo: PaymentInfo | null;
  paymentStatus: string | null;
  provider?: Provider | null;
}

export interface SavePayload {
  password: string;
  providerCode?: string;
  logo?: string | null;
  background?: string | null;
  banner?: string | null;
  bannerLink?: string | null;
  banners?: Array<{ image: string; link?: string }> | null;
  dnsList?: string[];
  paymentInfo?: PaymentInfo | null;
  paymentStatus?: string | null;
  newPassword?: string;
}

/**
 * Se você for gerar um APK exclusivo para um revendedor específico,
 * basta definir o código dele aqui (ex: 'ALPHA' ou 'PROV101').
 * Quando preenchido, o aplicativo já vem 100% programado e bloqueado para esse provedor.
 * Deixe vazio ("") para que o app peça o código na tela de login.
 */
export const HARDCODED_PROVIDER_CODE: string = "";

export function getStoredProviderCode(): string {
  if (HARDCODED_PROVIDER_CODE) {
    return HARDCODED_PROVIDER_CODE.trim().toUpperCase();
  }
  if (typeof window === "undefined") return "";
  try {
    const p =
      new URLSearchParams(window.location.search).get("p") ||
      new URLSearchParams(window.location.search).get("provedor") ||
      new URLSearchParams(window.location.search).get("provider");
    if (p) {
      const code = p.trim().toUpperCase();
      localStorage.setItem("flowtv_provider_code", code);
      return code;
    }
  } catch {}
  return (localStorage.getItem("flowtv_provider_code") || "").trim().toUpperCase();
}

export function setStoredProviderCode(code: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("flowtv_provider_code", (code || "").trim().toUpperCase());
  }
}

function normalizeDns(input: string): string {
  let v = input.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  return v;
}

/**
 * Valida se um código de provedor existe exatamente e está ativo no Supabase
 */
export async function validateProviderCode(code: string): Promise<{
  valid: boolean;
  provider?: Provider;
  error?: string;
}> {
  const clean = (code || "").trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: "Digite o código do provedor." };
  }

  if (useSupabase && supabase) {
    try {
      const { data: prov, error } = await supabase
        .from("providers")
        .select("*")
        .eq("code", clean)
        .maybeSingle();

      if (error || !prov) {
        return {
          valid: false,
          error: `Provedor "${clean}" não encontrado. Digite o código exato cadastrado.`,
        };
      }

      if (prov.status === "suspended") {
        return {
          valid: false,
          error: `O provedor "${clean}" está suspenso pelo administrador.`,
        };
      }

      return { valid: true, provider: prov };
    } catch (e: any) {
      return { valid: false, error: "Erro ao consultar provedor no servidor." };
    }
  }

  // Fallback se sem supabase
  if (clean === "PROV101" || clean === "GLOBAL") return { valid: true };
  return { valid: false, error: `Provedor "${clean}" não encontrado.` };
}

/**
 * Recupera as configurações públicas (DNS, Logo, etc.) direto do Supabase.
 * Se o Supabase estiver indisponível ou sem a tabela, usa o cache local (localStorage).
 */
export async function getConfig(customCode?: string): Promise<PublicConfig> {
  const code = (customCode || getStoredProviderCode() || "global").toUpperCase();
  let providerInfo: Provider | null = null;

  if (useSupabase && supabase) {
    try {
      // 1. Se for um código de provedor específico (diferente de 'global')
      if (code !== "GLOBAL" && code !== "") {
        const { data: prov } = await supabase
          .from("providers")
          .select("*")
          .eq("code", code)
          .maybeSingle();

        // Se o código digitado NÃO existir na tabela providers, NÃO entrega configurações globais!
        if (!prov) {
          return {
            logo: null,
            background: null,
            banner: null,
            bannerLink: null,
            banners: null,
            dnsList: [],
            paymentInfo: null,
            paymentStatus: null,
            provider: null,
          };
        }

        providerInfo = prov;

        // Se estiver suspenso, não entrega DNS
        if (prov.status === "suspended") {
          return {
            logo: null,
            background: null,
            banner: null,
            bannerLink: null,
            banners: null,
            dnsList: [],
            paymentInfo: null,
            paymentStatus: null,
            provider: prov,
          };
        }

        // Busca configurações do provedor
        const { data: provConfig } = await supabase
          .from("app_config")
          .select("*")
          .eq("id", code)
          .maybeSingle();

        if (provConfig) {
          let rawDns = provConfig.dns_list;
          if (typeof rawDns === "string") {
            try { rawDns = JSON.parse(rawDns); } catch {}
          }
          const dnsList = (Array.isArray(rawDns) ? rawDns : []).map(normalizeDns).filter(Boolean);

          return {
            logo: provConfig.logo || null,
            background: provConfig.background || null,
            banner: provConfig.banner || null,
            bannerLink: provConfig.banner_link || null,
            banners: Array.isArray(provConfig.banners) ? provConfig.banners : null,
            dnsList,
            paymentInfo: provConfig.payment_info || null,
            paymentStatus: provConfig.payment_status || null,
            provider: prov,
          };
        }

        // Se o provedor existe mas ainda não salvou DNS, não puxa o global!
        return {
          logo: null,
          background: null,
          banner: null,
          bannerLink: null,
          banners: null,
          dnsList: [],
          paymentInfo: null,
          paymentStatus: null,
          provider: prov,
        };
      }

      // 2. Se for explicitamente 'GLOBAL'
      let configData: any = null;
      const { data: globalConfig } = await supabase
        .from("app_config")
        .select("*")
        .eq("id", "global")
        .maybeSingle();
      configData = globalConfig;

      if (configData) {
        let rawDns = configData.dns_list;
        if (typeof rawDns === "string") {
          try { rawDns = JSON.parse(rawDns); } catch {}
        }
        const dnsList = (Array.isArray(rawDns) ? rawDns : []).map(normalizeDns).filter(Boolean);

        return {
          logo: configData.logo || null,
          background: configData.background || null,
          banner: configData.banner || null,
          bannerLink: configData.banner_link || null,
          banners: Array.isArray(configData.banners) ? configData.banners : null,
          dnsList,
          paymentInfo: configData.payment_info || null,
          paymentStatus: configData.payment_status || null,
          provider: null,
        };
      }
    } catch (e) {
      console.warn("Falha ao buscar config do Supabase:", e);
    }
  }

  // Fallback local apenas se o código for GLOBAL
  if (code === "GLOBAL") {
    const local = loadSettings();
    return {
      logo: local.logo || null,
      background: local.background || null,
      banner: local.banner || null,
      bannerLink: local.bannerLink || null,
      banners: local.banners || null,
      dnsList: (local.dnsList || []).map(normalizeDns).filter(Boolean),
      paymentInfo: local.paymentInfo || null,
      paymentStatus: local.paymentStatus || null,
      provider: null,
    };
  }

  return {
    logo: null,
    background: null,
    banner: null,
    bannerLink: null,
    banners: null,
    dnsList: [],
    paymentInfo: null,
    paymentStatus: null,
    provider: null,
  };
}

/**
 * Validação da senha de administrador (Super Admin ou Provedor Parceiro)
 */
export async function verifyAdmin({
  data,
}: {
  data: { password: string; providerCode?: string };
}): Promise<{ ok: boolean; isSuperAdmin: boolean; provider?: Provider | null; error?: string }> {
  const inputPass = (data?.password || "").trim();
  const inputCode = (data?.providerCode || "").trim().toUpperCase();

  if (useSupabase && supabase) {
    try {
      // 1. Verifica se é o Super Admin (Senha Master ou senha global)
      const { data: cfg } = await supabase
        .from("app_config")
        .select("admin_password")
        .eq("id", "global")
        .maybeSingle();

      const superPass = cfg?.admin_password || "Leandro1805";
      if ((!inputCode || inputCode === "GLOBAL") && (inputPass === superPass || inputPass === "Leandro1805")) {
        return { ok: true, isSuperAdmin: true };
      }

      // 2. Verifica se é um Provedor Parceiro
      let provQuery = supabase.from("providers").select("*");
      if (inputCode) {
        provQuery = provQuery.eq("code", inputCode);
      } else {
        provQuery = provQuery.eq("admin_password", inputPass);
      }

      const { data: provs } = await provQuery;
      if (provs && provs.length > 0) {
        const prov = provs.find((p: Provider) => p.admin_password === inputPass || (!inputCode && p.admin_password === inputPass));
        if (prov) {
          if (prov.status === "suspended") {
            return { ok: false, isSuperAdmin: false, error: "Este provedor está suspenso. Entre em contato com o administrador." };
          }
          return { ok: true, isSuperAdmin: false, provider: prov };
        }
      }
    } catch (e) {
      console.warn("verifyAdmin error:", e);
    }
  }

  // Fallback local
  const localPass = (typeof window !== "undefined" ? localStorage.getItem("flowtv_admin_password") : null) || "Leandro1805";
  if (inputPass === localPass || inputPass === "Leandro1805") {
    return { ok: true, isSuperAdmin: true };
  }

  return { ok: false, isSuperAdmin: false, error: "Senha ou Código de Provedor inválido." };
}

/**
 * Verifica em tempo real no Supabase se o usuário ou o provedor foi suspenso/bloqueado
 */
export async function checkUserAndProviderStatus(username: string, providerCode?: string): Promise<{ ok: boolean; message?: string }> {
  if (useSupabase && supabase) {
    try {
      const pCode = (providerCode || getStoredProviderCode() || "").trim().toUpperCase();
      const cleanUser = username.trim();
      const id = pCode && pCode !== "GLOBAL" ? `${cleanUser.toLowerCase()}__${pCode}` : cleanUser.toLowerCase();

      // 1. Checa se o provedor ativo no app está suspenso
      if (pCode && pCode !== "GLOBAL") {
        const { data: prov } = await supabase
          .from("providers")
          .select("status")
          .eq("code", pCode)
          .maybeSingle();

        if (prov && prov.status === "suspended") {
          return { ok: false, message: `O provedor [${pCode}] está suspenso pelo administrador.` };
        }
      }

      // 2. Checa se o usuário específico está bloqueado no banco
      const { data: user } = await supabase
        .from("app_users")
        .select("is_blocked, provider_code")
        .or(`id.eq.${id},username.eq.${cleanUser}`)
        .maybeSingle();

      if (user?.is_blocked) {
        return { ok: false, message: "Sua conta de usuário foi bloqueada pelo administrador." };
      }

      // 3. Se o usuário estiver associado a um provedor no banco, checa se esse provedor está suspenso
      const userProvCode = (user?.provider_code || "").trim().toUpperCase();
      if (userProvCode && userProvCode !== "GLOBAL" && userProvCode !== pCode) {
        const { data: prov } = await supabase
          .from("providers")
          .select("status")
          .eq("code", userProvCode)
          .maybeSingle();

        if (prov && prov.status === "suspended") {
          return { ok: false, message: `O provedor [${userProvCode}] está suspenso pelo administrador.` };
        }
      }

      return { ok: true };
    } catch (e) {
      console.warn("checkUserAndProviderStatus error:", e);
    }
  }
  return { ok: true };
}

/**
 * Salva as configurações de DNS, Logo e Banners no Supabase (por Provedor ou Global)
 */
export async function saveConfig({ data }: { data: SavePayload }): Promise<PublicConfig> {
  const targetId = (data.providerCode || "global").toUpperCase();
  const normalizedDns = (data.dnsList || []).map(normalizeDns).filter(Boolean).slice(0, 5);

  if (useSupabase && supabase) {
    try {
      const updateData: any = {
        id: targetId,
        dns_list: normalizedDns,
        logo: data.logo ?? null,
        background: data.background ?? null,
        banner: data.banner ?? null,
        banner_link: data.bannerLink ?? null,
        banners: Array.isArray(data.banners) ? data.banners : null,
        payment_info: data.paymentInfo ?? null,
        payment_status: data.paymentStatus ?? null,
        updated_at: new Date().toISOString(),
      };

      if (data.newPassword) {
        updateData.admin_password = data.newPassword.trim();
        if (targetId !== "GLOBAL") {
          await supabase
            .from("providers")
            .update({ admin_password: data.newPassword.trim() })
            .eq("code", targetId);
        }
      }

      await supabase
        .from("app_config")
        .upsert(updateData, { onConflict: "id" });
    } catch (e) {
      console.error("Erro ao salvar config no Supabase:", e);
    }
  }

  const nextSettings = {
    logo: data.logo || undefined,
    background: data.background || undefined,
    banner: data.banner || undefined,
    bannerLink: data.bannerLink || undefined,
    banners: data.banners || undefined,
    dnsList: normalizedDns,
    paymentInfo: data.paymentInfo,
    paymentStatus: data.paymentStatus,
  };
  saveSettings(nextSettings);

  if (data.newPassword && typeof window !== "undefined" && targetId === "GLOBAL") {
    localStorage.setItem("flowtv_admin_password", data.newPassword.trim());
  }

  return {
    ...nextSettings,
    logo: nextSettings.logo ?? null,
    background: nextSettings.background ?? null,
    banner: nextSettings.banner ?? null,
    bannerLink: nextSettings.bannerLink ?? null,
    banners: nextSettings.banners ?? null,
  };
}

/**
 * Funções exclusivas do Super Admin para Gerenciar Provedores Parceiros
 */
export async function fetchProvidersList(): Promise<Provider[]> {
  if (useSupabase && supabase) {
    try {
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      console.warn("fetchProvidersList error:", e);
    }
  }
  return [];
}

export async function saveProvider(provider: Partial<Provider>): Promise<{ ok: boolean; error?: string }> {
  if (!useSupabase || !supabase) return { ok: false, error: "Supabase não conectado." };
  try {
    const cleanCode = (provider.code || "").trim().toUpperCase();
    if (!cleanCode) return { ok: false, error: "Código do provedor é obrigatório." };
    if (!provider.name?.trim()) return { ok: false, error: "Nome do provedor é obrigatório." };

    const payload: any = {
      code: cleanCode,
      name: provider.name.trim(),
      admin_password: (provider.admin_password || "admin123").trim(),
      credits_limit: Number(provider.credits_limit) || 50,
      status: provider.status || "active",
      notes: provider.notes || null,
    };

    if (provider.expires_at) {
      payload.expires_at = provider.expires_at;
    }

    const { error } = await supabase
      .from("providers")
      .upsert(payload, { onConflict: "code" });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erro ao salvar provedor" };
  }
}

export async function deleteProvider(code: string): Promise<{ ok: boolean; message?: string }> {
  if (!useSupabase || !supabase) return { ok: false, message: "Banco não conectado" };
  try {
    const cleanCode = code.trim().toUpperCase();

    // 1. Busca todos os IDs e usernames dos usuários deste provedor para limpar histórico e favoritos
    const { data: provUsers } = await supabase
      .from("app_users")
      .select("id, username")
      .or(`provider_code.ilike.${cleanCode},id.ilike.%__${cleanCode}`);

    if (provUsers && provUsers.length > 0) {
      const userIds = provUsers.map((u) => u.id).filter(Boolean);
      const userNames = provUsers.map((u) => u.username).filter(Boolean);
      const allUserKeys = Array.from(new Set([...userIds, ...userNames]));

      // Limpa watch_history e favorites desses usuários
      if (allUserKeys.length > 0) {
        try {
          await supabase.from("watch_history").delete().in("user_id", allUserKeys);
          await supabase.from("favorites").delete().in("user_id", allUserKeys);
        } catch (e) {
          console.warn("deleteProvider cleanup history error:", e);
        }
      }
    }

    // 2. Remove todos os usuários do provedor no app_users
    await supabase
      .from("app_users")
      .delete()
      .or(`provider_code.ilike.${cleanCode},id.ilike.%__${cleanCode}`);

    // 3. Remove a configuração do provedor em app_config
    await supabase
      .from("app_config")
      .delete()
      .or(`id.ilike.${cleanCode},id.eq.${cleanCode}`);

    // 4. Remove o provedor da tabela providers
    const { error: errProv } = await supabase
      .from("providers")
      .delete()
      .or(`code.ilike.${cleanCode},code.eq.${cleanCode}`);

    if (errProv) {
      console.warn("deleteProvider error on providers table:", errProv);
      return { ok: false, message: errProv.message };
    }

    return { ok: true };
  } catch (err: any) {
    console.error("deleteProvider exception:", err);
    return { ok: false, message: err?.message || "Erro ao excluir provedor" };
  }
}

export async function toggleProviderStatus(code: string, currentStatus: string): Promise<boolean> {
  if (!useSupabase || !supabase) return false;
  try {
    const cleanCode = code.trim().toUpperCase();
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    await supabase.from("providers").update({ status: newStatus }).eq("code", cleanCode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registra o login do usuário no Supabase com isolamento de provedor e controle de créditos
 */
export async function recordUserLogin(username: string, dnsBase: string, providerCode?: string): Promise<{ ok: boolean; message?: string }> {
  const pCode = (providerCode || getStoredProviderCode() || "global").toUpperCase();

  if (useSupabase && supabase) {
    try {
      const cleanUser = username.trim();
      const host = (dnsBase || "").replace(/^https?:\/\//, '').replace(/[/:]/g, '_');
      const email = `${cleanUser}_${host}@iptv.sync`;
      const id = `${cleanUser.toLowerCase()}__${pCode}`;

      // 1. Checa se este usuário já existe e está bloqueado (Global ou Provedor)
      const { data: existingUser } = await supabase
        .from("app_users")
        .select("id, is_blocked")
        .or(`id.eq.${id},username.eq.${cleanUser}`)
        .maybeSingle();

      if (existingUser?.is_blocked) {
        return { ok: false, message: "Acesso bloqueado pelo administrador. Fale com seu suporte." };
      }

      // 2. Se pertencer a um provedor parceiro, valida se o provedor EXISTE e está ativo
      if (pCode !== "GLOBAL") {
        const { data: prov } = await supabase
          .from("providers")
          .select("status, credits_limit, credits_used")
          .eq("code", pCode)
          .maybeSingle();

        if (!prov) {
          return { ok: false, message: `Provedor "${pCode}" não encontrado. Verifique o código digitado.` };
        }

        if (prov.status === "suspended") {
          return { ok: false, message: `O provedor "${pCode}" está suspenso pelo administrador.` };
        }

        // Se for novo cliente, checa se atingiu o limite de créditos
        if (!existingUser && prov.credits_used >= prov.credits_limit) {
          return { ok: false, message: `Limite de clientes do provedor "${pCode}" foi atingido (${prov.credits_used}/${prov.credits_limit}).` };
        }
      }

      await supabase
        .from("app_users")
        .upsert({
          id,
          username: cleanUser,
          email,
          dns: dnsBase,
          provider_code: pCode,
          last_login: new Date().toISOString(),
          status: 'active',
        }, { onConflict: 'id' });

      // Atualiza contador de créditos usados do provedor
      if (pCode !== "GLOBAL") {
        const { count } = await supabase
          .from("app_users")
          .select("*", { count: 'exact', head: true })
          .eq("provider_code", pCode);

        if (typeof count === "number") {
          await supabase.from("providers").update({ credits_used: count }).eq("code", pCode);
        }
      }

      return { ok: true };
    } catch (e) {
      console.warn("recordUserLogin error:", e);
    }
  }
  return { ok: true };
}

/**
 * Busca a lista de usuários registrados para o painel Admin (filtrado por provedor)
 */
export async function fetchUsersList({
  data,
}: {
  data: { password: string; providerCode?: string; isSuperAdmin?: boolean };
}): Promise<any[]> {
  if (useSupabase && supabase) {
    try {
      let query = supabase.from("app_users").select("*").order("last_login", { ascending: false });

      const pCode = (data.providerCode || "").trim().toUpperCase();

      if (!data.isSuperAdmin) {
        // Se for provedor parceiro, exibe APENAS os clientes cadastrados sob o código dele
        if (pCode && pCode !== "GLOBAL") {
          query = query.eq("provider_code", pCode);
        } else {
          query = query.eq("provider_code", "UNKNOWN_NO_LEAK");
        }
      } else {
        // Se for Super Admin, filtra conforme o escopo selecionado no dropdown
        if (pCode && pCode !== "ALL") {
          if (pCode === "GLOBAL") {
            query = query.or("provider_code.eq.global,provider_code.is.null");
          } else {
            query = query.eq("provider_code", pCode);
          }
        }
      }

      const { data: users, error } = await query;
      if (!error && Array.isArray(users)) {
        return users.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email || `${u.username}@iptv.sync`,
          providerCode: u.provider_code || "global",
          payUrl: u.pay_url || "",
          blocked: !!u.is_blocked,
          lastActiveAt: u.last_login,
          createdAt: u.created_at || u.last_login,
        }));
      }
    } catch (e) {
      console.warn("Falha ao buscar usuários do Supabase:", e);
    }
  }
  return [];
}

/**
 * Remove um usuário no Supabase e limpa todo o histórico e favoritos
 */
export async function removeUser({ data }: { data: { password: string; userId: string } }): Promise<{ message: string }> {
  if (useSupabase && supabase) {
    try {
      const uId = data.userId.trim();

      // Busca dados do usuário antes de remover para saber username e provider
      const { data: userRec } = await supabase
        .from("app_users")
        .select("id, username, provider_code")
        .or(`id.eq.${uId},id.ilike.${uId},username.ilike.${uId}`)
        .maybeSingle();

      const username = userRec?.username || (uId.includes("__") ? uId.split("__")[0] : uId);
      const provCode = userRec?.provider_code;

      // 1. Remove da tabela app_users por ID exato, ilike e por username
      let userQuery = supabase.from("app_users").delete();
      if (provCode && provCode !== "GLOBAL") {
        userQuery = userQuery.or(
          `id.eq.${uId},id.ilike.${uId},and(username.ilike.${username},provider_code.ilike.${provCode})`
        );
      } else {
        userQuery = userQuery.or(`id.eq.${uId},id.ilike.${uId},username.ilike.${username}`);
      }
      await userQuery;

      // 2. Remove todo o histórico de assistir do usuário (Continuar Assistindo)
      await supabase
        .from("watch_history")
        .delete()
        .or(`user_id.eq.${uId},user_id.ilike.${uId},user_id.ilike.${username}`);

      // 3. Remove todos os favoritos do usuário
      await supabase
        .from("favorites")
        .delete()
        .or(`user_id.eq.${uId},user_id.ilike.${uId},user_id.ilike.${username}`);
    } catch (e) {
      console.warn("Supabase removeUser error:", e);
    }
  }
  return { message: "Usuário removido com sucesso" };
}

/**
 * Bloqueia ou desbloqueia um usuário no Supabase
 */
export async function toggleUserBlock({ data }: { data: { password: string; userId: string } }): Promise<{ message: string; blocked: boolean }> {
  if (useSupabase && supabase) {
    try {
      const uId = data.userId.trim();
      const { data: user } = await supabase
        .from("app_users")
        .select("is_blocked")
        .or(`id.eq.${uId},username.eq.${uId}`)
        .maybeSingle();

      const newBlocked = !user?.is_blocked;
      await supabase
        .from("app_users")
        .update({ is_blocked: newBlocked })
        .or(`id.eq.${uId},username.eq.${uId}`);

      return {
        message: newBlocked ? "Usuário bloqueado com sucesso!" : "Usuário desbloqueado com sucesso!",
        blocked: newBlocked,
      };
    } catch (e) {
      console.warn("Supabase toggleUserBlock error:", e);
    }
  }
  return { message: "Status atualizado", blocked: false };
}

/**
 * Busca o link de pagamento/renovação específico cadastrado para um usuário
 * @param username Nome do usuário
 * @param providerCode Código do provedor (opcional)
 * @param fallbackToProvider Se false (padrão), retorna apenas o link cadastrado no próprio usuário; se true, usa o checkoutUrl do provedor caso o usuário não tenha link próprio
 */
export async function getUserPayUrl(
  username: string,
  providerCode?: string,
  fallbackToProvider: boolean = false
): Promise<string | null> {
  if (useSupabase && supabase) {
    try {
      const cleanUser = username.trim();
      const pCode = (providerCode || getStoredProviderCode() || "").trim().toUpperCase();
      const id = pCode && pCode !== "GLOBAL" ? `${cleanUser.toLowerCase()}__${pCode}` : cleanUser.toLowerCase();

      // 1. Busca link individual na tabela app_users pelo ID exato ou pelo username
      let query = supabase
        .from("app_users")
        .select("id, username, provider_code, pay_url");

      if (pCode && pCode !== "GLOBAL") {
        query = query.or(`id.eq.${id},id.eq.${cleanUser.toLowerCase()},username.ilike.${cleanUser}`);
      } else {
        query = query.or(`id.eq.${cleanUser.toLowerCase()},username.ilike.${cleanUser}`);
      }

      const { data: users, error } = await query;

      if (!error && users && users.length > 0) {
        // Encontra o usuário correspondente:
        // Prioridade 1: ID exato com pay_url
        // Prioridade 2: mesmo provedor com pay_url
        // Prioridade 3: qualquer registro com esse username que tenha pay_url
        const userWithUrl =
          users.find((u) => u.id === id && u.pay_url && u.pay_url.trim()) ||
          users.find((u) => pCode && u.provider_code?.toUpperCase() === pCode && u.pay_url && u.pay_url.trim()) ||
          users.find((u) => u.pay_url && u.pay_url.trim());

        if (userWithUrl?.pay_url && userWithUrl.pay_url.trim()) {
          let url = userWithUrl.pay_url.trim();
          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
          return url;
        }
      }

      // 2. Se o usuário não tem link próprio cadastrado e fallbackToProvider estiver habilitado
      if (fallbackToProvider) {
        const effectiveProv = pCode || "global";
        const cfg = await getConfig(effectiveProv);
        if (cfg?.paymentInfo?.checkoutUrl) {
          let url = cfg.paymentInfo.checkoutUrl.trim();
          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
          return url;
        }
      }
    } catch (e) {
      console.warn("getUserPayUrl error:", e);
    }
  }
  return null;
}

/**
 * Atualiza o link de pagamento/renovação específico de um usuário
 */
export async function updateUserPayUrl({
  data,
}: {
  data: { password: string; userId: string; payUrl: string };
}): Promise<{ ok: boolean; message: string }> {
  if (useSupabase && supabase) {
    try {
      const uId = data.userId.trim();
      let cleanUrl = (data.payUrl || "").trim();
      if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = "https://" + cleanUrl;
      }

      const { error } = await supabase
        .from("app_users")
        .update({ pay_url: cleanUrl || null })
        .or(`id.eq.${uId},username.eq.${uId}`);

      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, message: "Link de pagamento do usuário atualizado com sucesso!" };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Erro ao salvar link de pagamento." };
    }
  }
  return { ok: false, message: "Banco de dados não conectado." };
}
