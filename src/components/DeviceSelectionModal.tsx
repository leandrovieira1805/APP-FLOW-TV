import { useState, useEffect } from "react";
import { Smartphone, Tv, Sparkles } from "lucide-react";
import { Capacitor } from "@capacitor/core";

export function DeviceSelectionModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isNative = Capacitor.isNativePlatform();
      const selected = localStorage.getItem("flowtv:device_mode_selected");
      if (isNative && !selected) {
        setOpen(true);
      }
    }
  }, []);

  if (!open) return null;

  const selectMode = (mode: "mobile" | "tv") => {
    try {
      localStorage.setItem("device_type", mode);
      localStorage.setItem("flowtv:device_mode_selected", "true");
    } catch {
      /* ignore */
    }
    setOpen(false);
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        style={{ backgroundColor: '#070C1E', borderColor: '#06B6D4' }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border-2 p-6 shadow-2xl sm:p-8"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />

        <div className="relative z-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500 text-slate-950 shadow-glow">
            <Sparkles className="h-8 w-8 text-slate-950" />
          </div>

          <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Qual o seu dispositivo?
          </h2>
          <p className="mt-2 text-sm text-slate-200">
            Escolha abaixo como você deseja navegar no <strong className="text-white">FLOW TV</strong>.
          </p>

          <div className="mt-6 space-y-3">
            {/* Opção Celular */}
            <button
              onClick={() => selectMode("mobile")}
              style={{ backgroundColor: '#131D38', borderColor: '#2A3859' }}
              className="focusable group flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all hover:border-cyan-400 hover:bg-[#1D2C52] focus:border-cyan-400 focus:bg-[#1D2C52]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 transition-transform group-hover:scale-110">
                <Smartphone className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">📱 Celular / Tablet</span>
                  <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                    Modo Mobile
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-300">
                  Interface compacta otimizada para telas de toque em pé.
                </p>
              </div>
            </button>

            {/* Opção TV */}
            <button
              onClick={() => selectMode("tv")}
              style={{ backgroundColor: '#131D38', borderColor: '#00E5FF' }}
              className="focusable group flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all hover:border-cyan-400 hover:bg-[#1D2C52] focus:border-cyan-400 focus:bg-[#1D2C52]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 shadow-glow transition-transform group-hover:scale-110">
                <Tv className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">📺 Smart TV / TV Box</span>
                  <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-[11px] font-bold text-slate-950">
                    Modo TV + Player Nativo
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-300">
                  Layout completo, navegação por controle remoto e player nativo (ExoPlayer).
                </p>
              </div>
            </button>
          </div>

          <p className="mt-6 text-xs text-slate-400">
            Você poderá alterar essa preferência depois nas configurações.
          </p>
        </div>
      </div>
    </div>
  );
}
