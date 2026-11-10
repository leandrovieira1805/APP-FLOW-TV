import { createContext, useContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadAccount, loadUserInfo, saveAccount, clearAccount } from "../lib/storage";
import { type Account, type UserInfo, isAccountExpired, parseExpiryDate, authenticate } from "../lib/xtream";
import { toast } from "sonner";

interface AccountContextValue {
  account: Account | null;
  userInfo: UserInfo | null;
  ready: boolean;
  isExpired: boolean;
  isBlocked: boolean;
  login: (account: Account, info: UserInfo) => void;
  logout: () => void;
  recheckAuth: () => Promise<boolean>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const checkAccountStatus = useCallback((acc: Account | null, info: UserInfo | null) => {
    if (!acc) return;
    if (isAccountExpired(info)) {
      setIsExpired(true);
    }
  }, []);

  const recheckAuth = useCallback(async (): Promise<boolean> => {
    const acc = loadAccount();
    if (!acc) return false;
    try {
      const freshInfo = await authenticate(acc);
      if (isAccountExpired(freshInfo) || (freshInfo as any).auth === 0) {
        setIsExpired(true);
        setUserInfo(freshInfo);
        return false;
      }
      setUserInfo(freshInfo);
      saveAccount(acc, freshInfo);
      setIsExpired(false);
      return true;
    } catch (e: any) {
      // Whenever authentication fails online (blocked on panel, expired, invalid, upstream error)
      if (typeof navigator === "undefined" || navigator.onLine) {
        setIsExpired(true);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    let intervalId: any;
    const acc = loadAccount();
    const info = loadUserInfo();
    setAccount(acc);
    setUserInfo(info);
    setReady(true);

    if (acc) {
      // Check stored expiry immediately
      checkAccountStatus(acc, info);

      // Record user login to Supabase for Admin dashboard
      import("../lib/config.functions").then(({ recordUserLogin }) => {
        recordUserLogin(acc.username, acc.base).then((allowed) => {
          if (!allowed) setIsBlocked(true);
        });
      });

      // Backend sync check
      import("../lib/auth").then(({ autoSyncLogin }) => {
        autoSyncLogin(acc.username, acc.password, acc.base)
          .catch((e) => {
            if (e.message === 'User is blocked') {
              setIsBlocked(true);
            }
          });
      });

      // Valida o status do cliente periodicamente (a cada 30 segundos)
      const verifyAuth = () => {
        recheckAuth();
      };

      verifyAuth();
      intervalId = setInterval(verifyAuth, 15000);
    }

    // Listen for events
    const handleBlocked = () => setIsBlocked(true);
    const handleAuthExpired = () => setIsExpired(true);
    const handleCheckAuth = () => { recheckAuth(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recheckAuth();
      }
    };

    window.addEventListener('user-blocked', handleBlocked);
    window.addEventListener('auth-expired', handleAuthExpired);
    window.addEventListener('check-auth', handleCheckAuth);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('user-blocked', handleBlocked);
      window.removeEventListener('auth-expired', handleAuthExpired);
      window.removeEventListener('check-auth', handleCheckAuth);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkAccountStatus, recheckAuth]);

  const login = useCallback((acc: Account, info: UserInfo) => {
    saveAccount(acc, info);
    setAccount(acc);
    setUserInfo(info);
    setIsBlocked(false);
    setIsExpired(isAccountExpired(info));
    import("../lib/config.functions").then(({ recordUserLogin }) => {
      recordUserLogin(acc.username, acc.base).then((allowed) => {
        if (!allowed) setIsBlocked(true);
      });
    });
  }, []);

  const logout = useCallback(() => {
    clearAccount();
    setAccount(null);
    setUserInfo(null);
    setIsBlocked(false);
    setIsExpired(false);
  }, []);

  const value = useMemo(
    () => ({ account, userInfo, ready, isExpired, isBlocked, login, logout, recheckAuth }),
    [account, userInfo, ready, isExpired, isBlocked, login, logout, recheckAuth],
  );

  // If user is blocked, show the blocked screen
  if (isBlocked) {
    return (
      <AccountContext.Provider value={value}>
        <BlockedScreen onLogout={logout} />
      </AccountContext.Provider>
    );
  }

  // If user account is expired, show the dedicated expired screen
  if (isExpired && account) {
    return (
      <AccountContext.Provider value={value}>
        <ExpiredScreen 
          account={account} 
          userInfo={userInfo} 
          onLogout={logout} 
          onRecheck={recheckAuth} 
        />
      </AccountContext.Provider>
    );
  }

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

function ExpiredScreen({
  account,
  userInfo,
  onLogout,
  onRecheck,
}: {
  account: Account;
  userInfo: UserInfo | null;
  onLogout: () => void;
  onRecheck: () => Promise<boolean>;
}) {
  const [checking, setChecking] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);

  const expMs = parseExpiryDate(userInfo?.exp_date);
  const formattedExpiry = expMs
    ? new Date(expMs).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const handleVerify = async () => {
    setChecking(true);
    const active = await onRecheck();
    setChecking(false);
    if (active) {
      toast.success("Conta ativa! Acesso liberado.");
    } else {
      toast.error("Assinatura ainda consta como vencida ou inativa.", {
        description: "Se já realizou a renovação, aguarde alguns instantes e tente novamente.",
      });
    }
  };

  const handleRenew = async () => {
    setRenewLoading(true);
    let payUrl = "";

    // 1. Tenta recuperar do localStorage
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("flowtv_user_pay_url");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.username === account.username && parsed.payUrl) {
            payUrl = parsed.payUrl;
          }
        }
      } catch (_) {}
    }

    // 2. Se não estiver no localStorage, busca dinamicamente no backend pelo usuário
    if (!payUrl && account.username) {
      try {
        const res = await fetch(`/api/user-payurl?username=${encodeURIComponent(account.username)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.payUrl) {
            payUrl = data.payUrl;
            try {
              localStorage.setItem("flowtv_user_pay_url", JSON.stringify({ username: account.username, payUrl }));
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn("[ExpiredScreen] Falha ao buscar payUrl:", err);
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030612] px-4 font-sans text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl space-y-6 animate-in fade-in zoom-in duration-300">
        
        {/* Animated warning icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Assinatura Vencida
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-md mx-auto">
            O período de acesso da sua conta expirou. Renove seu plano para liberar imediatamente seus canais, filmes e séries.
          </p>
        </div>

        {/* Account summary card */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-4 text-left text-xs sm:text-sm space-y-2.5 shadow-inner">
          <div className="flex justify-between items-center py-1 border-b border-white/5">
            <span className="text-slate-400">Usuário:</span>
            <span className="font-semibold text-white">{account.username}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-white/5">
            <span className="text-slate-400">Status:</span>
            <span className="inline-flex items-center gap-1 font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              Vencido / Inativo
            </span>
          </div>
          {formattedExpiry && (
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">Data de término:</span>
              <span className="font-medium text-slate-300">{formattedExpiry}</span>
            </div>
          )}
        </div>

        {/* Botão de Renovação Principal */}
        <button
          onClick={handleRenew}
          disabled={renewLoading}
          style={{
            background: renewLoading ? "#047857" : "linear-gradient(90deg, #10B981 0%, #059669 100%)",
          }}
          className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-black text-white shadow-xl shadow-emerald-500/35 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-80"
        >
          {renewLoading ? (
            <>
              <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span>Abrindo renovação...</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-200 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span>RENOVAR PLANO AGORA</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-emerald-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </>
          )}
        </button>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            onClick={handleVerify}
            disabled={checking}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {checking ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Verificando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                Já renovei (Verificar)
              </>
            )}
          </button>

          <button
            onClick={() => {
              onLogout();
              window.location.href = '/login';
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Trocar de Conta
          </button>
        </div>

      </div>
    </div>
  );
}

function BlockedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#030612] px-4 font-sans text-slate-100">
      <div className="w-full max-w-md text-center space-y-6 rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/30 shadow-lg shadow-red-500/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        
        {/* Title */}
        <h1 className="text-2xl font-bold text-white">
          Acesso Bloqueado
        </h1>
        
        {/* Message */}
        <p className="text-base text-slate-400 leading-relaxed">
          Sua conta foi bloqueada pelo administrador.
          <br />
          Entre em contato com o suporte para mais informações.
        </p>

        {/* Logout button */}
        <button
          onClick={() => {
            onLogout();
            window.location.href = '/login';
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-white/20 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sair da conta
        </button>
      </div>
    </div>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}
