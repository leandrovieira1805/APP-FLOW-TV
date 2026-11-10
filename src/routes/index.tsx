import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Play, Info, History, X } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { ContentCard } from "../components/ContentCard";
import { SeriesCard } from "../components/SeriesCard";
import { useRequireAccount } from "../hooks/use-require-account";
import { useSettings } from "../hooks/use-settings";
import { useCachedQuery, accountKey } from "../lib/queries";
import { getVodStreams, getSeries, getLiveStreams, proxiedImage, type Account, type SeriesItem } from "../lib/xtream";
import { useWatchHistory } from "../hooks/use-supabase-data";
import { SplashPreloader } from "../components/SplashPreloader";
import { useNetworkSpeed } from "../hooks/use-network-speed";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FLOW TV — Início" },
      { name: "description", content: "Canais ao vivo, filmes e séries com player inteligente no FLOW TV." },
    ],
  }),
  component: Home,
});

function Home() {
  const { account, ready } = useRequireAccount();
  const key = accountKey(account);
  const { settings } = useSettings();
  const network = useNetworkSpeed();

  const queryClient = useQueryClient();
  const movies = useCachedQuery(`${key}:vod:all`, () => getVodStreams(account!, undefined, "1"), { enabled: !!account });
  const series = useCachedQuery(`${key}:series:all`, () => getSeries(account!, undefined, "1"), { enabled: !!account });
  const live = useCachedQuery(`${key}:live:all`, () => getLiveStreams(account!), { enabled: !!account });

  const { history: progress = [], removeProgress: removeFromHistoryMutation } = useWatchHistory();

  const [userSkipped, setUserSkipped] = useState(false);

  const [loadedPart2, setLoadedPart2] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<{ contentType: "movie" | "series", contentId: number, title: string } | null>(null);

  useEffect(() => {
    if (movies.data && series.data && !loadedPart2) {
      setLoadedPart2(true);
      
      // Fetch Part 2 of movies in background
      getVodStreams(account!, undefined, "2").then((part2Movies) => {
        queryClient.setQueryData([`${key}:vod:all`], (old: any) => {
          const list = Array.isArray(old) ? old : [];
          const existingIds = new Set(list.map((item: any) => item.stream_id));
          const filteredPart2 = part2Movies.filter((item: any) => !existingIds.has(item.stream_id));
          return [...list, ...filteredPart2];
        });
      });

      // Fetch Part 2 of series in background
      getSeries(account!, undefined, "2").then((part2Series) => {
        queryClient.setQueryData([`${key}:series:all`], (old: any) => {
          const list = Array.isArray(old) ? old : [];
          const existingIds = new Set(list.map((item: any) => item.series_id));
          const filteredPart2 = part2Series.filter((item: any) => !existingIds.has(item.series_id));
          return [...list, ...filteredPart2];
        });
      });
    }
  }, [movies.data, series.data, loadedPart2]);

  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    if (movies.data && movies.data.length > 0 && featuredIndex === 0) {
      setFeaturedIndex(Math.floor(Math.random() * Math.min(movies.data.length, 30)));
    }
  }, [movies.data?.length]);

  const featured = useMemo(() => {
    const list = movies.data ?? [];
    const withImg = list.filter((m) => m.stream_icon);
    return withImg.length ? withImg[featuredIndex % withImg.length] : list[0];
  }, [movies.data, featuredIndex]);

    // If all categories are empty/errored while online, verify if account was blocked
  useEffect(() => {
    if (!movies.isLoading && !series.isLoading && !live.isLoading) {
      const allEmpty = (!movies.data || movies.data.length === 0) &&
                       (!series.data || series.data.length === 0) &&
                       (!live.data || live.data.length === 0);
      if (allEmpty && (typeof navigator === "undefined" || navigator.onLine)) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("check-auth"));
        }
      }
    }
  }, [movies.isLoading, series.isLoading, live.isLoading, movies.data, series.data, live.data]);

  // Check if any query failed with auth/expired error
  useEffect(() => {
    const errs = [movies.error, series.error, live.error];
    for (const err of errs) {
      if (err) {
        const msg = String((err as any)?.message || (err as any)?.code || "");
        if (msg.includes("ACCOUNT_EXPIRED") || msg.includes("INVALID_USER") || msg.includes("expirou") || (err as any)?.status === 401 || (err as any)?.status === 403) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("auth-expired"));
          }
        }
      }
    }
  }, [movies.error, series.error, live.error]);

  if (!ready || !account) {
    return (
      <SplashPreloader
        logo={settings.logo}
        background={settings.background}
        steps={[
          { label: "Conectando…", done: false, error: false },
          { label: "Canais ao vivo", done: false, error: false },
          { label: "Catálogo de filmes", done: false, error: false },
          { label: "Séries", done: false, error: false },
        ]}
      />
    );
  }

  const isDoneLoading = !movies.isLoading && !series.isLoading && !live.isLoading;
  const isPreloading = !isDoneLoading && !userSkipped;

  if (isPreloading) {
    return (
      <SplashPreloader
        logo={settings.logo}
        background={settings.background}
        networkSpeed={network}
        onSkip={() => setUserSkipped(true)}
        steps={[
          { label: "Canais ao vivo", done: !live.isLoading, error: !!live.isError },
          { label: "Catálogo de filmes", done: !movies.isLoading, error: !!movies.isError },
          { label: "Séries", done: !series.isLoading, error: !!series.isError },
        ]}
      />
    );
  }


  const removeFromHistory = (contentType: "movie" | "series", contentId: number) => {
    removeFromHistoryMutation({ contentType, contentId });
  };

  return (
    <>
      {/* Tela de Renovação desativada */}
      
      <AppShell>
        {/* Ad banner — at the top */}
        {(() => {
          // Tenta banners múltiplos primeiro, senão usa o banner único
          let bannersList: Array<{ image: string; link?: string }> = [];
          
          if (settings.banners && Array.isArray(settings.banners) && settings.banners.length > 0) {
            bannersList = settings.banners.filter((b: any) => {
              // More flexible check for banner image
              return b.image || b.banner || b.src || b.url;
            }).map((b: any) => ({
              image: b.image || b.banner || b.src || b.url,
              link: b.link || b.href || b.url
            }));
          } else if (settings.banner) {
            bannersList = [{ image: settings.banner, link: settings.bannerLink }];
          }
          
          if (bannersList.length > 0) {
            return (
              <div className="px-4 pt-6 lg:px-12 mb-6">
                <AdBanner banners={bannersList} />
              </div>
            );
          }
          
          // Debug banner placeholder
          return (
            <div className="px-4 pt-6 lg:px-12 mb-6">
              <div className="relative overflow-hidden rounded-2xl border border-dashed border-primary/30 p-8 text-center">
                <p className="text-muted-foreground">
                  Nenhum banner encontrado. Adicione um na página /admin!
                </p>
              </div>
            </div>
          );
        })()}

        {/* Hero */}
        {featured && (
          <div className="px-4 lg:px-12">
            <section className="relative h-[56vh] min-h-[380px] w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
              {featured.stream_icon && (
                <img
                  src={proxiedImage(featured.stream_icon)}
                  alt={featured.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              <div className="relative z-10 flex h-full flex-col justify-end p-6 lg:p-12">
                <div className="w-fit rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
                  Em destaque
                </div>
                <h1 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-white drop-shadow-lg lg:text-5xl">
                  {featured.name}
                </h1>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/movie/$id"
                    params={{ id: String(featured.stream_id) }}
                    className="focusable inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105"
                  >
                    <Play className="h-5 w-5" fill="currentColor" /> Assistir
                  </Link>
                  <Link
                    to="/movie/$id"
                    params={{ id: String(featured.stream_id) }}
                    className="focusable inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
                  >
                    <Info className="h-5 w-5" /> Detalhes
                  </Link>
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="space-y-10 px-4 py-8 lg:px-12">
          
          <StreamingRow />
        {/* Continue watching */}
        {progress.length > 0 && (
          <Row title="Continuar assistindo" icon={<History className="h-5 w-5 text-primary" />}>
            {progress.map((p) => (
              <div key={p.id} className="group/cw relative">
                <ContentCard
                  to={p.contentType === "movie" ? "/movie/$id" : "/series/$id"}
                  params={{ id: String(p.contentId) }}
                  title={p.title}
                  image={p.poster}
                  progress={p.duration ? p.position / p.duration : 0}
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setItemToRemove({ contentType: p.contentType, contentId: p.contentId, title: p.title });
                  }}
                  className="focusable absolute right-1.5 top-1.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-foreground shadow-lg ring-1 ring-white/20 transition-transform hover:scale-110 focus:scale-110 focus:bg-primary focus:ring-primary"
                  aria-label="Remover"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
          </Row>
        )}

        {/* Modal de confirmação */}
        {itemToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-card border border-white/10 p-6 shadow-2xl">
              <h3 className="mb-2 text-xl font-bold text-foreground">Remover do histórico</h3>
              <p className="mb-6 text-muted-foreground">
                Deseja mesmo remover "<strong>{itemToRemove.title}</strong>"?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  className="focusable rounded-full px-5 py-2.5 text-sm font-medium text-foreground bg-white/10 hover:bg-white/20 transition-colors focus:ring-2 focus:ring-white/30"
                  onClick={() => setItemToRemove(null)}
                >
                  Cancelar
                </button>
                <button
                  className="focusable rounded-full px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-glow focus:ring-2 focus:ring-red-400"
                  onClick={() => {
                    removeFromHistory(itemToRemove.contentType, itemToRemove.contentId);
                    setItemToRemove(null);
                  }}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        <RowSection
          title="Filmes em destaque"
          loading={movies.isLoading && !movies.data}
          to="/movies"
          toSearch={{ sort: "recent" }}
          items={(movies.data ?? []).slice(0, 18).map((m) => ({
            id: m.stream_id,
            to: "/movie/$id",
            title: m.name,
            image: m.stream_icon,
            rating: m.rating,
          }))}
        />

        <SeriesHomeRow loading={series.isLoading && !series.data} items={(series.data ?? []).slice(0, 18)} account={account} cacheKey={key} toSearch={{ sort: "recent" }} />

        <LiveChannelsRow />
      </div>
    </AppShell>
    </>
  );
}

function Row({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-xl font-black text-white tracking-wide">{title}</h2>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto pb-2 no-scrollbar lg:-mx-12">
        {Array.isArray(children) ? (
          children.map((c, i) => (
            <div key={i} className="w-32 shrink-0 sm:w-40 first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12">
              {c}
            </div>
          ))
        ) : (
          <div className="first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12">{children}</div>
        )}
      </div>
    </section>
  );
}

interface RowItem {
  id: number;
  to: string;
  title: string;
  image?: string;
  rating?: string;
}

function RowSection({
  title,
  items,
  loading,
  to,
  toSearch,
  wide,
}: {
  title: string;
  items: RowItem[];
  loading: boolean;
  to: string;
  toSearch?: Record<string, string>;
  wide?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-black text-white tracking-wide">{title}</h2>
        <Link to={to as never} search={toSearch} className="focusable text-sm font-medium text-primary hover:underline">
          Ver tudo
        </Link>
      </div>
      {loading ? (
        <div className="-mx-4 flex gap-4 overflow-hidden lg:-mx-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`shrink-0 animate-pulse rounded-xl bg-card first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12 ${wide ? "aspect-video w-56" : "aspect-[2/3] w-32 sm:w-40"}`}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum conteúdo disponível.</p>
      ) : (
        <div className="-mx-4 flex gap-4 overflow-x-auto pb-2 no-scrollbar lg:-mx-12">
          {items.map((item) => (
            <div key={item.id} className={`shrink-0 first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12 ${wide ? "w-56" : "w-32 sm:w-40"}`}>
              <ContentCard
                to={item.to}
                params={{ id: String(item.id) }}
                title={item.title}
                image={item.image}
                rating={item.rating}
                wide={wide}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SeriesHomeRow({
  items,
  loading,
  account,
  cacheKey,
  toSearch,
}: {
  items: SeriesItem[];
  loading: boolean;
  account: Account;
  cacheKey: string;
  toSearch?: Record<string, string>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Séries populares</h2>
        <Link to="/series" search={toSearch} className="focusable text-sm font-medium text-primary hover:underline">
          Ver tudo
        </Link>
      </div>
      {loading ? (
        <div className="-mx-4 flex gap-4 overflow-hidden lg:-mx-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] w-32 shrink-0 animate-pulse rounded-xl bg-card sm:w-40 first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum conteúdo disponível.</p>
      ) : (
        <div className="-mx-4 flex gap-4 overflow-x-auto pb-2 no-scrollbar lg:-mx-12">
          {items.map((item) => (
            <div key={item.series_id} className="w-32 shrink-0 sm:w-40 first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12">
              <SeriesCard account={account} cacheKey={cacheKey} series={item} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const STREAMING_PLATFORMS = [
  { id: "netflix", name: "Netflix", color: "bg-black focus:ring-[#E50914]", image: "/logos/netflix.jpg", imgClass: "object-cover" },
  { id: "prime", name: "Prime Video", color: "bg-[#0F172A] focus:ring-[#00A8E1]", image: "/logos/prime.jpg", imgClass: "object-cover scale-125" },
  { id: "disney", name: "Disney+", searchName: "Disney", color: "bg-[#040714] border border-white/10 focus:ring-white", image: "/logos/disney.jpg", imgClass: "object-cover scale-[1.7]" },
  { id: "max", name: "Max", color: "bg-[#002B7F] focus:ring-[#002B7F]", image: "/logos/max.jpg", imgClass: "object-cover" },
  { id: "globoplay", name: "Globoplay", color: "bg-white border border-white/10 focus:ring-white", image: "/logos/globoplay.jpg", imgClass: "object-cover scale-110" },
  { id: "appletv", name: "Apple TV+", color: "bg-black border border-white/10 focus:ring-white", image: "/logos/appletv.jpg", imgClass: "object-cover" },
  { id: "paramount", name: "Paramount+", searchName: "Paramount", color: "bg-[#0064FF] focus:ring-[#0064FF]", image: "/logos/paramount.jpg", imgClass: "object-cover" },
  { id: "crunchyroll", name: "Crunchyroll", color: "bg-[#F47521] focus:ring-[#F47521]", image: "/logos/crunchyroll.png", imgClass: "object-cover" },
];

function StreamingRow() {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-xl font-black text-white tracking-wide">Streaming</h2>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto py-4 no-scrollbar lg:-mx-12">
        {STREAMING_PLATFORMS.map((platform) => (
          <Link
            key={platform.name}
            to="/hub/$brand"
            params={{ brand: platform.id }}
            className="focusable group flex flex-col items-center gap-2 shrink-0 first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12"
          >
            <div className={`relative flex h-20 w-40 items-center justify-center overflow-hidden rounded-2xl shadow-lg transition-transform group-hover:scale-105 group-focus:scale-105 group-focus:ring-2 group-focus:ring-offset-2 group-focus:ring-offset-background ${platform.color}`}>
              <img src={platform.image} alt={platform.name} className={`h-full w-full ${platform.imgClass}`} />
            </div>
            <span className="text-sm font-medium text-white/80 transition-colors group-hover:text-white group-focus:text-white">
              {platform.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function AdBanner({ banners }: { banners: Array<{ image: string; link?: string }> }) {
  // Filtra apenas banners válidos
  const validBanners = banners.filter(b => b && b.image && b.image.trim());
  
  if (validBanners.length === 0) return null;
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Preload da próxima imagem para eliminar delay na transição
  useEffect(() => {
    if (validBanners.length <= 1) return;
    const nextIndex = (currentIndex + 1) % validBanners.length;
    const img = new Image();
    img.src = validBanners[nextIndex].image;
  }, [currentIndex, validBanners]);

  useEffect(() => {
    // Reset estado ao trocar de banner
    setImageLoaded(false);
    setImageError(false);
  }, [currentIndex]);

  // Se imagem falhou, pula automaticamente para o pr??ximo banner em 500ms
  useEffect(() => {
    if (!imageError) return;
    if (validBanners.length <= 1) return;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % validBanners.length);
    }, 500);
    return () => clearTimeout(timer);
  }, [imageError, validBanners.length]);

  useEffect(() => {
    if (validBanners.length <= 1) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % validBanners.length);
        setIsTransitioning(false);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, [validBanners.length]);

  const currentBanner = validBanners[currentIndex];

  const content = (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-primary/30 shadow-glow bg-black/20"
      style={{ aspectRatio: '16/5', minHeight: '120px', maxHeight: '50vh' }}
    >
      <span className="absolute left-3 top-3 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90">
        Anúncio
      </span>

      {/* Skeleton — visível enquanto a imagem carrega */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded-2xl" />
      )}

      {!imageError ? (
        <img
          key={currentBanner.image}
          src={currentBanner.image}
          alt="Anúncio"
          fetchPriority="high"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isTransitioning || !imageLoaded ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => { setImageError(true); setImageLoaded(true); }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-secondary p-3 text-center">
          <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium text-muted-foreground">Anúncio</span>
        </div>
      )}

      {/* Indicadores */}
      {validBanners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {validBanners.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setIsTransitioning(true);
                setTimeout(() => {
                  setCurrentIndex(index);
                  setIsTransitioning(false);
                }, 300);
              }}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (currentBanner.link) {
    return (
      <a href={currentBanner.link} target="_blank" rel="noopener noreferrer" className="block" tabIndex={-1}>
        {content}
      </a>
    );
  }
  return content;
}





const LIVE_NETWORKS = [
  { name: "Premiere", searchName: "Premiere", color: "bg-gradient-to-br from-[#004D25] to-[#002814] border border-emerald-500/40 focus:ring-emerald-500", logoText: "PREMIERE", badgeColor: "text-emerald-400 font-black tracking-widest text-lg" },
  { name: "SporTV", searchName: "SporTV", color: "bg-gradient-to-br from-[#003882] to-[#001D47] border border-blue-500/40 focus:ring-blue-500", logoText: "sportv", badgeColor: "text-blue-400 font-extrabold italic tracking-tight text-xl" },
  { name: "ESPN", searchName: "ESPN", color: "bg-gradient-to-br from-[#D90000] to-[#800000] border border-red-500/40 focus:ring-red-500", logoText: "ESPN", badgeColor: "text-white font-black italic tracking-wider text-2xl" },
  { name: "HBO", searchName: "HBO", color: "bg-gradient-to-br from-[#2D006B] to-[#12002E] border border-purple-500/40 focus:ring-purple-500", logoText: "HBO", badgeColor: "text-white font-black tracking-widest text-2xl" },
  { name: "Combate", searchName: "Combate", color: "bg-gradient-to-br from-[#800000] to-[#3B0000] border border-red-600/40 focus:ring-red-600", logoText: "COMBATE", badgeColor: "text-red-500 font-black tracking-widest text-lg" },
  { name: "Prime Video", searchName: "Prime", color: "bg-gradient-to-br from-[#00A8E1] to-[#00354E] border border-cyan-500/40 focus:ring-cyan-500", logoText: "prime video", badgeColor: "text-white font-bold text-lg" },
  { name: "Paramount+", searchName: "Paramount", color: "bg-gradient-to-br from-[#0064FF] to-[#003080] border border-blue-400/40 focus:ring-blue-400", logoText: "Paramount+", badgeColor: "text-white font-bold text-lg" },
  { name: "Disney+", searchName: "Disney", color: "bg-gradient-to-br from-[#113CCF] to-[#040714] border border-sky-400/40 focus:ring-sky-400", logoText: "Disney+", badgeColor: "text-white font-extrabold italic text-xl" },
  { name: "Sportynet", searchName: "Sportynet", color: "bg-gradient-to-br from-[#2E1A47] to-[#140A24] border border-purple-400/40 focus:ring-purple-400", logoText: "SPORTYNET", badgeColor: "text-purple-300 font-bold tracking-wider text-base" },
  { name: "NSports", searchName: "NSports", color: "bg-gradient-to-br from-[#FFD700] to-[#B8860B] border border-yellow-400/40 focus:ring-yellow-400", logoText: "NSPORTS", badgeColor: "text-black font-black tracking-widest text-lg" },
];

function LiveChannelsRow() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Canais ao vivo</h2>
        <Link to="/live" className="focusable text-sm font-medium text-primary hover:underline">
          Ver tudo
        </Link>
      </div>
      <div className="-mx-4 flex gap-4 overflow-x-auto py-2 no-scrollbar lg:-mx-12">
        {LIVE_NETWORKS.map((net) => (
          <Link
            key={net.name}
            to="/live"
            search={{ search: net.searchName, cat: "all" } as any}
            className="focusable group flex flex-col items-center gap-2 shrink-0 first:ml-4 lg:first:ml-12 last:mr-4 lg:last:mr-12"
          >
            <div className={`relative flex h-20 w-40 items-center justify-center overflow-hidden rounded-2xl shadow-lg transition-transform group-hover:scale-105 group-focus:scale-105 group-focus:ring-2 group-focus:ring-offset-2 group-focus:ring-offset-background ${net.color}`}>
              <span className={`drop-shadow-md select-none ${net.badgeColor}`}>{net.logoText}</span>
            </div>
            <span className="text-sm font-medium text-white/80 transition-colors group-hover:text-white group-focus:text-white">
              {net.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
