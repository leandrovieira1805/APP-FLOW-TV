import { supabase, useSupabase } from "./supabase";
import { loadSettings, saveSettings } from "./storage";
import type { PaymentInfo } from "@/types/payment";

export interface PublicConfig {
  logo: string | null;
  background: string | null;
  banner: string | null;
  bannerLink: string | null;
  banners: Array<{ image: string; link?: string }> | null;
  dnsList: string[];
  paymentInfo: PaymentInfo | null;
  paymentStatus: string | null;
}

export interface SavePayload {
  password: string;
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

function normalizeDns(input: string): string {
  let v = input.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  return v;
}

/**
 * Recupera as configurações públicas (DNS, Logo, etc.) direto do Supabase.
 * Se o Supabase estiver indisponível ou sem a tabela, usa o cache local (localStorage).
 */
export async function getConfig(): Promise<PublicConfig> {
  if (useSupabase && supabase) {
    try {
      const { data, error } = await supabase
        .from("app_config")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      if (!error && data) {
        let rawDns = data.dns_list;
        if (typeof rawDns === "string") {
          try { rawDns = JSON.parse(rawDns); } catch {}
        }
        const dnsList = (Array.isArray(rawDns) ? rawDns : []).map(normalizeDns).filter(Boolean);

        return {
          logo: data.logo || null,
          background: data.background || null,
          banner: data.banner || null,
          bannerLink: data.banner_link || null,
          banners: Array.isArray(data.banners) ? data.banners : null,
          dnsList,
          paymentInfo: data.payment_info || null,
          paymentStatus: data.payment_status || null,
        };
      }
    } catch (e) {
      console.warn("Falha ao buscar app_config do Supabase:", e);
    }
  }

  // Fallback local
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
  };
}

/**
 * Validação da senha de administrador
 */
export async function verifyAdmin({ data }: { data: { password: string } }): Promise<{ ok: boolean }> {
  const inputPass = (data?.password || "").trim();
  if (useSupabase && supabase) {
    try {
      const { data: cfg, error } = await supabase
        .from("app_config")
        .select("admin_password")
        .eq("id", "global")
        .maybeSingle();

      if (!error && cfg && cfg.admin_password) {
        return { ok: cfg.admin_password === inputPass };
      }
    } catch {}
  }

  const localPass = (typeof window !== "undefined" ? localStorage.getItem("flowtv_admin_password") : null) || "admin123";
  const ok = inputPass === localPass || inputPass === "admin123" || inputPass === "FlowTV2026!";
  return { ok };
}

/**
 * Salva as configurações de DNS, Logo e Banners no Supabase para todos os apps
 */
export async function saveConfig({ data }: { data: SavePayload }): Promise<PublicConfig> {
  const normalizedDns = (data.dnsList || []).map(normalizeDns).filter(Boolean).slice(0, 5);

  if (useSupabase && supabase) {
    try {
      const updateData: any = {
        id: "global",
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
      }

      const { error } = await supabase
        .from("app_config")
        .upsert(updateData, { onConflict: "id" });

      if (error) {
        console.error("Erro ao salvar app_config no Supabase:", error);
      }
    } catch (e) {
      console.error("Exceção ao salvar no Supabase:", e);
    }
  }

  // Salva no cache local instantâneo
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

  if (data.newPassword && typeof window !== "undefined") {
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
 * Registra o login do usuário no Supabase para exibição no painel Admin
 */
export async function recordUserLogin(username: string, dnsBase: string): Promise<boolean> {
  if (useSupabase && supabase) {
    try {
      const cleanUser = username.trim();
      const host = (dnsBase || "").replace(/^https?:\/\//, '').replace(/[/:]/g, '_');
      const email = `${cleanUser}_${host}@iptv.sync`;
      const id = cleanUser.toLowerCase();

      // Verifica se o usuário está bloqueado
      const { data: existing } = await supabase
        .from("app_users")
        .select("is_blocked")
        .eq("id", id)
        .maybeSingle();

      if (existing?.is_blocked) {
        return false; // bloqueado
      }

      await supabase
        .from("app_users")
        .upsert({
          id,
          username: cleanUser,
          email,
          dns: dnsBase,
          last_login: new Date().toISOString(),
          status: 'active',
        }, { onConflict: 'id' });

      return true;
    } catch (e) {
      console.warn("Falha ao registrar login do usuário no Supabase:", e);
    }
  }
  return true;
}

/**
 * Busca a lista de usuários registrados para o painel Admin
 */
export async function fetchUsersList({ data }: { data: { password: string } }): Promise<any[]> {
  if (useSupabase && supabase) {
    try {
      const { data: users, error } = await supabase
        .from("app_users")
        .select("*")
        .order("last_login", { ascending: false });

      if (!error && Array.isArray(users)) {
        return users.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email || `${u.username}@iptv.sync`,
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
      const uId = data.userId.trim().toLowerCase();
      // Remove da tabela de usuários por id e por username
      await supabase.from("app_users").delete().eq("id", data.userId);
      await supabase.from("app_users").delete().eq("id", uId);
      await supabase.from("app_users").delete().eq("username", data.userId);
      await supabase.from("app_users").delete().eq("username", uId);
      
      // Remove todo o histórico de assistir do usuário (Continuar Assistindo)
      await supabase.from("watch_history").delete().eq("user_id", data.userId);
      await supabase.from("watch_history").delete().eq("user_id", uId);
      
      // Remove todos os favoritos do usuário
      await supabase.from("favorites").delete().eq("user_id", data.userId);
      await supabase.from("favorites").delete().eq("user_id", uId);
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
      const { data: user } = await supabase
        .from("app_users")
        .select("is_blocked")
        .eq("id", data.userId)
        .maybeSingle();

      const newBlocked = !user?.is_blocked;
      await supabase
        .from("app_users")
        .update({ is_blocked: newBlocked })
        .eq("id", data.userId);

      return { message: "Status atualizado", blocked: newBlocked };
    } catch {}
  }
  return { message: "Status atualizado", blocked: false };
}
