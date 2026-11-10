import { type ReactNode, useState, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Tv,
  Film,
  MonitorPlay,
  Clapperboard,
  LogOut,
  Search,
  Heart,
  Ban,
  User,
  Clock,
  Sparkles,
  CreditCard,
  X,
  ShieldCheck,
  ExternalLink,
  Calendar,
  Smartphone,
  Loader2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "../hooks/use-account";
import { useSettings } from "../hooks/use-settings";
import { useIsMobile, isTvDevice } from "../hooks/use-mobile";

const NAV: { to: string; label: string; icon: typeof Tv; exact?: boolean }[] = [
  { to: "/", label: "Início", icon: MonitorPlay, exact: true },
  { to: "/live", label: "TV ao Vivo", icon: Tv },
  { to: "/movies", label: "Filmes", icon: Film },
  { to: "/series", label: "Séries", icon: Clapperboard },
  { to: "/favorites", label: "Favoritos", icon: Heart },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { account, userInfo, logout, isExpired } = useAccount();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { settings } = useSettings();
  const isMobile = useIsMobile();
  const isTV = isTvDevice();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);

  const hasBg = !!settings.background;

  const handleLogout = () => {
    setShowAccountModal(false);
    logout();
    navigate({ to: "/login" });
  };

  const usernameDisplay = userInfo?.username || account?.user || "Minha Conta";

  const handleOpenRenew = async () => {
    setRenewLoading(true);
    let payUrl = "";

    // 1. Tenta recuperar do localStorage
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("flowtv_user_pay_url");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.username === usernameDisplay && parsed.payUrl) {
            payUrl = parsed.payUrl;
          }
        }
      } catch (_) {}
    }

    // 2. Se não estiver no localStorage, busca dinamicamente no backend pelo usuário
    if (!payUrl && usernameDisplay && usernameDisplay !== "Minha Conta") {
      try {
        const res = await fetch(`/api/user-payurl?username=${encodeURIComponent(usernameDisplay)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.payUrl) {
            payUrl = data.payUrl;
            try {
              localStorage.setItem("flowtv_user_pay_url", JSON.stringify({ username: usernameDisplay, payUrl }));
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn("[AppShell] Falha ao buscar payUrl:", err);
      }
    }

    // 3. Fallback para a área de planos do site oficial
    if (!payUrl || payUrl.includes("undefined")) {
      payUrl = "https://flowtv.duckdns.org/#planos";
    }

    setRenewLoading(false);

    if (typeof window !== "undefined") {
      window.open(payUrl, "_system");
    }
  };

  // Sidebar collapsible for both PC and TV (all desktop/non-mobile devices)
  const isCollapsible = !isMobile;
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Formatação de data e hora de vencimento
  const formattedExpDate = userInfo?.exp_date
    ? new Date(Number(userInfo.exp_date) * 1000).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Acesso Ativo / Ilimitado";

  return (
    <div className={"relative flex min-h-screen " + (hasBg ? "bg-black" : "bg-background")}>
      {hasBg && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <img src={settings.background} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-background/85" />
        </div>
      )}
      <div className="relative z-10 flex min-h-screen w-full ">
      {/* Sidebar (desktop / TV) */}
      <aside 
        onMouseEnter={() => isCollapsible && setSidebarExpanded(true)}
        onMouseLeave={() => isCollapsible && setSidebarExpanded(false)}
        onFocusCapture={() => isCollapsible && setSidebarExpanded(true)}
        onBlurCapture={(e) => {
          if (isCollapsible && !e.currentTarget.contains(e.relatedTarget as Node)) {
            setSidebarExpanded(false);
          }
        }}
        className={"fixed top-0 left-0 z-50 h-screen shrink-0 flex-col border-none p-3 " + (isMobile ? "hidden pointer-events-none" : "flex") + " " + (
          isCollapsible 
            ? (sidebarExpanded ? "w-56 bg-sidebar/95 shadow-2xl backdrop-blur" : "w-16 bg-sidebar/70 backdrop-blur") 
            : "w-60 bg-sidebar"
        ) + " " + (isTV ? "tv-safe-sidebar" : "") + " transition-all duration-300 ease-out-expo"}
      >
        <Brand compact={isCollapsible && !sidebarExpanded} />
        <nav className="mt-8 flex flex-1 flex-col gap-1.5">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const isCollapsed = isCollapsible && !sidebarExpanded;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={isCollapsed ? item.label : undefined}
                style={{ color: '#FFFFFF' }}
                className={"focusable flex items-center rounded-xl py-2.5 text-sm font-bold transition-all duration-200 " + (
                  isCollapsed ? "justify-center px-0 w-11 mx-auto" : "gap-3.5 px-3.5 w-full"
                ) + " " + (
                  active
                    ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-[0_0_15px_rgba(0,229,255,0.3)]"
                    : "text-slate-100 hover:bg-[#172242] hover:text-white"
                )}
              >
                <item.icon className={"h-5 w-5 shrink-0 " + (active ? "text-cyan-400" : "text-white")} />
                {!isCollapsed && <span className="truncate text-white text-sm font-bold">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2">
          {/* Card do Usuário na Sidebar */}
          <button
            onClick={() => setShowAccountModal(true)}
            type="button"
            className={"focusable w-full text-left rounded-xl transition-all cursor-pointer " + (
              isCollapsible && !sidebarExpanded
                ? "p-2 flex justify-center bg-sidebar-accent/30 hover:bg-emerald-500/20"
                : "border border-sidebar-border/40 bg-sidebar-accent/40 p-3 hover:border-emerald-400/50 hover:bg-emerald-950/30"
            )}
            title={usernameDisplay}
          >
            {isCollapsible && !sidebarExpanded ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-black text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                <User className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-black text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-xs truncate">{usernameDisplay}</p>
                  <p className="text-emerald-300 text-[10px] truncate flex items-center gap-1 font-semibold">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formattedExpDate}</span>
                  </p>
                </div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={"flex min-w-0 flex-1 flex-col " + (isMobile ? "" : "ml-16") + " " + (isTV ? "tv-safe-main" : "")} style={isMobile ? { paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' } : undefined}>
        <header className={"sticky top-0 z-30 flex items-center gap-3 " + (isTV ? "border-b-0 bg-transparent" : "border-b border-white/5 bg-background/80") + " " + (isMobile ? "px-4 pt-7 pb-3.5" : "px-4 py-3 lg:px-8") + " backdrop-blur " + (isTV ? "tv-safe-header" : "")}>
          <div className={isMobile ? "block" : "hidden"}>
            <Brand compact />
          </div>
          
          {/* Botão de Busca */}
          <Link
            to="/search"
            style={{ backgroundColor: "#121A33", borderColor: "#24304F", color: "#FFFFFF" }} 
            className="focusable ml-auto flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-cyan-400"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Buscar canais, filmes e séries…</span>
            <span className="sm:hidden">Buscar</span>
          </Link>

          {/* Botão de Usuário no Topo (Substitui o botão de sair simples) */}
          <button
            onClick={() => setShowAccountModal(true)}
            type="button"
            style={{ backgroundColor: "#0E1A33", borderColor: "#10B981" }}
            className="focusable flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all hover:scale-105 hover:bg-emerald-950/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer"
            aria-label="Minha Conta e Vencimento"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-400 to-cyan-400 text-slate-950">
              <User className="h-3.5 w-3.5" />
            </div>
            <span className="max-w-[85px] sm:max-w-[130px] truncate">{usernameDisplay}</span>
          </button>
        </header>

        <main className={"flex-1 " + (isTV ? "tv-safe-content" : "")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* MODAL DE MINHA CONTA, VENCIMENTO E RENOVAÇÃO */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div
            style={{ backgroundColor: "#0B132B", borderColor: "#10B981" }}
            className="relative w-full max-w-md rounded-3xl border-2 p-6 sm:p-7 shadow-[0_0_60px_rgba(16,185,129,0.35)]"
          >
            {/* Fechar Modal */}
            <button
              type="button"
              onClick={() => setShowAccountModal(false)}
              className="absolute top-5 right-5 rounded-full bg-white/10 p-2 text-slate-400 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Cabeçalho */}
            <div className="text-center mb-5">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                <User className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-black text-white">Minha Assinatura</h3>
              <p className="text-xs text-slate-400 mt-0.5">Informações da sua conta no FLOW TV</p>
            </div>

            {/* Card com Detalhes da Conta */}
            <div className="rounded-2xl border border-white/10 bg-[#061024]/90 p-4 space-y-3 mb-5 shadow-inner">
              <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2.5">
                <span className="text-slate-400 font-medium">Usuário:</span>
                <span className="font-mono font-bold text-white text-base">{usernameDisplay}</span>
              </div>

              <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2.5">
                <span className="text-slate-400 font-medium">Status:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded-full">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Ativo
                </span>
              </div>

              <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2.5">
                <span className="text-slate-400 font-medium">Conexões:</span>
                <span className="font-bold text-slate-200 text-sm">
                  {userInfo?.max_connections ? `${userInfo.max_connections} Tela(s)` : "1 Conexão"}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm pt-0.5">
                <span className="text-amber-300 font-bold flex items-center gap-1.5 text-sm">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Vencimento:
                </span>
                <span className="font-black text-white text-xs sm:text-sm bg-amber-500/25 px-2.5 py-1 rounded-xl border border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                  {formattedExpDate}
                </span>
              </div>
            </div>

            {/* Botão de Renovação */}
            <div className="space-y-3">
              <button
                type="button"
                disabled={renewLoading}
                onClick={handleOpenRenew}
                style={{
                  background: renewLoading ? "#047857" : "linear-gradient(90deg, #10B981 0%, #059669 100%)",
                }}
                className="focusable flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-base font-black text-white shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-80"
              >
                {renewLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                    <span>Abrindo renovação...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 animate-pulse" />
                    <span>RENOVAR MEU PLANO AGORA</span>
                    <ExternalLink className="h-4 w-4 ml-1" />
                  </>
                )}
              </button>

              {/* Botão de Sair */}
              <button
                type="button"
                onClick={handleLogout}
                className="focusable flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-900/40 hover:text-white transition-all cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair da Conta (Trocar Usuário)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav className={"fixed inset-x-0 bottom-0 z-40 items-center justify-around border-t border-border bg-background/95 px-2 pt-2 backdrop-blur " + (isMobile ? "flex" : "hidden")} style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={"focusable flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium " + (
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { settings } = useSettings();
  
  return (
    <Link to="/" tabIndex={-1} className={"flex items-center justify-center " + (compact ? "w-10 mx-auto" : "gap-2.5")}>
      <div suppressHydrationWarning className="flex items-center justify-center w-full">
        {settings.logo ? (
          compact ? (
            <img
              src={settings.logo}
              alt="Logo"
              loading="eager"
              className="h-10 w-10 object-contain mx-auto"
            />
          ) : (
            <img
              src={settings.logo}
              alt="Logo"
              loading="eager"
              fetchPriority="high"
              className="h-9 w-auto max-w-[160px] object-contain"
            />
          )
        ) : (
          <>
            <span className={"grid place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow mx-auto " + (compact ? "h-10 w-10 shrink-0" : "h-9 w-9 shrink-0")}>
              <MonitorPlay className={compact ? "h-5 w-5" : "h-5 w-5"} />
            </span>
            {!compact && (
              <span className="font-display text-xl font-extrabold tracking-tight ml-2.5">
                FLOW<span className="text-gradient">TV</span>
              </span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}
