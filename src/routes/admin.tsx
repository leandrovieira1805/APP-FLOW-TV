import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  Server,
  Save,
  ArrowLeft,
  Trash2,
  Image as ImageIcon,
  Upload,
  Megaphone,
  Lock,
  Unlock,
  Ban,
  Loader2,
  KeyRound,
  CreditCard,
  Users,
  Settings as SettingsIcon,
  Search,
  Calendar,
  Clock,
  Filter,
  UserCheck,
  UserX,
  AlertTriangle,
} from "lucide-react";
import { getConfig, verifyAdmin, saveConfig, fetchUsersList, removeUser, toggleUserBlock } from "../lib/config.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { saveSettings } from "../lib/storage";
import type { PaymentInfo } from "../types/payment";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — FLOW TV" },
      { name: "description", content: "Configure DNS, logo, plano de fundo e banner de anúncio do FLOW TV." },
    ],
  }),
  component: AdminPage,
});

interface FormState {
  logo?: string;
  background?: string;
  banner?: string; // compatibilidade retroativa
  bannerLink: string; // compatibilidade retroativa
  banners: Array<{ image: string; link?: string }>;
  dns: string[]; // always length 5
  paymentInfo?: PaymentInfo | null;
  paymentStatus?: string | null;
}

function AdminPage() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  const [form, setForm] = useState<FormState>({ bannerLink: "", banners: [], dns: ["", "", "", "", ""] });
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadIntoForm = async () => {
    const cfg = await getConfig();
    const dns = [...(cfg.dnsList ?? [])];
    while (dns.length < 5) dns.push("");
    setForm({
      logo: cfg.logo ?? undefined,
      background: cfg.background ?? undefined,
      banner: cfg.banner ?? undefined,
      bannerLink: cfg.bannerLink ?? "",
      banners: cfg.banners ?? [],
      dns: dns.slice(0, 5),
      paymentInfo: cfg.paymentInfo,
      paymentStatus: cfg.paymentStatus,
    });

    setLoadingUsers(true);
    try {
      const u = await fetchUsersList({ data: { password: password.trim() } });
      const seen = new Set();
      const uniqueUsers = u.filter((user: any) => {
        const key = (user.username || user.email.split("@")[0].split("_")[0]).trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setUsersList(uniqueUsers);
    } catch(e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await removeUser({ data: { password: password.trim(), userId } });
      toast.success("Usuário excluído com sucesso");
      setUsersList((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDeleteId(null);
    } catch(e) {
      toast.error("Erro ao excluir usuário");
      console.error(e);
    }
  };

  const handleToggleBlockUser = async (userId: string, isBlocked: boolean) => {
    const action = isBlocked ? "desbloquear" : "bloquear";
    try {
      const res = await toggleUserBlock({ data: { password: password.trim(), userId } });
      toast.success(`Usuário ${isBlocked ? "desbloqueado" : "bloqueado"} com sucesso`);
      setUsersList((prev) => prev.map((u) => u.id === userId ? { ...u, blocked: res.blocked } : u));
    } catch(e) {
      toast.error(`Erro ao ${action} usuário`);
      console.error(e);
    }
  };

  const handleDeleteFiltered = async () => {
    if (filteredUsers.length === 0) return;
    const count = filteredUsers.length;
    if (!confirm(`ATENCAO: Deseja realmente excluir permanentemente todos os ${count} usuario(s) filtrados? Esta acao nao pode ser desfeita.`)) return;
    
    setDeletingBulk(true);
    try {
      let deleted = 0;
      for (const u of filteredUsers) {
        await removeUser({ data: { password: password.trim(), userId: u.id } });
        deleted++;
      }
      toast.success(`${deleted} usuário(s) excluído(s) com sucesso!`);
      const deletedIds = new Set(filteredUsers.map((u) => u.id));
      setUsersList(usersList.filter((u) => !deletedIds.has(u.id)));
    } catch (e) {
      toast.error("Erro ao excluir alguns usuários.");
      console.error(e);
    } finally {
      setDeletingBulk(false);
    }
  };

  const userStats = {
    total: usersList.length,
    online: usersList.filter((u) => {
      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
      return last && (Date.now() - new Date(last).getTime() < 5 * 60 * 1000);
    }).length,
    active30: usersList.filter((u) => {
      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
      return last && (Date.now() - new Date(last).getTime() <= 30 * 24 * 60 * 60 * 1000);
    }).length,
    inactive30: usersList.filter((u) => {
      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
      return !last || (Date.now() - new Date(last).getTime() > 30 * 24 * 60 * 60 * 1000);
    }).length,
    blocked: usersList.filter((u) => u.blocked).length,
  };

  const filteredUsers = usersList.filter((u) => {
    const rawUser = (u.username || u.email.split("@")[0].split("_")[0] || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    if (q && !rawUser.includes(q) && !email.includes(q)) {
      return false;
    }

    if (statusFilter === "active" && u.blocked) return false;
    if (statusFilter === "blocked" && !u.blocked) return false;

    const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
    const diffMs = last ? Date.now() - new Date(last).getTime() : null;

    if (periodFilter === "24h") {
      if (diffMs === null || diffMs > 24 * 60 * 60 * 1000) return false;
    } else if (periodFilter === "7d") {
      if (diffMs === null || diffMs > 7 * 24 * 60 * 60 * 1000) return false;
    } else if (periodFilter === "15d") {
      if (diffMs === null || diffMs > 15 * 24 * 60 * 60 * 1000) return false;
    } else if (periodFilter === "30d") {
      if (diffMs === null || diffMs > 30 * 24 * 60 * 60 * 1000) return false;
    } else if (periodFilter === "inactive30") {
      if (diffMs !== null && diffMs <= 30 * 24 * 60 * 60 * 1000) return false;
    } else if (periodFilter === "never") {
      if (diffMs !== null) return false;
    }

    return true;
  });

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error("Informe a senha de administrador.");
      return;
    }
    setChecking(true);
    try {
      const { ok } = await verifyAdmin({ data: { password: password.trim() } });
      if (!ok) {
        toast.error("Senha incorreta.");
        return;
      }
      await loadIntoForm();
      setAuthed(true);
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(`Erro: ${error?.message || "Falha ao validar a senha. Tente novamente."}`);
    } finally {
      setChecking(false);
    }
  };

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const onSave = async () => {
    setSaving(true);

    // Optimistic UI: Update cache IMMEDIATELY for instant feedback
    const optimisticSettings = {
      logo: form.logo ?? undefined,
      background: form.background ?? undefined,
      banner: form.banner ?? undefined,
      bannerLink: form.bannerLink,
      banners: form.banners.length > 0 ? form.banners : undefined,
      dnsList: form.dns,
      paymentInfo: form.paymentInfo,
      paymentStatus: form.paymentStatus,
    };
    qc.setQueryData(["app-config"], optimisticSettings);
    saveSettings(optimisticSettings); // Save to localStorage instantly

    toast.success("Configurações salvas!", {
      description: "As alterações já estão disponíveis para você.",
    });

    if (newPassword.trim()) {
      setPassword(newPassword.trim());
      setNewPassword("");
    }

    // Then send request to server in background
    try {
      await saveConfig({
        data: {
          password: password.trim(),
          logo: form.logo ?? null,
          background: form.background ?? null,
          banner: form.banner ?? null,
          bannerLink: form.bannerLink,
          banners: form.banners.length > 0 ? form.banners : null,
          dnsList: form.dns,
          paymentInfo: form.paymentInfo,
          paymentStatus: form.paymentStatus,
          newPassword: newPassword.trim() || undefined,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar no servidor.");
      // Revert optimistic update on error
      await qc.invalidateQueries({ queryKey: ["app-config"] });
    } finally {
      setSaving(false);
    }
  };

  if (!authed) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
        <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <form
          onSubmit={onLogin}
          className="relative z-10 w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur"
        >
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
              <ShieldCheck className="h-8 w-8" />
            </span>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Área do Admin</h1>
            <p className="mt-2 text-sm text-muted-foreground">Digite a senha para continuar.</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3.5 py-3 transition-colors focus-within:border-primary">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="password"
              placeholder="Senha de administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={checking}
            className="focusable flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
          </button>
          <Link
            to="/login"
            className="focusable flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10 mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
            <ShieldCheck className="h-8 w-8" />
          </span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gerencie configurações e usuários.
          </p>
        </div>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" /> Configurações
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Usuários
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="settings" className="space-y-6 mx-auto max-w-md">

        {/* DNS list */}
        <div className="space-y-4 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Server className="h-5 w-5 text-primary" /> Servidores (DNS)
          </h2>
          <p className="text-xs text-muted-foreground">
            Cadastre até 5 servidores. O app testa as DNS automaticamente e conecta na primeira que responder.
          </p>
          {form.dns.map((value, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3.5 py-3 transition-colors focus-within:border-primary"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <input
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="http://servidor.com:8080"
                value={value}
                onChange={(e) => {
                  const dns = [...form.dns];
                  dns[i] = e.target.value;
                  update({ dns });
                }}
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
            </div>
          ))}
        </div>

        {/* Appearance */}
        <div className="space-y-5 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <ImageIcon className="h-5 w-5 text-primary" /> Aparência
          </h2>

          <ImageField
            label="Logo"
            help="Tamanho recomendado: 512x512 pixels (quadrado). Aparece no menu e na tela inicial."
            value={form.logo}
            onChange={(v) => update({ logo: v })}
          />
          <ImageField
            label="Plano de fundo"
            help="Tamanho recomendado: 1920x1080 pixels (16:9). Imagem de fundo do aplicativo."
            value={form.background}
            onChange={(v) => update({ background: v })}
          />
          <ImageField
            label="Banner de anúncio da tela de login"
            help="Tamanho recomendado: 800x200 pixels (Proporção 4:1). Exibido acima do formulário de login sem corte se seguir esta proporção."
            value={form.banner}
            onChange={(v) => update({ banner: v })}
          />

          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="h-4 w-4 text-primary" /> Banners de anúncio
              </h3>
              <button
                type="button"
                onClick={() => update({ banners: [...form.banners, { image: "", link: "" }] })}
                className="focusable flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50"
              >
                <Upload className="h-3.5 w-3.5" /> Adicionar banner
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Os banners rotacionam automaticamente a cada 5 segundos. Tamanho recomendado: 1920x1080 pixels (16:9).
            </p>
            
            {form.banners.map((banner, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Banner {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newBanners = [...form.banners];
                      newBanners.splice(index, 1);
                      update({ banners: newBanners });
                    }}
                    className="focusable flex items-center gap-1.5 text-xs text-destructive hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                </div>
                <ImageField
                  label="Imagem do banner"
                  help="Tamanho recomendado: 1920x1080 pixels (16:9)."
                  value={banner.image}
                  onChange={(v) => {
                    const newBanners = [...form.banners];
                    newBanners[index] = { ...banner, image: v || "" };
                    update({ banners: newBanners });
                  }}
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Link do banner (opcional)</span>
                  <input
                    type="text"
                    inputMode="url"
                    placeholder="https://..."
                    value={banner.link || ""}
                    onChange={(e) => {
                      const newBanners = [...form.banners];
                      newBanners[index] = { ...banner, link: e.target.value };
                      update({ banners: newBanners });
                    }}
                    className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Info */}
        <div className="space-y-4 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <CreditCard className="h-5 w-5 text-primary" /> Dados de Pagamento
          </h2>
          <p className="text-xs text-muted-foreground">
            Configure os dados de pagamento para renovação automática.
          </p>
          
          {form.paymentInfo ? (
            <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Dados cadastrados</span>
                <button
                  type="button"
                  onClick={() => update({ paymentInfo: null, paymentStatus: null })}
                  className="focusable flex items-center gap-1.5 text-xs text-destructive hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar
                </button>
              </div>
              
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">Nome do cliente</span>
                  <input
                    type="text"
                    value={form.paymentInfo.clienteNome}
                    onChange={(e) => update({ 
                      paymentInfo: { ...form.paymentInfo!, clienteNome: e.target.value } 
                    })}
                    className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div>
                  <span className="text-xs text-muted-foreground">Data de vencimento</span>
                  <input
                    type="date"
                    value={form.paymentInfo.dataVencimento}
                    onChange={(e) => update({ 
                      paymentInfo: { ...form.paymentInfo!, dataVencimento: e.target.value } 
                    })}
                    className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div>
                  <span className="text-xs text-muted-foreground">Valor do plano (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.paymentInfo.valorPlano}
                    onChange={(e) => update({ 
                      paymentInfo: { ...form.paymentInfo!, valorPlano: parseFloat(e.target.value) || 0 } 
                    })}
                    className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div>
                  <span className="text-xs text-muted-foreground">Usuário</span>
                  <input
                    type="text"
                    value={form.paymentInfo.usuario}
                    onChange={(e) => update({ 
                      paymentInfo: { ...form.paymentInfo!, usuario: e.target.value } 
                    })}
                    className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div>
                  <span className="text-xs text-muted-foreground">Link de pagamento</span>
                  <input
                    type="text"
                    value={form.paymentInfo.linkPagamento}
                    onChange={(e) => update({ 
                      paymentInfo: { ...form.paymentInfo!, linkPagamento: e.target.value } 
                    })}
                    className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                
                <div>
                  <span className="text-xs text-muted-foreground">Status do pagamento</span>
                  <select
                    value={form.paymentStatus || ""}
                    onChange={(e) => update({ 
                      paymentStatus: e.target.value || null 
                    })}
                    className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    <option value="pendente">Pendente</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="rejeitado">Rejeitado</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => update({
                paymentInfo: {
                  clienteNome: "",
                  dataVencimento: new Date().toISOString().split('T')[0],
                  valorPlano: 29.90,
                  usuario: "",
                  linkPagamento: "",
                  status: "pendente"
                },
                paymentStatus: "pendente"
              })}
              className="focusable flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50"
            >
              <Upload className="h-3.5 w-3.5" /> Adicionar dados de pagamento
            </button>
          )}
        </div>

        {/* Change password */}
        <div className="space-y-3 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="h-5 w-5 text-primary" /> Senha do admin
          </h2>
          <input
            type="password"
            placeholder="Nova senha (deixe vazio para manter)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="focusable flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-5 w-5" /> Salvar tudo</>}
        </button>

          <Link
            to="/login"
            className="focusable flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
          </Link>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                  <Users className="h-4 w-4 text-primary" /> Total
                </div>
                <div className="mt-2 text-2xl font-bold font-display text-foreground">{userStats.total}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{userStats.online} online agora</div>
              </div>

              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 text-green-400 text-xs font-semibold uppercase tracking-wider">
                  <UserCheck className="h-4 w-4" /> Ultimos 30 Dias
                </div>
                <div className="mt-2 text-2xl font-bold font-display text-green-400">{userStats.active30}</div>
                <div className="text-xs text-green-500/80 mt-0.5">usuários ativos</div>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                  <Clock className="h-4 w-4" /> Inativos (+30d)
                </div>
                <div className="mt-2 text-2xl font-bold font-display text-amber-400">{userStats.inactive30}</div>
                <div className="text-xs text-amber-500/80 mt-0.5">sem acesso recente</div>
              </div>

              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase tracking-wider">
                  <Ban className="h-4 w-4" /> Bloqueados
                </div>
                <div className="mt-2 text-2xl font-bold font-display text-destructive">{userStats.blocked}</div>
                <div className="text-xs text-destructive/80 mt-0.5">acesso suspenso</div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur space-y-4">
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                {/* Search Input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por usuário, DNS ou e-mail..."
                    className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* Period Filter */}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                  <select
                    value={periodFilter}
                    onChange={(e) => setPeriodFilter(e.target.value)}
                    className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-xs sm:text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="all">ðŸ“… Todos os períodos</option>
                    <option value="24h">Ultimas 24 horas</option>
                    <option value="7d">Ultimos 7 dias</option>
                    <option value="15d">Ultimos 15 dias</option>
                    <option value="30d">Ultimos 30 dias (Ativos)</option>
                    <option value="inactive30">âš ï¸ Inativos há mais de 30 dias</option>
                    <option value="never">âšª Nunca acessaram</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-xs sm:text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="all">Status: Todos</option>
                    <option value="active">ðŸŸ¢ Apenas Ativos</option>
                    <option value="blocked">ðŸ”´ Apenas Bloqueados</option>
                  </select>
                </div>
              </div>

              {/* Action Bar for Bulk Delete if filtered */}
              {(periodFilter !== "all" || statusFilter !== "all" || searchQuery) && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                  <div>
                    Exibindo <strong className="text-foreground">{filteredUsers.length}</strong> de <strong className="text-foreground">{usersList.length}</strong> usuários
                  </div>
                  {filteredUsers.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteFiltered}
                      disabled={deletingBulk}
                      className="flex items-center gap-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {deletingBulk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Excluir {filteredUsers.length} usuário(s) filtrados
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Users Table */}
            <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur overflow-x-auto">
              {loadingUsers ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center p-8 space-y-2">
                  <p className="text-sm font-medium text-foreground">Nenhum usuário encontrado para estes filtros.</p>
                  <p className="text-xs text-muted-foreground">Tente alterar o período ou termo de pesquisa acima.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg">Usuário / Servidor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Data Cadastro</th>
                      <th className="px-4 py-3">Ultimo Acesso</th>
                      <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((u) => {
                      const cleanUser = u.username || u.email.split("@")[0].split("_")[0];
                      let server = "-";
                      if (u.email && u.email.includes("@iptv.sync")) {
                        const parts = u.email.replace("@iptv.sync", "").split("_");
                        if (parts.length >= 2) server = parts.slice(1).join(":");
                      }

                      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
                      let lastText = "Nunca";
                      let isOnline = false;
                      let isRecent = false;

                      if (last) {
                        const diffMs = Date.now() - new Date(last).getTime();
                        const diffMin = Math.floor(diffMs / (60 * 1000));
                        const diffH = Math.floor(diffMs / (60 * 60 * 1000));
                        const diffD = Math.floor(diffMs / (24 * 60 * 60 * 1000));

                        isOnline = diffMin < 5;
                        isRecent = diffD <= 30;

                        if (isOnline) {
                          lastText = "Online agora";
                        } else if (diffMin < 60) {
                          lastText = `há ${diffMin} min`;
                        } else if (diffH < 24) {
                          lastText = `há ${diffH}h`;
                        } else if (diffD === 1) {
                          lastText = "ontem";
                        } else if (diffD <= 30) {
                          lastText = `há ${diffD} dias`;
                        } else {
                          lastText = `há ${diffD} dias (${new Date(last).toLocaleDateString()})`;
                        }
                      }

                      return (
                        <tr key={u.id} className={`hover:bg-secondary/20 transition-colors ${u.blocked ? "opacity-60" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground flex items-center gap-2">
                              {cleanUser}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {server !== "-" ? server : u.email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {u.blocked ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-md">
                                <Ban className="h-3 w-3" /> Bloqueado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-500 bg-green-500/10 px-2.5 py-1 rounded-md">
                                <ShieldCheck className="h-3 w-3" /> Ativo
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              {isOnline ? (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                              ) : isRecent ? (
                                <span className="h-2 w-2 rounded-full bg-green-500/60"></span>
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-muted-foreground/30"></span>
                              )}
                              <span className={isOnline ? "font-bold text-green-400" : isRecent ? "text-foreground font-medium" : "text-muted-foreground"}>
                                {lastText}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleBlockUser(u.id, u.blocked)}
                              className={`${u.blocked ? "text-green-500 hover:bg-green-500/10" : "text-amber-500 hover:bg-amber-500/10"} p-2 rounded-lg transition-colors flex items-center gap-1`}
                              title={u.blocked ? "Desbloquear Usuário" : "Bloquear Usuário"}
                            >
                              {u.blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </button>
                            {confirmDeleteId === u.id ? (
                              <div className="flex items-center gap-1 bg-destructive/20 border border-destructive/40 rounded-lg p-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="bg-destructive text-destructive-foreground text-xs px-2.5 py-1 rounded font-bold hover:bg-destructive/90 transition-all shadow-sm"
                                >
                                  Excluir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-muted-foreground text-xs px-2 py-1 hover:text-foreground transition-colors"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors flex items-center gap-1"
                                title="Excluir Usuário Permanentemente"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ImageField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Imagem muito grande", { description: "Escolha um arquivo de até 3 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        {help && <span className="block text-[11px] text-muted-foreground/70">{help}</span>}
      </div>
      <div className="flex items-center gap-3">
        <div 
          key={value || "empty"} 
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary/50"
        >
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <input
            type="text"
            placeholder="Cole uma URL ou envie um arquivo"
            value={value && !value.startsWith("data:") ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="focusable flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50"
            >
              <Upload className="h-3.5 w-3.5" /> Enviar
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="focusable flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

