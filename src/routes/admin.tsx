import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  Building2,
  Lock,
  Loader2,
  ArrowLeft,
  Copy,
  Settings,
  Users,
  TrendingUp,
  Plus,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Server,
  Image,
  Megaphone,
  Upload,
  CreditCard,
  KeyRound,
  Save,
  UserCheck,
  Clock,
  Ban,
  Search,
  Calendar,
  Filter,
  Unlock,
  X,
  ExternalLink,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  verifyAdmin,
  getConfig,
  saveConfig,
  fetchProvidersList,
  saveProvider,
  deleteProvider,
  toggleProviderStatus,
  fetchUsersList,
  removeUser,
  toggleUserBlock,
  updateUserPayUrl,
  type Provider,
  type PublicConfig,
} from "../lib/config.functions";
import { saveSettings } from "../lib/storage";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

const Tabs = TabsPrimitive.Root;
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-11 items-center justify-center rounded-xl bg-secondary/50 p-1 text-muted-foreground border border-border/50",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-glow",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel de Administração — FLOW TV" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

interface FormState {
  logo?: string;
  background?: string;
  banner?: string;
  bannerLink: string;
  banners: Array<{ image: string; link?: string }>;
  dns: string[];
  paymentInfo?: {
    clientName?: string;
    dueDate?: string;
    planValue?: string;
    pixKey?: string;
    checkoutUrl?: string;
  } | null;
  paymentStatus?: string | null;
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
  onChange: (v?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Imagem muito grande", {
        description: "Escolha um arquivo de até 3 MB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-xs font-semibold text-muted-foreground uppercase">{label}</span>
        {help && <span className="block text-[11px] text-muted-foreground/75 mt-0.5">{help}</span>}
      </div>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary/50 shadow-inner">
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <Image className="h-6 w-6 text-muted-foreground/60" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <input
            type="text"
            placeholder="Cole uma URL ou envie um arquivo"
            value={value && !value.startsWith("data:") ? value : ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="focusable flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50"
            >
              <Upload className="h-3.5 w-3.5 text-primary" />
              Enviar imagem
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="focusable flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [providerCode, setProviderCode] = useState(() => {
    if (typeof window !== "undefined") {
      return (new URLSearchParams(window.location.search).get("p") || "").toUpperCase();
    }
    return "";
  });
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);
  const [selectedScope, setSelectedScope] = useState<string>("global");

  const [providersList, setProvidersList] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Partial<Provider> | null>(null);

  const [form, setForm] = useState<FormState>({
    bannerLink: "",
    banners: [],
    dns: ["", "", "", "", ""],
  });
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Link de pagamento individual
  const [editingPayUrlUser, setEditingPayUrlUser] = useState<any | null>(null);
  const [customPayUrlInput, setCustomPayUrlInput] = useState<string>("");
  const [savingPayUrl, setSavingPayUrl] = useState<boolean>(false);

  const loadIntoForm = async (scopeCode?: string, overrideIsSuper?: boolean) => {
    const targetScope = scopeCode !== undefined ? scopeCode : selectedScope;
    const isSuper = overrideIsSuper !== undefined ? overrideIsSuper : isSuperAdmin;

    const cfg = await getConfig(targetScope);
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
      const u = await fetchUsersList({
        data: {
          password: password.trim(),
          providerCode: targetScope,
          isSuperAdmin: isSuper,
        },
      });
      const seen = new Set<string>();
      const uniqueUsers = u.filter((user) => {
        const key = (user.username || user.email?.split("@")[0]?.split("_")[0] || "").trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setUsersList(uniqueUsers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadProviders = async () => {
    setLoadingProviders(true);
    try {
      const list = await fetchProvidersList();
      setProvidersList(list);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleSaveProviderModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider?.code?.trim() || !editingProvider?.name?.trim()) {
      toast.error("Preencha o código e o nome do provedor.");
      return;
    }
    const res = await saveProvider(editingProvider);
    if (res.ok) {
      toast.success("Provedor salvo com sucesso!");
      setShowProviderModal(false);
      setEditingProvider(null);
      await loadProviders();
    } else {
      toast.error(res.error || "Erro ao salvar provedor.");
    }
  };

  const handleToggleStatus = async (prov: Provider) => {
    const success = await toggleProviderStatus(prov.code, prov.status);
    if (success) {
      toast.success(`Status do provedor ${prov.code} alterado!`);
      await loadProviders();
    }
  };

  const handleDeleteProv = async (code: string) => {
    if (!confirm(`Deseja realmente excluir o provedor ${code} e TODOS os usuários vinculados a ele? Esta ação removerá tudo do Supabase.`)) return;
    try {
      const res = await deleteProvider(code);
      if (res.ok) {
        toast.success(`Provedor ${code} e todos os seus usuários foram excluídos do Supabase!`);
        await loadProviders();
        await loadUsers();
      } else {
        toast.error(res.message || `Erro ao excluir provedor ${code}.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir provedor.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await removeUser({
        data: {
          password: password.trim(),
          userId,
        },
      });
      toast.success("Usuário excluído do Supabase com sucesso");
      setUsersList((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDeleteId(null);
      await loadUsers();
    } catch (e) {
      toast.error("Erro ao excluir usuário");
      console.error(e);
    }
  };

  const handleToggleBlockUser = async (userId: string, isBlocked: boolean) => {
    try {
      const res = await toggleUserBlock({
        data: {
          password: password.trim(),
          userId,
        },
      });
      toast.success(res.message);
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, blocked: res.blocked } : u))
      );
    } catch (e) {
      toast.error("Erro ao alterar bloqueio do usuário.");
    }
  };

  const handleDeleteFiltered = async () => {
    if (filteredUsers.length === 0) return;
    if (
      !confirm(
        `Tem certeza que deseja excluir TODOS os ${filteredUsers.length} usuários filtrados? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }

    setDeletingBulk(true);
    let successCount = 0;
    try {
      for (const u of filteredUsers) {
        try {
          await removeUser({
            data: {
              password: password.trim(),
              userId: u.id,
            },
          });
          successCount++;
        } catch {}
      }
      toast.success(`${successCount} usuário(s) excluído(s) com sucesso.`);
      await loadUsers();
    } catch (e) {
      toast.error("Erro ao excluir usuários em massa.");
    } finally {
      setDeletingBulk(false);
    }
  };

  const userStats = {
    total: usersList.length,
    online: usersList.filter((u) => {
      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
      return last && Date.now() - new Date(last).getTime() < 5 * 60 * 1000;
    }).length,
    active30: usersList.filter((u) => {
      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
      return last && Date.now() - new Date(last).getTime() <= 30 * 24 * 60 * 60 * 1000;
    }).length,
    inactive30: usersList.filter((u) => {
      const last = u.lastActiveAt || (u.sessions && u.sessions[0]?.createdAt);
      return !last || Date.now() - new Date(last).getTime() > 30 * 24 * 60 * 60 * 1000;
    }).length,
    blocked: usersList.filter((u) => u.blocked).length,
  };

  const filteredUsers = usersList.filter((u) => {
    const rawUser = (u.username || u.email?.split("@")[0]?.split("_")[0] || "").toLowerCase();
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
      const res = await verifyAdmin({
        data: {
          password: password.trim(),
          providerCode: providerCode.trim() || undefined,
        },
      });

      if (!res.ok) {
        toast.error(res.error || "Acesso negado. Verifique os dados informados.");
        return;
      }

      setIsSuperAdmin(res.isSuperAdmin);
      setCurrentProvider(res.provider || null);

      const initialScope = res.isSuperAdmin ? "global" : res.provider?.code || "global";
      setSelectedScope(initialScope);
      await loadIntoForm(initialScope, res.isSuperAdmin);

      if (res.isSuperAdmin) {
        await loadProviders();
      }

      setAuthed(true);
      toast.success(
        res.isSuperAdmin ? "Bem-vindo, Super Administrador!" : `Bem-vindo, ${res.provider?.name}!`
      );
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
    const targetScope = isSuperAdmin ? selectedScope : currentProvider?.code || "global";

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

    qc.setQueryData(["app-config", targetScope], optimisticSettings);
    if (targetScope === "global") {
      saveSettings(optimisticSettings);
    }

    toast.success("Configurações salvas!", {
      description: `Alterações salvas para: ${targetScope === "global" ? "Padrão Global" : targetScope}`,
    });

    if (newPassword.trim()) {
      setPassword(newPassword.trim());
      setNewPassword("");
    }

    try {
      await saveConfig({
        data: {
          password: password.trim(),
          providerCode: targetScope,
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
            <p className="mt-2 text-sm text-muted-foreground">
              {providerCode
                ? `Acessando como provedor: ${providerCode}`
                : "Painel Super Admin ou Provedor Parceiro."}
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                Código do Provedor (Opcional)
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 transition-colors focus-within:border-primary">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Ex: PROV101 (Vazio = Super Admin)"
                  value={providerCode}
                  onChange={(e) => setProviderCode(e.target.value.toUpperCase())}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none uppercase"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                Senha de Acesso
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 transition-colors focus-within:border-primary">
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="Sua senha de administrador"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={checking}
            className="focusable flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar no Painel"}
          </button>
          <Link
            to="/login"
            className="focusable flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao login
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 max-w-7xl mx-auto">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-1/2 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      {/* Header bar */}
      <div className="relative z-10 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-foreground">Painel Administrativo</h1>
              {isSuperAdmin ? (
                <span className="rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-xs font-bold text-primary">
                  👑 Super Admin Master
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                  🏢 Provedor: {currentProvider?.code} ({currentProvider?.name})
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              FLOW TV Multi-Tenant &amp; Painel de Controle Integrado
            </p>
          </div>
        </div>

        {/* Scope selector & actions */}
        <div className="flex flex-wrap items-center gap-3">
          {isSuperAdmin && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Escopo:</span>
              <select
                value={selectedScope}
                onChange={async (e) => {
                  const newScope = e.target.value;
                  setSelectedScope(newScope);
                  await loadIntoForm(newScope);
                }}
                className="bg-transparent text-xs font-bold text-primary focus:outline-none cursor-pointer"
              >
                <option value="global" className="bg-card text-foreground">
                  🌐 Padrão Geral (Global)
                </option>
                <option value="ALL" className="bg-card text-foreground">
                  👥 Todos os Clientes (Visão Geral)
                </option>
                {providersList.map((p) => (
                  <option key={p.code} value={p.code} className="bg-card text-foreground">
                    🏢 {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Link
            to="/login"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary/30 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Ir ao App</span>
          </Link>

          <button
            type="button"
            onClick={() => setAuthed(false)}
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={isSuperAdmin ? "providers" : "settings"} className="relative z-10 space-y-6">
        <TabsList className="w-full sm:w-auto flex justify-start">
          {isSuperAdmin && (
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>Provedores &amp; Créditos</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>DNS &amp; Configurações</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Clientes &amp; Pagamentos</span>
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* ABA 1: PROVEDORES (Super Admin)                          */}
        {/* ======================================================== */}
        {isSuperAdmin && (
          <TabsContent value="providers" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Provedores Cadastrados
                  </p>
                  <p className="text-2xl font-black text-foreground mt-1">{providersList.length}</p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Clientes em Provedores
                  </p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {providersList.reduce((acc, p) => acc + (p.credits_used || 0), 0)}
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Users className="h-6 w-6" />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Créditos Totais Liberados
                  </p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {providersList.reduce((acc, p) => acc + (p.credits_limit || 0), 0)}
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Providers List Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-4 shadow-card backdrop-blur">
              <div>
                <h3 className="font-display text-base font-bold text-foreground">
                  Gerenciamento de Revendas &amp; Provedores
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cadastre novos parceiros, libere créditos e controle permissões.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingProvider({
                    code: "",
                    name: "",
                    admin_password: "admin" + Math.floor(100 + Math.random() * 900),
                    credits_limit: 50,
                    status: "active",
                    notes: "",
                  });
                  setShowProviderModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Novo Provedor
              </button>
            </div>

            {/* Providers Table */}
            <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur overflow-x-auto">
              {loadingProviders ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : providersList.length === 0 ? (
                <div className="text-center p-8 space-y-3">
                  <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium text-foreground">Nenhum provedor cadastrado ainda.</p>
                  <p className="text-xs text-muted-foreground">
                    Clique no botão &quot;Novo Provedor&quot; acima para cadastrar.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                    <tr>
                      <th className="px-4 py-3 rounded-tl-lg">Código / Link</th>
                      <th className="px-4 py-3">Nome da Revenda</th>
                      <th className="px-4 py-3">Senha Admin</th>
                      <th className="px-4 py-3">Créditos (Usados / Limite)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {providersList.map((prov) => {
                      const usagePercent = Math.min(
                        100,
                        Math.round(((prov.credits_used || 0) / (prov.credits_limit || 1)) * 100)
                      );
                      return (
                        <tr key={prov.code} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-mono font-bold text-primary flex items-center gap-1.5">
                              {prov.code}
                              <button
                                type="button"
                                title="Copiar link do provedor para clientes"
                                onClick={() => {
                                  const link = `${window.location.origin}/login?p=${prov.code}`;
                                  navigator.clipboard.writeText(link);
                                  toast.success(`Link copiado: ${link}`);
                                }}
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="text-[11px] text-muted-foreground">?p={prov.code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{prov.name}</div>
                            {prov.notes && (
                              <div className="text-[11px] text-muted-foreground">{prov.notes}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {prov.admin_password}
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-36 space-y-1">
                              <div className="flex justify-between text-xs font-semibold">
                                <span>{prov.credits_used || 0}</span>
                                <span className="text-muted-foreground">/ {prov.credits_limit}</span>
                              </div>
                              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    usagePercent >= 90
                                      ? "bg-destructive"
                                      : usagePercent >= 70
                                      ? "bg-amber-500"
                                      : "bg-primary"
                                  }`}
                                  style={{ width: `${usagePercent}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(prov)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                                prov.status === "active"
                                  ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                                  : "bg-destructive/15 text-destructive hover:bg-destructive/25"
                              }`}
                            >
                              {prov.status === "active" ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" />
                                  Ativo
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3" />
                                  Suspenso
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                title="Editar Provedor"
                                onClick={() => {
                                  setEditingProvider(prov);
                                  setShowProviderModal(true);
                                }}
                                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Excluir Provedor"
                                onClick={() => handleDeleteProv(prov.code)}
                                className="p-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>
        )}

        {/* ======================================================== */}
        {/* ABA 2: CONFIGURAÇÕES & DNS                               */}
        {/* ======================================================== */}
        <TabsContent value="settings" className="space-y-6 mx-auto max-w-2xl">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-primary uppercase">Escopo em Edição:</p>
              <p className="text-sm font-bold text-foreground">
                {selectedScope === "global"
                  ? "🌐 Padrão Geral (Global)"
                  : `🏢 Provedor: ${selectedScope}`}
              </p>
            </div>
            {selectedScope !== "global" && (
              <span className="text-xs text-muted-foreground">
                Configurações exclusivas para o código {selectedScope}
              </span>
            )}
          </div>

          {/* DNS Inputs */}
          <div className="space-y-4 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Server className="h-5 w-5 text-primary" />
              Servidores (DNS)
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

          {/* Aparência */}
          <div className="space-y-5 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Image className="h-5 w-5 text-primary" />
              Aparência
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
              label="Banner da tela de login"
              help="Tamanho recomendado: 800x200 pixels (4:1). Exibido acima do formulário de login."
              value={form.banner}
              onChange={(v) => update({ banner: v })}
            />

            {/* Banners rotativos */}
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Megaphone className="h-4 w-4 text-primary" />
                  Banners de Anúncio Rotativos
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      banners: [...form.banners, { image: "", link: "" }],
                    })
                  }
                  className="focusable flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Adicionar banner
                </button>
              </div>

              {form.banners.map((banner, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Banner {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newBanners = [...form.banners];
                        newBanners.splice(index, 1);
                        update({ banners: newBanners });
                      }}
                      className="focusable flex items-center gap-1.5 text-xs text-destructive hover:underline cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
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
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Link do banner (opcional)
                    </span>
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

          {/* Dados de Pagamento Padrão */}
          <div className="space-y-4 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <CreditCard className="h-5 w-5 text-primary" />
              Link Padrão de Renovação do Provedor
            </h2>
            <p className="text-xs text-muted-foreground">
              Link geral de checkout ou WhatsApp usado para renovação quando o cliente não tiver um link individual configurado.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  URL de Renovação Geral (Mercado Pago, Asaas, etc.)
                </label>
                <input
                  type="url"
                  placeholder="https://mpago.la/... ou https://flowtv.duckdns.org/#planos"
                  value={form.paymentInfo?.checkoutUrl || ""}
                  onChange={(e) =>
                    update({
                      paymentInfo: {
                        ...(form.paymentInfo || {}),
                        checkoutUrl: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Chave PIX ou Mensagem de Suporte (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="suporte@flowtv.com"
                  value={form.paymentInfo?.pixKey || ""}
                  onChange={(e) =>
                    update({
                      paymentInfo: {
                        ...(form.paymentInfo || {}),
                        pixKey: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none mt-1"
                />
              </div>
            </div>
          </div>

          {/* Trocar Senha Admin */}
          <div className="space-y-4 rounded-2xl border border-border bg-card/80 p-6 shadow-card backdrop-blur">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <KeyRound className="h-5 w-5 text-primary" />
              Alterar Senha do Administrador ({selectedScope === "global" ? "Master" : selectedScope})
            </h2>
            <input
              type="password"
              placeholder="Digite uma nova senha (deixe vazio para não alterar)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Botão Salvar */}
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 font-bold text-primary-foreground shadow-glow transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Salvar Configurações
          </button>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 3: CLIENTES & LINKS DE PAGAMENTO                     */}
        {/* ======================================================== */}
        <TabsContent value="users" className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                <Users className="h-4 w-4 text-primary" />
                Total
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-foreground">
                {userStats.total}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {userStats.online} online agora
              </div>
            </div>

            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 text-green-400 text-xs font-semibold uppercase tracking-wider">
                <UserCheck className="h-4 w-4" />
                Últimos 30 Dias
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-green-400">
                {userStats.active30}
              </div>
              <div className="text-xs text-green-500/80 mt-0.5">usuários ativos</div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                <Clock className="h-4 w-4" />
                Inativos (+30d)
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-amber-400">
                {userStats.inactive30}
              </div>
              <div className="text-xs text-amber-500/80 mt-0.5">sem acesso recente</div>
            </div>

            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase tracking-wider">
                <Ban className="h-4 w-4" />
                Bloqueados
              </div>
              <div className="mt-2 text-2xl font-bold font-display text-destructive">
                {userStats.blocked}
              </div>
              <div className="text-xs text-destructive/80 mt-0.5">acesso suspenso</div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur space-y-4">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-xs sm:text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">📅 Todos os períodos</option>
                  <option value="24h">Últimas 24 horas</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="15d">Últimos 15 dias</option>
                  <option value="30d">Últimos 30 dias (Ativos)</option>
                  <option value="inactive30">⚠️ Inativos há mais de 30 dias</option>
                  <option value="never">⚪ Nunca acessaram</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-xs sm:text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">Status: Todos</option>
                  <option value="active">🟢 Apenas Ativos</option>
                  <option value="blocked">🔴 Apenas Bloqueados</option>
                </select>
              </div>
            </div>

            {(periodFilter !== "all" || statusFilter !== "all" || searchQuery) && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <div>
                  Exibindo <strong className="text-foreground">{filteredUsers.length}</strong> de{" "}
                  <strong className="text-foreground">{usersList.length}</strong> usuários
                </div>
                {filteredUsers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteFiltered}
                    disabled={deletingBulk}
                    className="flex items-center gap-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {deletingBulk ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
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
                <p className="text-sm font-medium text-foreground">
                  Nenhum usuário encontrado para estes filtros.
                </p>
                <p className="text-xs text-muted-foreground">
                  Tente alterar o período ou termo de pesquisa acima.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/30">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Usuário / Servidor</th>
                    <th className="px-4 py-3">Provedor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Data Cadastro</th>
                    <th className="px-4 py-3">Último Acesso</th>
                    <th className="px-4 py-3 rounded-tr-lg text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u) => {
                    const cleanUser = u.username || u.email?.split("@")[0]?.split("_")[0];
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
                      <tr
                        key={u.id}
                        className={`hover:bg-secondary/20 transition-colors ${
                          u.blocked ? "opacity-60 bg-destructive/5" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            {cleanUser}
                            {u.payUrl && (
                              <span
                                title="Link exclusivo de pagamento configurado"
                                className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400"
                              >
                                <CreditCard className="h-3 w-3" />
                                Link Ativo
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {server !== "-" ? server : u.email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-mono font-bold text-primary">
                            <Building2 className="h-3 w-3" />
                            {u.providerCode || "global"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.blocked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-md">
                              <Ban className="h-3 w-3" />
                              Bloqueado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-500 bg-green-500/10 px-2.5 py-1 rounded-md">
                              <ShieldCheck className="h-3 w-3" />
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            {isOnline ? (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                              </span>
                            ) : isRecent ? (
                              <span className="h-2 w-2 rounded-full bg-green-500/60" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                            )}
                            <span
                              className={
                                isOnline
                                  ? "font-bold text-green-400"
                                  : isRecent
                                  ? "text-foreground font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {lastText}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Botão de Link de Pagamento Individual */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPayUrlUser(u);
                                setCustomPayUrlInput(u.payUrl || "");
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                                u.payUrl
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                                  : "bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25"
                              }`}
                              title="Configurar Link de Pagamento Específico para este Usuário"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                {u.payUrl ? "Link Ativo" : "Link Pagto"}
                              </span>
                            </button>

                            {/* Botão Bloquear / Desbloquear */}
                            <button
                              type="button"
                              onClick={() => handleToggleBlockUser(u.id, u.blocked)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                                u.blocked
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25"
                              }`}
                              title={
                                u.blocked
                                  ? "Clique para Desbloquear Usuário"
                                  : "Clique para Bloquear Usuário"
                              }
                            >
                              {u.blocked ? (
                                <>
                                  <Unlock className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Desbloquear</span>
                                </>
                              ) : (
                                <>
                                  <Ban className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Bloquear</span>
                                </>
                              )}
                            </button>

                            {/* Botão Excluir */}
                            {confirmDeleteId === u.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/90 cursor-pointer"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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

      {/* Modal: Cadastro/Edição de Provedor */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-bold text-foreground">
                  {editingProvider?.id ? "Editar Provedor" : "Cadastrar Novo Provedor"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProviderModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProviderModal} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Código do Provedor (ex: ALPHA, PROV101)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: PROV101"
                  disabled={!!editingProvider?.id}
                  value={editingProvider?.code || ""}
                  onChange={(e) =>
                    setEditingProvider((p) => ({
                      ...p,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                    }))
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none uppercase disabled:opacity-50"
                />
                <p className="text-[11px] text-muted-foreground/75">
                  Identificador único usado pelos clientes (?p=CODIGO).
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Nome da Revenda / Provedor
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alpha TV Streaming"
                  value={editingProvider?.name || ""}
                  onChange={(e) =>
                    setEditingProvider((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Senha de Acesso ao Painel Admin
                </label>
                <input
                  type="text"
                  required
                  placeholder="Senha do provedor"
                  value={editingProvider?.admin_password || ""}
                  onChange={(e) =>
                    setEditingProvider((p) => ({ ...p, admin_password: e.target.value }))
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 text-sm font-mono text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Limite de Créditos / Clientes Ativos
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  required
                  placeholder="Ex: 50"
                  value={editingProvider?.credits_limit || 50}
                  onChange={(e) =>
                    setEditingProvider((p) => ({
                      ...p,
                      credits_limit: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Observações / Contato (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="WhatsApp, chave pix, notas..."
                  value={editingProvider?.notes || ""}
                  onChange={(e) =>
                    setEditingProvider((p) => ({ ...p, notes: e.target.value }))
                  }
                  className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowProviderModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 cursor-pointer"
                >
                  Salvar Provedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link de Pagamento Específico por Usuário */}
      {editingPayUrlUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-bold">
                <CreditCard className="h-5 w-5 text-primary" />
                <span>Link de Pagamento do Cliente</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayUrlUser(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1 rounded-xl bg-secondary/40 p-3 text-xs">
              <p className="text-muted-foreground">
                Cliente: <strong className="text-foreground">{editingPayUrlUser.username}</strong>
              </p>
              <p className="text-muted-foreground">
                Provedor:{" "}
                <strong className="text-primary font-mono">
                  {editingPayUrlUser.providerCode || "global"}
                </strong>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                URL de Pagamento / Renovação (Mercado Pago, Asaas, PIX, etc.)
              </label>
              <input
                type="url"
                value={customPayUrlInput}
                onChange={(e) => setCustomPayUrlInput(e.target.value)}
                placeholder="https://mpago.la/... ou https://pay..."
                className="w-full rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Quando este cliente clicar em <strong>&quot;RENOVAR MEU PLANO AGORA&quot;</strong> na tela{" "}
                <em>Minha Assinatura</em>, este link exclusivo será aberto. Se deixar em branco, usará o link padrão do provedor.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingPayUrlUser(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPayUrl}
                onClick={async () => {
                  setSavingPayUrl(true);
                  try {
                    const res = await updateUserPayUrl({
                      data: {
                        password: password.trim(),
                        userId: editingPayUrlUser.id,
                        payUrl: customPayUrlInput.trim(),
                      },
                    });
                    if (res.ok) {
                      toast.success(res.message);
                      setUsersList((prev) =>
                        prev.map((usr) =>
                          usr.id === editingPayUrlUser.id
                            ? { ...usr, payUrl: customPayUrlInput.trim() }
                            : usr
                        )
                      );
                      setEditingPayUrlUser(null);
                    } else {
                      toast.error(res.message || "Erro ao atualizar link.");
                    }
                  } catch (err: any) {
                    toast.error(err?.message || "Erro ao salvar.");
                  } finally {
                    setSavingPayUrl(false);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {savingPayUrl ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>Salvar Link</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
