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

import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, ArrowLeft, Star, Heart, Check, Plus, Info, ChevronDown, Volume2, VolumeX, Sparkles } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { VideoPlayer } from "../components/VideoPlayer";
import { useRequireAccount } from "../hooks/use-require-account";
import { useCachedQuery, accountKey } from "../lib/queries";
import { BRAND_CONFIGS, type BrandTheme, resolveBrand } from "../lib/brands";
import { getSeriesInfo, seriesStreamUrl, proxiedImage, type SeriesEpisode } from "../lib/xtream";
import { useFavorites, useWatchHistory } from "../hooks/use-supabase-data";
import { toast } from "sonner";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export const Route = createFileRoute("/series/$id")({
  validateSearch: (search: Record<string, string>) => ({
    from: search.from as string | undefined,
    brand: search.brand as string | undefined,
    play: search.play as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Série — FLOW TV" },
      { name: "description", content: "Detalhes, temporadas e episódios da série no FLOW TV." },
    ],
  }),
  component: SeriesDetailPage,
});

interface FlatEpisode extends SeriesEpisode {
  seasonNum: number;
}

function SeriesDetailPage() {
  const { from, brand, play } = Route.useSearch() || {};
  const navigate = useNavigate();
  
  const handleBack = () => {
    if (from) {
      navigate({ to: from });
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: "/series" });
    }
  };

  const { id } = useParams({ from: "/series/$id" });
  const { account, ready } = useRequireAccount();
  const key = accountKey(account);
  const seriesId = Number(id);

  // Fast cached query with 24-hour cache
  const info = useCachedQuery(`${key}:seriesinfo:${id}`, () => getSeriesInfo(account!, seriesId), {
    enabled: !!account,
    maxAgeMs: 24 * 60 * 60 * 1000,
  });

  const [season, setSeason] = useState<number | null>(null);
  const [current, setCurrent] = useState<FlatEpisode | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const lastSave = useRef(0);
  const hasUserSelectedSeasonRef = useRef(false);

  const { favorites, addFavorite, removeFavorite } = useFavorites();
  const { history, saveProgress } = useWatchHistory();

  const isFav = favorites.some(
    (f) => f.contentType === "series" && f.contentId === seriesId
  );

  const data = info.data;
  const title = data?.info?.name || "Série";
  const cover = proxiedImage(data?.info?.cover);
  const backdrop = proxiedImage(data?.info?.backdrop_path?.[0]) || cover;
  const synopsis = data?.info?.plot || data?.info?.description || "Acompanhe todos os episódios desta incrível série disponível com qualidade máxima no FLOW TV.";
  
  const activeBrand = resolveBrand(brand, title, from);

  const resume = history.find(
    (h) => h.contentType === "series" && h.contentId === seriesId
  );

  const seasonNumbers = useMemo(() => {
    if (!data?.episodes) return [];
    return Object.keys(data.episodes)
      .map(Number)
      .sort((a, b) => a - b);
  }, [data]);

  const flatEpisodes = useMemo<FlatEpisode[]>(() => {
    if (!data?.episodes) return [];
    return seasonNumbers.flatMap((sn) =>
      (data.episodes[String(sn)] || []).map((e) => ({ ...e, seasonNum: sn }))
    );
  }, [data, seasonNumbers]);

  useEffect(() => {
    if (season === null && seasonNumbers.length) {
      if (resume?.episodeId) {
        const ep = flatEpisodes.find((e) => e.id === resume.episodeId);
        if (ep) {
          setSeason(ep.seasonNum);
          return;
        }
      }
      setSeason(seasonNumbers[0]);
    }
  }, [seasonNumbers, season, resume, flatEpisodes]);

  const playEpisode = (ep: FlatEpisode, startAt = 0) => {
    setCurrent(ep);
  };

  const handleNext = () => {
    if (!current) return;
    const idx = flatEpisodes.findIndex(
      (e) => e.id === current.id && e.seasonNum === current.seasonNum
    );
    const next = flatEpisodes[idx + 1];
    if (next) {
      setCurrent(next);
      toast.success(`Próximo: ${next.title}`);
    } else {
      toast.info("Você chegou ao fim da série.");
      setCurrent(null);
    }
  };

  const handleProgress = useCallback(
    (pos: number, dur: number) => {
      if (!current) return;
      const now = Date.now();
      if (now - lastSave.current < 2000) return;
      lastSave.current = now;
      saveProgress({
        contentType: "series",
        contentId: seriesId,
        episodeId: current.id,
        title: `${title} — T${current.seasonNum}:E${current.episode_num}`,
        poster: cover || "",
        position: pos,
        duration: dur,
      });
    },
    [current, seriesId, title, cover, saveProgress]
  );

  const handlePause = useCallback(
    (pos: number, dur: number) => {
      if (!current) return;
      saveProgress({
        contentType: "series",
        contentId: seriesId,
        episodeId: current.id,
        title: `${title} — T${current.seasonNum}:E${current.episode_num}`,
        poster: cover || "",
        position: pos,
        duration: dur,
        _invalidate: true,
      });
    },
    [current, seriesId, title, cover, saveProgress]
  );

  const onFav = useCallback(() => {
    if (isFav) {
      removeFavorite({ contentType: "series", contentId: seriesId });
      toast.success("Removido dos favoritos");
    } else {
      addFavorite({
        contentType: "series",
        contentId: seriesId,
        title,
        poster: cover || "",
      });
      toast.success("Adicionado aos favoritos");
    }
  }, [isFav, seriesId, title, cover, removeFavorite, addFavorite]);

  if (!ready || !account) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#141414] text-white">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const episodesOfSeason = (season !== null && data?.episodes?.[String(season)]) || [];
  const resumeEpisode = resume?.episodeId
    ? flatEpisodes.find((e) => e.id === resume.episodeId)
    : flatEpisodes[0];

  const playlistIndex = current
    ? flatEpisodes.findIndex(
        (e) => String(e.id) === String(current.id) && e.seasonNum === current.seasonNum
      )
    : -1;
  const safePlaylistStartIndex = playlistIndex >= 0 ? playlistIndex : 0;

  useEffect(() => {
    if (play === "1" && resumeEpisode && !current) {
      setCurrent(resumeEpisode);
    }
  }, [play, resumeEpisode, current]);

  // If user came from standard site (no activeBrand), render standard FLOW TV AppShell layout
  if (!activeBrand) {
    return (
      <AppShell>
        {current && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col w-screen h-screen">
            <VideoPlayer
              source={{
                url: seriesStreamUrl(
                  account,
                  current.id,
                  current.container_extension || "mp4",
                  `${title} - T${current.seasonNum}E${current.episode_num}`
                ),
              }}
              title={`${title} — T${current.seasonNum}:E${current.episode_num} ${current.title}`}
              poster={proxiedImage(current.info?.movie_image) || cover}
              startPosition={resume?.episodeId === current.id ? resume.position : 0}
              knownDuration={parseDurationToSeconds(current.info?.duration_secs || current.info?.duration)}
              autoFullscreen
              onProgress={handleProgress}
              onPause={handlePause}
              onEnded={handleNext}
              onNext={handleNext}
              nextLabel="Próximo episódio"
              playlist={flatEpisodes.length > 1 ? flatEpisodes.map((ep) => ({
                url: seriesStreamUrl(account, ep.id, ep.container_extension || "mp4", `${title} - T${ep.seasonNum}E${ep.episode_num}`),
                title: `T${ep.seasonNum}:E${ep.episode_num} ${ep.title}`,
                smallTitle: title,
              })) : undefined}
              playlistStartIndex={safePlaylistStartIndex}
              onPlaylistIndex={(idx) => {
                const ep = flatEpisodes[idx];
                if (ep && (!current || String(ep.id) !== String(current.id))) {
                  setCurrent(ep);
                  setSeason(ep.seasonNum);
                }
              }}
              onExitFullscreen={() => setCurrent(null)}
              lockLandscape
            />
          </div>
        )}

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
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 via-60% to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent w-full md:w-3/4" />
          </div>

          {/* Back Button */}
          <div className="relative z-10 px-4 pt-4 lg:px-12">
            <button
              onClick={handleBack}
              className="focusable inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-black/80 text-white cursor-pointer transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
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
              <div>
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="relative z-10 self-start w-44 shrink-0 overflow-hidden rounded-xl border border-border shadow-card mx-auto md:mx-0">
                    {cover ? (
                      <img src={cover} alt={title} className="aspect-[2/3] w-full object-cover" />
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
                      {data?.info?.releaseDate && <span>{data.info.releaseDate}</span>}
                      {data?.info?.genre && <span>{data.info.genre}</span>}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      {resumeEpisode && (
                        <button
                          onClick={() => playEpisode(resumeEpisode, resume?.position || 0)}
                          className="btn-play focusable inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105 cursor-pointer"
                        >
                          <Play className="h-5 w-5" fill="currentColor" />
                          {resume ? "Continuar assistindo" : "Assistir"}
                        </button>
                      )}
                      {flatEpisodes[0] && resume && (
                        <button
                          onClick={() => playEpisode(flatEpisodes[0], 0)}
                          className="focusable inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition-transform hover:scale-105 cursor-pointer"
                        >
                          <Play className="h-5 w-5" />
                          Do começo
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
                  </div>
                </div>

                {/* Seasons & Episodes */}
                {seasonNumbers.length > 0 && (
                  <div className="mt-12">
                    <div className="mb-6 flex flex-wrap items-center gap-4">
                      <h2 className="font-display text-2xl font-bold">Episódios</h2>
                      <div className="relative">
                        <select
                          value={season ?? ""}
                          onChange={(e) => setSeason(Number(e.target.value))}
                          className="focusable appearance-none rounded-xl border border-white/20 bg-card py-2 pl-4 pr-10 text-sm font-semibold text-foreground backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                        >
                          {seasonNumbers.map((sn) => (
                            <option key={sn} value={sn} className="bg-background text-foreground">
                              Temporada {sn}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-12">
                      {episodesOfSeason.map((ep) => {
                        const isResumed = resume?.episodeId === ep.id;
                        return (
                          <button
                            key={ep.id}
                            onClick={() => playEpisode({ ...ep, seasonNum: season ?? 1 })}
                            className={`group flex flex-col overflow-hidden rounded-xl border bg-card p-2 text-left transition-all hover:scale-[1.02] hover:border-primary/60 cursor-pointer ${isResumed ? "border-primary shadow-glow" : "border-border"}`}
                          >
                            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary">
                              {ep.info?.movie_image ? (
                                <img
                                  src={proxiedImage(ep.info.movie_image)}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <span className="grid h-full w-full place-items-center">
                                  <Play className="h-8 w-8 text-muted-foreground" />
                                </span>
                              )}
                              <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                <Play className="h-10 w-10 text-white" fill="currentColor" />
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-bold truncate">
                                {ep.episode_num}. {ep.title}
                              </p>
                              {ep.info?.plot && (
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                  {ep.info.plot}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // Authentic Streaming Hub Experience (when opened from a streaming hub)
  return (
    <div className={`min-h-screen ${activeBrand.bgClass} selection:bg-white selection:text-black antialiased font-sans pb-16`}>
      {/* Active Video Player Modal */}
      {current && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col w-screen h-screen">
          <VideoPlayer
            source={{
              url: seriesStreamUrl(
                account,
                current.id,
                current.container_extension || "mp4",
                `${title} - T${current.seasonNum}E${current.episode_num}`
              ),
            }}
            title={`${title} — T${current.seasonNum}:E${current.episode_num} ${current.title}`}
            poster={proxiedImage(current.info?.movie_image) || cover}
            startPosition={resume?.episodeId === current.id ? resume.position : 0}
            knownDuration={parseDurationToSeconds(current.info?.duration_secs || current.info?.duration)}
            autoFullscreen
            onProgress={handleProgress}
            onPause={handlePause}
            onEnded={handleNext}
            onNext={handleNext}
            nextLabel="Próximo episódio"
            playlist={flatEpisodes.length > 1 ? flatEpisodes.map((ep) => ({
              url: seriesStreamUrl(account, ep.id, ep.container_extension || "mp4", `${title} - T${ep.seasonNum}E${ep.episode_num}`),
              title: `T${ep.seasonNum}:E${ep.episode_num} ${ep.title}`,
              smallTitle: title,
            })) : undefined}
            playlistStartIndex={safePlaylistStartIndex}
            onPlaylistIndex={(idx) => {
              const ep = flatEpisodes[idx];
              if (ep && (!current || String(ep.id) !== String(current.id))) {
                setCurrent(ep);
                setSeason(ep.seasonNum);
              }
            }}
            onExitFullscreen={() => setCurrent(null)}
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
              {activeBrand.seriesBadge}
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
            {data?.info?.releaseDate && <span>{data.info.releaseDate}</span>}
            <span className="border border-white/40 px-1 py-0.5 rounded text-[10px] text-white/90">
              16+
            </span>
            <span>{seasonNumbers.length} Temporada{seasonNumbers.length > 1 ? "s" : ""}</span>
            <span className="border border-white/30 px-1 py-0.2 rounded text-[9px] font-black tracking-wider text-white/70">
              ULTRA HD 4K
            </span>
          </div>

          <p className="text-xs sm:text-sm text-white/80 line-clamp-3 leading-relaxed max-w-xl font-normal drop-shadow">
            {synopsis}
          </p>

          <div className="flex items-center gap-3 pt-2">
            {resumeEpisode && (
              <button
                onClick={() => playEpisode(resumeEpisode, resume?.position || 0)}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-md font-bold text-sm text-white transition-all transform active:scale-95 shadow-lg ${activeBrand.accentBg} hover:opacity-90`}
              >
                <Play className="h-4 w-4 fill-white" />
                <span>{resume ? "Continuar T" + resumeEpisode.seasonNum + ":E" + resumeEpisode.episode_num : "Assistir"}</span>
              </button>
            )}

            <button
              onClick={onFav}
              className="flex items-center justify-center h-10 w-10 rounded-full border border-white/40 bg-black/40 hover:bg-white/20 text-white backdrop-blur-md transition-all active:scale-90"
              title={isFav ? "Remover da Lista" : "Minha Lista"}
            >
              {isFav ? <Check className="h-5 w-5 text-emerald-400" /> : <Plus className="h-5 w-5" />}
            </button>

            <button
              onClick={() => setShowInfoModal(true)}
              className="flex items-center justify-center h-10 w-10 rounded-full border border-white/40 bg-black/40 hover:bg-white/20 text-white backdrop-blur-md transition-all active:scale-90"
              title="Mais informações"
            >
              <Info className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Season Selector & Episodes List */}
      <section className="max-w-7xl mx-auto px-4 md:px-12 mt-8 space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h2 className="text-xl md:text-2xl font-black text-white tracking-wide">
            Episódios
          </h2>

          {seasonNumbers.length > 0 && (
            <div className="relative">
              <select
                value={season ?? ""}
                onChange={(e) => setSeason(Number(e.target.value))}
                className="appearance-none bg-[#242424] hover:bg-[#333] text-white font-bold text-sm px-4 py-2 pr-9 rounded-md border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors cursor-pointer"
              >
                {seasonNumbers.map((sn) => (
                  <option key={sn} value={sn} className="bg-[#242424] text-white font-semibold">
                    Temporada {sn}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-white/70" />
            </div>
          )}
        </div>

        {/* Episode Cards Grid / List */}
        {episodesOfSeason.length === 0 ? (
          <div className="py-12 text-center text-white/50 text-sm">
            Nenhum episódio disponível para esta temporada.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {episodesOfSeason.map((ep) => {
              const epNum = ep.episode_num;
              const epTitle = ep.title || `Episódio ${epNum}`;
              const epPlot = ep.info?.plot || "Sem sinopse disponível.";
              const epDuration = ep.info?.duration ? `${ep.info.duration}m` : "45m";
              const epImage = proxiedImage(ep.info?.movie_image) || cover;
              const isResumed = resume?.episodeId === ep.id;
              const progressPercent = isResumed && resume?.duration ? (resume.position / resume.duration) * 100 : 0;

              return (
                <div
                  key={ep.id}
                  onClick={() => playEpisode({ ...ep, seasonNum: season ?? 1 })}
                  className="group flex flex-col sm:flex-row items-start sm:items-center gap-4 py-4 px-2 hover:bg-white/5 rounded-xl cursor-pointer transition-colors"
                >
                  <span className="hidden sm:block text-lg font-black text-white/40 group-hover:text-white w-6 text-center shrink-0">
                    {epNum}
                  </span>

                  <div className="relative aspect-video w-full sm:w-44 shrink-0 rounded-lg overflow-hidden bg-[#222] border border-white/10">
                    {epImage ? (
                      <img
                        src={epImage}
                        alt={epTitle}
                        loading="lazy"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#222] text-xs text-white/50">
                        FLOW TV
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-black/70 border border-white/80 text-white shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="h-4 w-4 fill-white translate-x-0.5" />
                      </span>
                    </div>

                    {progressPercent > 0 && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                        <div className="h-full bg-[#E50914]" style={{ width: `${progressPercent}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-[#E50914] transition-colors line-clamp-1">
                        {epNum}. {epTitle}
                      </h3>
                      <span className="text-xs font-semibold text-white/60 shrink-0">
                        {epDuration}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-white/70 font-normal leading-relaxed line-clamp-2 sm:line-clamp-3">
                      {epPlot}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#181818] border border-white/10 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xl text-white">Sobre a Série</h3>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-white/60 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-white/80 leading-relaxed">{synopsis}</p>
            <div className="text-xs text-white/60 space-y-1 pt-2 border-t border-white/10">
              <p><strong className="text-white">Gênero:</strong> {data?.info?.genre || "Não informado"}</p>
              <p><strong className="text-white">Ano de Lançamento:</strong> {data?.info?.releaseDate || "2024"}</p>
              <p><strong className="text-white">Classificação:</strong> 16 anos (Violência, Linguagem)</p>
              <p><strong className="text-white">Áudio e Legendas:</strong> Português (Brasil) [5.1], Inglês</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
