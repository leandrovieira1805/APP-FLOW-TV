import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MonitorPlay,
  Monitor,
  Loader2,
  User,
  Lock,
  Eye,
  EyeOff,
  Settings,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Trophy,
  Film,
  Tv,
  Sparkles,
  Phone,
  Clock,
  X,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import {
  authenticateWithDnsFallback,
  FlowApiError,
  ERROR_MESSAGES,
  getLiveStreams,
} from "../lib/xtream";
import { accountKey } from "../lib/queries";
import { useAccount } from "../hooks/use-account";
import { autoSyncLogin } from "../lib/auth";
import { useAuth } from "../hooks/use-auth";
import { useSettings } from "../hooks/use-settings";
import {
  getDeviceIdentifier,
  getLocalDeviceTrial,
  saveLocalDeviceTrial,
} from "../lib/deviceId";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — FLOW TV" },
      {
        name: "description",
        content: "Acesse sua lista IPTV no FLOW TV com usuário e senha ou crie sua conta de teste grátis.",
      },
    ],
  }),
  component: LoginPage,
});

function formatPhone(val: string) {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { login, logout, account, ready } = useAccount();
  const { settings } = useSettings();
  const auth = useAuth();
  const adminSettings = settings as typeof settings & {
    banner?: string;
    bannerUrl?: string;
    heroBanner?: string;
  };

  const isNative =
    typeof window !== "undefined" &&
    (window.location.protocol === "capacitor:" ||
      window.location.search.includes("native=true") ||
      navigator.userAgent.includes("FLOWTV-Native") ||
      (window as any).Capacitor?.isNativePlatform?.());

  const isTv =
    typeof window !== "undefined" &&
    (localStorage.getItem("device_type") === "tv" ||
      navigator.userAgent.includes("SmartTV") ||
      navigator.userAgent.includes("Android TV") ||
      navigator.userAgent.includes("TV"));

  const dnsList = useMemo(
    () => (settings.dnsList ?? []).map((dns) => dns.trim()).filter(Boolean),
    [settings.dnsList]
  );
  const banner = adminSettings.banner ?? adminSettings.bannerUrl ?? adminSettings.heroBanner ?? "";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("ENTRAR");

  // Modal Criar Conta / Teste
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [creatingTrial, setCreatingTrial] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState<{
    message: string;
    payUrl?: string;
    maskedPhone?: string;
  } | null>(null);

  const [createdTrial, setCreatedTrial] = useState<{
    username: string;
    password: string;
    expiresAt: string;
    customerName: string;
    payUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (ready && account) navigate({ to: "/" });
  }, [ready, account, navigate]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("error=expired")) {
      toast.error("Conta inativa ou vencida", {
        description:
          "Sua conta foi desativada ou expirou. Procure o provedor do aplicativo para mais detalhes.",
      });
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const executeLogin = async (userToAuth: string, passToAuth: string) => {
    if (dnsList.length === 0) {
      toast.error("Servidor não configurado", {
        description: "Peça ao administrador para cadastrar a DNS na página de Admin.",
      });
      return;
    }
    setLoading(true);
    setLoadingLabel("Conectando...");
    try {
      const { account: nextAccount, info } = await authenticateWithDnsFallback(dnsList, {
        username: userToAuth,
        password: passToAuth,
      });
      login(nextAccount, info);

      // Auto-create backend account for cross-device sync
      setLoadingLabel("Sincronizando...");
      const syncUser = await autoSyncLogin(userToAuth, passToAuth, nextAccount.base);
      if (syncUser) {
        window.dispatchEvent(new Event("auth-sync"));
      }

      setLoadingLabel("Carregando conteúdos...");

      const key = accountKey(nextAccount);
      const urgentPrefetches = [
        queryClient.prefetchQuery({
          queryKey: [`${key}:live:all`],
          queryFn: () => getLiveStreams(nextAccount),
          staleTime: 30 * 60 * 1000,
          gcTime: 60 * 60 * 1000,
        }),
      ];

      await Promise.allSettled(urgentPrefetches);

      toast.success(`Bem-vindo, ${info.username}!`);
      navigate({ to: "/" });
    } catch (err) {
      console.error("[Login] Erro ao autenticar:", err);
      if (err instanceof FlowApiError) {
        toast.error(err.message);
      } else {
        toast.error("Falha ao entrar", {
          description: "Verifique seu usuário e senha ou teste sua conexão de internet.",
        });
      }
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Preencha usuário e senha.");
      return;
    }
    await executeLogin(username.trim(), password.trim());
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const fName = firstName.trim();
    const lName = lastName.trim();
    const rawPhone = phone.replace(/\D/g, "");

    if (!fName) {
      toast.error("Por favor, informe seu nome.");
      return;
    }
    if (!lName) {
      toast.error("Por favor, informe seu sobrenome.");
      return;
    }
    if (!rawPhone || rawPhone.length < 10) {
      toast.error("Informe um WhatsApp / Telefone válido com DDD.");
      return;
    }

    setCreatingTrial(true);
    setDeviceBlocked(null);
    const fullName = `${fName} ${lName}`.trim();

    try {
      // Obtém o identificador único e persistente do aparelho
      const devId = await getDeviceIdentifier();

      // Checa se já existe registro local com outro número no mesmo aparelho
      const localTrial = getLocalDeviceTrial();
      if (localTrial && localTrial.phone && localTrial.phone !== rawPhone) {
        setDeviceBlocked({
          message:
            "Este aparelho já realizou um teste gratuito anteriormente. Não é permitido criar outra conta de teste no mesmo dispositivo com outro número.",
          payUrl: localTrial.payUrl || "https://flowtv.duckdns.org/#planos",
          maskedPhone:
            localTrial.phone.slice(0, 4) + "****" + localTrial.phone.slice(-2),
        });
        setCreatingTrial(false);
        return;
      }

      let trialResult: any = null;

      // 1. Envia requisição com Device ID para a API do Backend
      const res = await fetch("/api/generate-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: fullName,
          telefone: rawPhone,
          serverId: "primelux",
          deviceId: devId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Caso o servidor identifique que o dispositivo já utilizou teste com outro número
      if (res.status === 403 || data.blocked) {
        setDeviceBlocked({
          message:
            data.error ||
            "Este aparelho já utilizou o teste gratuito com outro número. Para continuar assistindo, renove o seu plano.",
          payUrl:
            data.existingTrial?.payUrl ||
            localTrial?.payUrl ||
            "https://flowtv.duckdns.org/#planos",
          maskedPhone: data.existingTrial?.maskedPhone,
        });
        setCreatingTrial(false);
        return;
      }

      if (res.ok && data && data.trial) {
        trialResult = data.trial;
        if (data.isExisting) {
          toast.info("Você já possui um teste criado neste aparelho!");
        }
      } else {
        throw new Error(data.error || "Não foi possível gerar o teste no momento.");
      }

      if (!trialResult || !trialResult.username || !trialResult.password) {
        throw new Error("Servidor não retornou as credenciais de acesso. Tente novamente.");
      }

      const generatedUser = trialResult.username;
      const generatedPass = trialResult.password;
      const expTime = trialResult.expiresAtFormatted || trialResult.expiresAt || "4 Horas";
      const payUrl = trialResult.payUrl || "https://flowtv.duckdns.org/#planos";

      // Salva localmente para bloquear tentativas subsequentes no mesmo aparelho
      saveLocalDeviceTrial({
        phone: rawPhone,
        username: generatedUser,
        password: generatedPass,
        expiresAt: expTime,
        payUrl: payUrl,
        customerName: fullName,
        createdAt: Date.now(),
      });

      try {
        localStorage.setItem("flowtv_user_payurl", payUrl);
      } catch {}

      setUsername(generatedUser);
      setPassword(generatedPass);

      setCreatedTrial({
        username: generatedUser,
        password: generatedPass,
        expiresAt: expTime,
        customerName: fullName,
        payUrl: payUrl,
      });

      toast.success("Conta de teste pronta para uso!");
    } catch (err: any) {
      console.error("[CreateAccount] Erro:", err);
      toast.error("Erro ao criar conta", {
        description: err.message || "Tente novamente em instantes.",
      });
    } finally {
      setCreatingTrial(false);
    }
  };

  const handleOpenRenewUrl = (url?: string) => {
    const targetUrl = url || "https://flowtv.duckdns.org/#planos";
    if (typeof window !== "undefined") {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#070b14] px-4 py-8">
      {/* Dynamic Background Image if configured */}
      {settings.background ? (
        <img
          src={settings.background}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(0,229,255,0.18),rgba(255,255,255,0))]" />
      )}

      {/* Decorative Glow Elements */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-emerald-500/15 blur-[120px]" />

      {/* Hidden Admin Entry Link */}
      <Link
        to="/admin"
        className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400 opacity-20 transition-all hover:bg-white/15 hover:text-white hover:opacity-100"
        title="Painel de Administração"
      >
        <Settings className="h-5 w-5" />
      </Link>

      <div className="relative z-10 w-full max-w-md">
        {/* Banner if configured */}
        {banner && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-cyan-500/30 shadow-[0_0_30px_rgba(0,229,255,0.2)]">
            <img src={banner} alt="Destaque" className="h-28 w-full object-cover sm:h-32" />
          </div>
        )}

        {/* Card Principal de Login */}
        <div className="rounded-3xl border border-white/10 bg-[#0B132B]/90 p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          {/* Logo & Header */}
          <div className="mb-6 flex flex-col items-center text-center">
            {settings.logo ? (
              <img
                src={settings.logo}
                alt="FLOW TV"
                className="mb-2 h-16 w-auto object-contain drop-shadow-[0_0_20px_rgba(0,229,255,0.4)]"
              />
            ) : (
              <>
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 shadow-[0_0_30px_rgba(0,229,255,0.5)]">
                  <MonitorPlay className="h-9 w-9 text-slate-950" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                  FLOW <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">TV</span>
                </h1>
              </>
            )}
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Sua TV Completa com Canais, Filmes e Séries
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Aviso se não houver DNS */}
            {dnsList.length === 0 && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center text-xs font-semibold text-amber-300">
                Nenhum servidor DNS configurado. Peça ao suporte para adicionar o servidor.
              </p>
            )}

            {/* Campo Usuário */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Usuário
              </label>
              <div
                style={{ backgroundColor: "#060B1A", borderColor: "#1E293B" }}
                className="group flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-white transition-all duration-300 focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(0,229,255,0.35)]"
              >
                <User className="h-5 w-5 shrink-0 text-cyan-400 group-focus-within:text-cyan-300 transition-colors" />
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="seu_usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-transparent text-base font-bold text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Senha
              </label>
              <div
                style={{ backgroundColor: "#060B1A", borderColor: "#1E293B" }}
                className="group flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-white transition-all duration-300 focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_rgba(0,229,255,0.35)]"
              >
                <Lock className="h-5 w-5 shrink-0 text-cyan-400 group-focus-within:text-cyan-300 transition-colors" />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-base font-bold text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="focusable text-slate-400 hover:text-cyan-300 p-1 transition-colors"
                  aria-label="Mostrar senha"
                >
                  {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Botão ENTRAR */}
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading
                  ? "#0284C7"
                  : "linear-gradient(90deg, #00E5FF 0%, #38BDF8 50%, #818CF8 100%)",
                color: loading ? "#FFFFFF" : "#040818",
              }}
              className="focusable flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-base font-black shadow-[0_0_35px_rgba(0,229,255,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-90 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                  <span className="text-white text-base font-bold tracking-wide">{loadingLabel}</span>
                </>
              ) : (
                <span className="text-[#040818] text-lg font-black tracking-wider">ENTRAR</span>
              )}
            </button>

            {/* Botão CRIAR CONTA (Abre o Formulário no App) */}
            <button
              type="button"
              onClick={() => {
                setCreatedTrial(null);
                setDeviceBlocked(null);
                setShowCreateModal(true);
              }}
              style={{ backgroundColor: "#064E3B", borderColor: "#10B981", color: "#FFFFFF" }}
              className="focusable flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-5 py-3.5 text-base font-bold text-white shadow-[0_0_25px_rgba(16,185,129,0.35)] hover:scale-[1.02] active:scale-[0.98] hover:bg-emerald-800 transition-all duration-300 cursor-pointer"
            >
              <Sparkles className="h-5 w-5 text-emerald-300 shrink-0 animate-pulse" />
              <span>Criar Conta</span>
            </button>

            {/* Links de Download (Apenas na versão Web) */}
            {!isNative && (
              <>
                <a
                  href="https://play.google.com/store/apps/details?id=com.flowtv.player&pcampaignid=web_share"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ backgroundColor: "#062817", borderColor: "#22C55E" }}
                  className="focusable flex w-full items-center justify-center gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-bold text-green-200 shadow-[0_0_20px_rgba(34,197,94,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a2.38 2.38 0 0 1-.61-.39 2.4 2.4 0 0 1-.72-1.796V4a2.4 2.4 0 0 1 .72-1.796c.18-.16.39-.29.609-.39zm11.233 11.236l2.39 2.39-11.895 6.868 9.505-9.258zm2.39-2.39l-2.39 2.39-9.505-9.258 11.895 6.868zm1.04 1.04l3.197 1.846c1.11.64 1.11 1.682 0 2.324l-3.197 1.846-2.072-2.008 2.072-2.008z" />
                  </svg>
                  <span>Baixar Aplicativo Android (Google Play)</span>
                </a>

                <a
                  href="/downloads/FLOW.apk"
                  download="FLOW.apk"
                  style={{ backgroundColor: "#081b2e", borderColor: "#0284c7" }}
                  className="focusable flex w-full items-center justify-center gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-bold text-sky-200 shadow-[0_0_20px_rgba(2,132,199,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                >
                  <Smartphone className="h-5 w-5 shrink-0 text-sky-400" />
                  <span>Baixar APK Direto (TV Box / Celular)</span>
                </a>
              </>
            )}
          </form>
        </div>

        {/* Feature Highlights */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-slate-900/40 p-3.5 backdrop-blur-md">
            <Tv className="mb-1.5 h-6 w-6 text-cyan-400" />
            <span className="text-xs font-bold text-slate-200">Canais Ao Vivo</span>
            <span className="text-[10px] text-slate-400">Qualidade 4K / FHD</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-slate-900/40 p-3.5 backdrop-blur-md">
            <Film className="mb-1.5 h-6 w-6 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200">Filmes & Séries</span>
            <span className="text-[10px] text-slate-400">Catálogo Atualizado</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-slate-900/40 p-3.5 backdrop-blur-md">
            <Trophy className="mb-1.5 h-6 w-6 text-amber-400" />
            <span className="text-xs font-bold text-slate-200">Futebol Ao Vivo</span>
            <span className="text-[10px] text-slate-400">Sem Travamentos</span>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          FLOW TV • Todos os direitos reservados
        </p>
      </div>

      {/* MODAL CRIAR CONTA / TESTE GRÁTIS */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0B132B] p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] text-center">
            {/* Fechar Modal */}
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false);
                setDeviceBlocked(null);
                setCreatedTrial(null);
              }}
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* CASO 1: BLOQUEIO DE DISPOSITIVO (Anti-Fraude Multi-Contas) */}
            {deviceBlocked ? (
              <div className="space-y-5 animate-in zoom-in-95 duration-200 py-2">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 ring-2 ring-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
                  <ShieldAlert className="h-9 w-9 text-rose-400 animate-bounce" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-2xl font-black text-white tracking-tight">
                    Aparelho Já Cadastrado
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed px-2">
                    {deviceBlocked.message}
                  </p>
                  {deviceBlocked.maskedPhone && (
                    <p className="text-xs text-slate-400 font-mono pt-1">
                      Cadastro anterior vinculado ao número:{" "}
                      <span className="text-rose-300 font-bold">
                        {deviceBlocked.maskedPhone}
                      </span>
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-xs text-rose-200 leading-relaxed text-left">
                  <p className="font-semibold text-rose-100 flex items-center gap-1.5 mb-1">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    Política de Teste Único:
                  </p>
                  Cada dispositivo tem direito a 1 teste gratuito. Para continuar com acesso ilimitado a todos os canais, filmes e séries, assine ou renove seu plano com liberação imediata.
                </div>

                {/* Botões de Ação */}
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenRenewUrl(deviceBlocked.payUrl)}
                    style={{
                      background: "linear-gradient(90deg, #10B981 0%, #059669 100%)",
                    }}
                    className="focusable flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-black text-white shadow-[0_0_35px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Sparkles className="h-5 w-5 text-emerald-200" />
                    <span>RENOVAR MEU PLANO AGORA</span>
                    <ExternalLink className="h-4 w-4 ml-1 text-emerald-200" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setDeviceBlocked(null);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                  >
                    <span>Entrar com Usuário e Senha</span>
                  </button>
                </div>
              </div>
            ) : createdTrial ? (
              /* CASO 2: CONTA CRIADA COM SUCESSO */
              <div className="space-y-5 animate-in zoom-in-95 duration-200">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 ring-2 ring-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 className="h-9 w-9 text-emerald-400" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-white tracking-tight">
                    Conta Criada com Sucesso!
                  </h3>
                  <p className="text-xs text-slate-300">
                    Olá, <strong className="text-emerald-400">{createdTrial.customerName}</strong>! Seu acesso teste já está liberado.
                  </p>
                </div>

                {/* Box de Informações de Acesso & Vencimento */}
                <div className="rounded-2xl border-2 border-emerald-500/50 bg-[#062017]/90 p-5 text-left space-y-3.5 shadow-inner">
                  <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2.5">
                    <span className="text-slate-300 font-medium">Usuário:</span>
                    <span className="font-mono font-black text-emerald-300 text-lg tracking-wider">
                      {createdTrial.username}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2.5">
                    <span className="text-slate-300 font-medium">Senha:</span>
                    <span className="font-mono font-black text-emerald-300 text-lg tracking-wider">
                      {createdTrial.password}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-amber-300 font-bold flex items-center gap-1.5 text-sm">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Válido até:
                    </span>
                    <span className="font-black text-white text-sm bg-amber-500/25 px-3 py-1 rounded-xl border border-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                      {createdTrial.expiresAt}
                    </span>
                  </div>
                </div>

                {/* Botão de Conectar Automático */}
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    executeLogin(createdTrial.username, createdTrial.password);
                  }}
                  style={{
                    background: "linear-gradient(90deg, #10B981 0%, #059669 100%)",
                  }}
                  className="focusable flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-lg font-black text-white shadow-[0_0_35px_rgba(16,185,129,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <MonitorPlay className="h-6 w-6" />
                  <span>CONECTAR NO APP AGORA</span>
                  <ArrowRight className="h-5 w-5 ml-1" />
                </button>
              </div>
            ) : (
              /* CASO 3: FORMULÁRIO DE CADASTRO */
              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="text-left mb-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Teste Grátis Imediato</span>
                  </div>
                  <h2 className="text-2xl font-black text-white">Criar Conta no FLOW TV</h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Preencha seus dados abaixo para gerar seu usuário e senha automaticamente.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Nome */}
                  <div className="space-y-1 text-left">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      Nome
                    </label>
                    <div
                      style={{ backgroundColor: "#060B1A", borderColor: "#1E293B" }}
                      className="flex items-center gap-2 rounded-2xl border-2 px-3.5 py-3 text-white focus-within:border-emerald-400 focus-within:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                    >
                      <User className="h-4 w-4 text-emerald-400 shrink-0" />
                      <input
                        type="text"
                        required
                        placeholder="Seu nome"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full bg-transparent text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Sobrenome */}
                  <div className="space-y-1 text-left">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      Sobrenome
                    </label>
                    <div
                      style={{ backgroundColor: "#060B1A", borderColor: "#1E293B" }}
                      className="flex items-center gap-2 rounded-2xl border-2 px-3.5 py-3 text-white focus-within:border-emerald-400 focus-within:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                    >
                      <User className="h-4 w-4 text-emerald-400 shrink-0" />
                      <input
                        type="text"
                        required
                        placeholder="Seu sobrenome"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full bg-transparent text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* WhatsApp / Telefone */}
                <div className="space-y-1 text-left">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Número de WhatsApp / Celular
                  </label>
                  <div
                    style={{ backgroundColor: "#060B1A", borderColor: "#1E293B" }}
                    className="flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3.5 text-white focus-within:border-emerald-400 focus-within:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
                  >
                    <Phone className="h-5 w-5 text-emerald-400 shrink-0" />
                    <input
                      type="tel"
                      required
                      placeholder="(11) 99999-9999"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      className="w-full bg-transparent text-base font-bold text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 pt-0.5">
                    Limite de 1 teste gratuito por aparelho.
                  </p>
                </div>

                {/* Botão Submeter */}
                <button
                  type="submit"
                  disabled={creatingTrial}
                  style={{
                    background: creatingTrial
                      ? "#047857"
                      : "linear-gradient(90deg, #10B981 0%, #059669 100%)",
                  }}
                  className="focusable flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-base font-black text-white shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-80 cursor-pointer"
                >
                  {creatingTrial ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                      <span>Verificando e gerando acesso...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      <span>GERAR MEU ACESSO GRÁTIS</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
