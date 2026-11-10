import { Loader2, Check, AlertCircle, Zap } from "lucide-react";
import type { NetworkSpeedInfo } from "../hooks/use-network-speed";

export interface PreloadStep {
  label: string;
  done: boolean;
  error: boolean;
}

export function SplashPreloader({
  logo,
  background,
  steps,
  networkSpeed,
  fastMode,
  onSkip,
}: {
  logo?: string;
  background?: string;
  steps: PreloadStep[];
  networkSpeed?: NetworkSpeedInfo;
  fastMode?: boolean;
  onSkip?: () => void;
}) {
  const settled = steps.filter((s) => s.done || s.error).length;
  const pct = Math.round((settled / steps.length) * 100);
  const activeIndex = steps.findIndex((s) => !s.done && !s.error);

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6">
      {background && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <img src={background} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        </div>
      )}

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div>
          {logo ? (
            <img src={logo} alt="Logo" className="mb-6 h-20 w-auto max-w-[220px] object-contain drop-shadow-md" />
          ) : (
            <h1 className="mb-6 font-display text-4xl font-extrabold tracking-tight drop-shadow-md">
              FLOW<span className="text-gradient">TV</span>
            </h1>
          )}
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/80 backdrop-blur-sm">
          <div
            className="h-full rounded-full bg-gradient-primary shadow-[0_0_15px_rgba(6,182,212,0.5)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground drop-shadow">
          Carregando seu catálogo… {pct}%
        </p>

        {/* Skip Button */}
        {onSkip && (
          <button
            onClick={onSkip}
            className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <span>Pular carregamento</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
          </button>
        )}



        <ul className="mt-6 w-full space-y-2 text-left">
          {steps.map((step, i) => {
            const isActive = i === activeIndex;
            return (
              <li
                key={step.label}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-md transition-colors ${
                  step.done
                    ? "border-primary/50 bg-primary/20 text-foreground shadow-sm"
                    : step.error
                      ? "border-destructive/50 bg-destructive/20 text-foreground"
                      : isActive
                        ? "border-border bg-card/85 text-foreground shadow-md"
                        : "border-border/60 bg-card/50 text-muted-foreground"
                }`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center">
                  {step.done ? (
                    <Check className="h-5 w-5 text-primary" />
                  ) : step.error ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span className="flex-1 font-medium">{step.label}</span>
                <span className="text-xs text-muted-foreground">
                  {step.done ? "Pronto" : step.error ? "Falhou" : isActive ? "Carregando…" : "Aguardando"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
