function parseDurationToSeconds(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const match = str.match(/(\d+)\s*min/i);
  if (match) return parseInt(match[1], 10) * 60;
  return 0;
}

import { createFileRoute, useParams, useNavigate, Link } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, ArrowLeft, Star, Clock, Heart, Check, Plus, Info } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { VideoPlayer } from "../components/VideoPlayer";
import { useRequireAccount } from "../hooks/use-require-account";
import { useCachedQuery, accountKey } from "../lib/queries";
import { BRAND_CONFIGS, type BrandTheme, resolveBrand } from "../lib/brands";
import { getVodInfo, vodStreamUrl, proxiedImage } from "../lib/xtream";
import { useFavorites, useWatchHistory } from "../hooks/use-supabase-data";
import { toast } from "sonner";

export const Route = createFileRoute("/movie/$id")({
  validateSearch: (search: Record<string, string>) => ({
    from: search.from as string | undefined,
    brand: search.brand as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Filme — FLOW TV" },
      { name: "description", content: "Detalhes e reprodução do filme no FLOW TV." },
    ],
  }),
  component: MoviePage,
});

function MoviePage() {
  const { from, brand } = Route.useSearch() || {};
  const navigate = useNavigate();

  const handleBack = () => {
    if (from) {
      navigate({ to: from });
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: "/movies" });
    }
  };

  const { id } = useParams({ from: "/movie/$id" });
  const { account, ready } = useRequireAccount();
  const key = accountKey(account);
  const streamId = Number(id);

  const info = useCachedQuery(`${key}:vodinfo:${id}`, () => getVodInfo(account!, streamId), {
    enabled: !!account,
    maxAgeMs: 24 * 60 * 60 * 1000,
  });

  const [playing, setPlaying] = useState(false);
  const [startPosition, setStartPosition] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const lastSave = useRef(0);

  const { favorites, addFavorite, removeFavorite } = useFavorites();
  const { history, saveProgress } = useWatchHistory();

  const isFav = favorites.some(
    (f) => f.contentType === "movie" && f.contentId === streamId
  );

  const data = info.data;
  const ext = data?.movie_data?.container_extension || "mp4";
  const title = data?.movie_data?.name || "Filme";
  const poster = proxiedImage(data?.info?.movie_image);
  const backdrop = proxiedImage(data?.info?.backdrop_path?.[0]) || poster;
  const rawKnownDuration = parseDurationToSeconds(data?.info?.duration_secs || data?.movie_data?.duration_secs || data?.info?.duration || data?.movie_data?.duration);
  const [probedDur, setProbedDur] = useState(0);
  const knownDuration = probedDur || rawKnownDuration;

  const activeBrand = resolveBrand(brand, title, from);

  const resume = history.find(
    (h) => h.contentType === "movie" && h.contentId === streamId
  );

  const handlePlayResume = useCallback(() => {
    setStartPosition(resume?.position || 0);
    setPlaying(true);
  }, [resume]);

  const handlePlayFromBeginning = useCallback(() => {
    setStartPosition(0);
    setPlaying(true);
  }, []);

  const handleProgress = useCallback((pos: number, dur: number) => {
    const now = Date.now();
    if (now - lastSave.current < 2000) return;
    lastSave.current = now;
    saveProgress({
      contentType: "movie",
      contentId: streamId,
      title,
      poster: poster || "",
      position: pos,
      duration: dur,
    });
  }, [streamId, title, poster, saveProgress]);

  const handlePause = useCallback((pos: number, dur: number) => {
    saveProgress({
      contentType: "movie",
      contentId: streamId,
      title,
      poster: poster || "",
      position: pos,
      duration: dur,
      _invalidate: true,
    });
  }, [streamId, title, poster, saveProgress]);

  const onFav = useCallback(() => {
    if (isFav) {
      removeFavorite({ contentType: "movie", contentId: streamId });
      toast.success("Removido dos favoritos");
    } else {
      addFavorite({
        contentType: "movie",
        contentId: streamId,
        title,
        poster: poster || "",
      });
      toast.success("Adicionado aos favoritos");
    }
  }, [isFav, streamId, title, poster, removeFavorite, addFavorite]);

  if (!ready || !account) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Standard FLOW TV Layout for regular site browsing
  if (!activeBrand) {
    return (
      <AppShell>
        {playing ? (
          <div className="mx-auto max-w-5xl px-4 py-6 lg:px-12">
            <button
              onClick={() => setPlaying(false)}
              className="focusable mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <VideoPlayer
              source={{ url: vodStreamUrl(account, streamId, ext, title) }}
              title={title}
              poster={poster}
              startPosition={startPosition}
              knownDuration={knownDuration}
              autoFullscreen
              onProgress={handleProgress}
              onPause={handlePause}
              onExitFullscreen={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              lockLandscape
            />
          </div>
        ) : (
          <div className="relative min-h-[500px] overflow-hidden">
            {/* Seamless Backdrop Header without sharp cutoff lines */}
            <div className="absolute inset-0 h-[460px] w-full overflow-hidden pointer-events-none select-none">
              {backdrop && (
                <img
                  src={backdrop}
                  alt={title}
                  className="h-full w-full object-cover opacity-25 blur-[1px] scale-105 transform -translate-y-2"
                />
              )}
              {/* Full multi-stage gradient blending into background */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 via-60% to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent w-full md:w-3/4" />
            </div>

            {/* Back Button */}
            <div className="relative z-10 px-4 pt-4 lg:px-12">
              <button
                onClick={handleBack}
                className="focusable inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-black/80 text-white cursor-pointer transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Filmes
              </button>
            </div>

            {/* Content Area */}
            <div className="relative z-10 px-4 pt-6 pb-12 lg:px-12">
              {info.isLoading && !data ? (
                <div className="flex gap-6">
                  <div className="h-64 w-44 shrink-0 animate-pulse rounded-xl bg-card" />
                  <div className="flex-1 space-y-3 pt-8">
                    <div className="h-8 w-1/2 animate-pulse rounded bg-card" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-card" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 md:flex-row items-start">
                  <div className="relative z-10 mx-auto w-44 shrink-0 overflow-hidden rounded-xl border border-border shadow-card md:mx-0">
                    {poster ? (
                      <img src={poster} alt={title} className="aspect-[2/3] w-full object-cover" />
                    ) : (
                      <div className="grid aspect-[2/3] place-items-center bg-secondary text-muted-foreground">{title}</div>
                    )}
                  </div>

                  <div className="flex-1 pt-2">
                    <h1 className="font-display text-3xl font-extrabold lg:text-4xl">{title}</h1>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {data?.info?.rating && (
                        <span className="flex items-center gap-1 text-primary font-bold">
                          <Star className="h-4 w-4 fill-current" /> {data.info.rating}
                        </span>
                      )}
                      {data?.info?.releasedate && <span>{data.info.releasedate}</span>}
                      {data?.info?.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" /> {data.info.duration}
                        </span>
                      )}
                      {data?.info?.genre && <span>{data.info.genre}</span>}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      {resume ? (
                        <>
                          <button
                            onClick={handlePlayResume}
                            className="focusable inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105 cursor-pointer"
                          >
                            <Play className="h-5 w-5" fill="currentColor" />
                            Continuar assistindo
                          </button>
                          <button
                            onClick={handlePlayFromBeginning}
                            className="focusable inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition-transform hover:scale-105 cursor-pointer"
                          >
                            <Play className="h-5 w-5" />
                            Do começo
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={handlePlayFromBeginning}
                          className="focusable inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105 cursor-pointer"
                        >
                          <Play className="h-5 w-5" fill="currentColor" />
                          Assistir
                        </button>
                      )}
                      <button
                        onClick={onFav}
                        className="focusable inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 font-semibold transition-colors hover:border-primary/50 cursor-pointer"
                      >
                        <Heart className={`h-5 w-5 ${isFav ? "fill-primary text-primary" : ""}`} />
                      </button>
                    </div>

                    {data?.info?.plot && (
                      <div className="mt-6 max-w-3xl rounded-xl bg-card/80 p-4 shadow-card backdrop-blur">
                        <p className="text-sm leading-relaxed text-foreground/90">{data.info.plot}</p>
                      </div>
                    )}
                    {data?.info?.cast && (
                      <p className="mt-4 text-sm text-foreground/80 max-w-3xl">
                        <span className="font-semibold text-foreground">Elenco: </span>
                        {data.info.cast}
                      </p>
                    )}
                    {data?.info?.director && (
                      <p className="mt-1 text-sm text-foreground/80 max-w-3xl">
                        <span className="font-semibold text-foreground">Direção: </span>
                        {data.info.director}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </AppShell>
    );
  }

  // Authentic Streaming Hub Experience (when opened from a streaming hub)
  return (
    <div className={`min-h-screen ${activeBrand.bgClass} selection:bg-white selection:text-black antialiased font-sans pb-16`}>
      {playing && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col w-screen h-screen">
          <VideoPlayer
            source={{ url: vodStreamUrl(account, streamId, ext, title) }}
            title={title}
            poster={poster}
            startPosition={startPosition}
            knownDuration={knownDuration}
            autoFullscreen
            onProgress={handleProgress}
            onPause={handlePause}
            onExitFullscreen={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            lockLandscape
          />
        </div>
      )}

      {/* Hero Showcase with Platform Authentic Banner */}
      <div className="relative w-full h-[65vh] min-h-[460px] max-h-[700px] overflow-hidden select-none">
        {backdrop && (
          <img
            src={backdrop}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover object-center transform scale-105 duration-1000 ease-out"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-black/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/70 to-transparent w-full md:w-3/4" />

        {/* Back Button */}
        <div className="absolute top-4 left-4 md:left-8 z-30">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md text-white font-medium text-sm transition-all border border-white/10 hover:border-white/30"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar ao {activeBrand.name}</span>
          </button>
        </div>

        {/* Content Details */}
        <div className="absolute bottom-6 left-4 md:left-12 max-w-2xl z-20 space-y-3.5 pr-4">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-black tracking-widest uppercase rounded ${activeBrand.accentBg} text-white shadow`}>
              {activeBrand.movieBadge}
            </span>
            {data?.info?.genre && (
              <span className="text-xs text-white/70 font-medium">
                • {data.info.genre.split(",")?.[0]}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-none drop-shadow-md">
            {title}
          </h1>

          <div className="flex items-center flex-wrap gap-2.5 text-xs text-white/80 font-semibold">
            {data?.info?.rating && (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-emerald-400" /> {data.info.rating}
              </span>
            )}
            {data?.info?.releasedate && <span>{data.info.releasedate}</span>}
            {data?.info?.duration && <span>{data.info.duration}</span>}
            <span className="border border-white/40 px-1 py-0.5 rounded text-[10px] text-white/90">
              14+
            </span>
            <span className="border border-white/30 px-1 py-0.2 rounded text-[9px] font-black tracking-wider text-white/70">
              ULTRA HD 4K
            </span>
          </div>

          <p className="text-xs sm:text-sm text-white/80 line-clamp-3 leading-relaxed max-w-xl font-normal drop-shadow">
            {data?.info?.plot || "Assista a esta grande produção com qualidade máxima no FLOW TV."}
          </p>

          <div className="flex items-center gap-3 pt-2">
            {resume ? (
              <>
                <button
                  onClick={handlePlayResume}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-md font-bold text-sm text-white transition-all transform active:scale-95 shadow-lg ${activeBrand.accentBg} hover:opacity-90 cursor-pointer`}
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Continuar assistindo</span>
                </button>
                <button
                  onClick={handlePlayFromBeginning}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold text-sm transition-all border border-white/20 cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  <span>Do começo</span>
                </button>
              </>
            ) : (
              <button
                onClick={handlePlayFromBeginning}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-md font-bold text-sm text-white transition-all transform active:scale-95 shadow-lg ${activeBrand.accentBg} hover:opacity-90 cursor-pointer`}
              >
                <Play className="h-4 w-4 fill-white" />
                <span>Assistir</span>
              </button>
            )}

            <button
              onClick={onFav}
              className="flex items-center justify-center h-10 w-10 rounded-full border border-white/40 bg-black/40 hover:bg-white/20 text-white backdrop-blur-md transition-all active:scale-90 cursor-pointer"
              title={isFav ? "Remover da Lista" : "Minha Lista"}
            >
              {isFav ? <Check className="h-5 w-5 text-emerald-400" /> : <Plus className="h-5 w-5" />}
            </button>

            <button
              onClick={() => setShowInfoModal(true)}
              className="flex items-center justify-center h-10 w-10 rounded-full border border-white/40 bg-black/40 hover:bg-white/20 text-white backdrop-blur-md transition-all active:scale-90 cursor-pointer"
              title="Mais informações"
            >
              <Info className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Details & Info */}
      <section className="max-w-7xl mx-auto px-4 md:px-12 mt-8 space-y-6">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          <h2 className="text-xl font-bold text-white">Sobre o Filme</h2>
          <p className="text-sm text-white/80 leading-relaxed max-w-4xl">
            {data?.info?.plot || "Assista a esta grande produção com qualidade máxima no FLOW TV."}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/60 pt-4 border-t border-white/10">
            {data?.info?.cast && (
              <p><strong className="text-white">Elenco:</strong> {data.info.cast}</p>
            )}
            {data?.info?.director && (
              <p><strong className="text-white">Direção:</strong> {data.info.director}</p>
            )}
            {data?.info?.genre && (
              <p><strong className="text-white">Gênero:</strong> {data.info.genre}</p>
            )}
            {data?.info?.releasedate && (
              <p><strong className="text-white">Lançamento:</strong> {data.info.releasedate}</p>
            )}
          </div>
        </div>
      </section>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#181818] border border-white/10 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xl text-white">Sobre o Filme</h3>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-white/60 hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">{data?.info?.plot || "Assista com alta qualidade."}</p>
            <div className="text-xs text-white/60 space-y-1 pt-2 border-t border-white/10">
              <p><strong className="text-white">Gênero:</strong> {data?.info?.genre || "Não informado"}</p>
              <p><strong className="text-white">Ano:</strong> {data?.info?.releasedate || "2024"}</p>
              <p><strong className="text-white">Duração:</strong> {data?.info?.duration || "1h 50m"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
