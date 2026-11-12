import { BRAND_CONFIGS, type BrandTheme, resolveBrand } from "../lib/brands";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { 
  Play, Info, ArrowLeft, Search, Star, Film, Tv, Sparkles, ChevronRight, 
  ChevronLeft, Check, Plus, Volume2, VolumeX, Eye, Flame, Award, Compass, RefreshCw,
  Bell, ThumbsUp, ChevronDown, Trophy, Clapperboard, FlameKindling, ImageOff,
  Zap, Heart, Share2, Layers, Home, Bookmark
} from "lucide-react";
import { useRequireAccount } from "../hooks/use-require-account";
import { useCachedQuery, accountKey } from "../lib/queries";
import { getVodStreams, getVodCategories, getSeries, getSeriesCategories, getLiveStreams, type Account, type VodItem, type SeriesItem, type LiveStreamItem, proxiedImage } from "../lib/xtream";
import { useFavorites, useWatchHistory } from "../hooks/use-supabase-data";


export const Route = createFileRoute("/hub/$brand")({
  validateSearch: (search: Record<string, string>) => ({
    tab: search.tab as "all" | "movies" | "series" | "sports" | "list" | undefined,
    q: search.q as string | undefined,
  }),
  head: ({ params }) => {
    const rawBrand = params.brand?.toLowerCase() || "netflix";
    const brand = BRAND_CONFIGS[rawBrand] || BRAND_CONFIGS.netflix;
    return {
      meta: [
        { title: `${brand.name} — FLOW TV` },
        { name: "description", content: `Experiência oficial ${brand.name} no FLOW TV.` },
        { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" }
      ],
    };
  },
  component: StreamingBrandHub,
});

function StreamingBrandHub() {
  const { brand: brandParam } = Route.useParams();
  const rawBrand = (brandParam || "netflix").toLowerCase();
  const brand = BRAND_CONFIGS[rawBrand] || BRAND_CONFIGS[Object.keys(BRAND_CONFIGS).find(k => rawBrand.includes(k)) || "netflix"];

  const { tab = "all", q: searchQuery } = Route.useSearch();
  const navigate = useNavigate();

  const { account, ready } = useRequireAccount();
  const key = accountKey(account);

  const [activeTab, setActiveTab] = useState<"all" | "movies" | "series" | "sports" | "list">(tab || "all");
  const [localSearch, setLocalSearch] = useState(searchQuery || "");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(36);

  const { favorites } = useFavorites();
  const { history } = useWatchHistory();

  // Scroll listener for sticky header
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Update tab in state and query param
  const changeTab = (t: "all" | "movies" | "series" | "sports" | "list") => {
    setActiveTab(t);
    navigate({
      search: (prev) => ({ ...prev, tab: t }),
      replace: true,
    });
  };

  // Queries
  const movies = useCachedQuery(`${key}:vod:all`, () => getVodStreams(account!), { enabled: !!account });
  const movieCats = useCachedQuery(`${key}:vodcats`, () => getVodCategories(account!), { enabled: !!account });
  const series = useCachedQuery(`${key}:series:all`, () => getSeries(account!), { enabled: !!account });
  const seriesCats = useCachedQuery(`${key}:seriescats`, () => getSeriesCategories(account!), { enabled: !!account });

  // Map category IDs for the brand
  const brandCatIds = useMemo(() => {
    const vodIds = new Set<string>();
    const serIds = new Set<string>();

    const matchesBrand = (name: string) => {
      const lower = name.toLowerCase();
      return brand.keywords.some((kw) => lower.includes(kw));
    };

    movieCats.data?.forEach((cat) => {
      if (matchesBrand(cat.category_name)) vodIds.add(cat.category_id);
    });
    seriesCats.data?.forEach((cat) => {
      if (matchesBrand(cat.category_name)) serIds.add(cat.category_id);
    });

    return { vod: vodIds, series: serIds };
  }, [movieCats.data, seriesCats.data, brand]);

  // Filter items that belong to this brand
  const { brandMovies, brandSeries, allBrandItems } = useMemo(() => {
    const isBrandItem = (name: string, catId: string, isMovie: boolean) => {
      if (isMovie && brandCatIds.vod.has(catId)) return true;
      if (!isMovie && brandCatIds.series.has(catId)) return true;
      const lower = (name || "").toLowerCase();
      return brand.keywords.some((kw) => lower.includes(kw));
    };

    const mList = (movies.data || []).filter((m) => isBrandItem(m.name, m.category_id, true));
    const sList = (series.data || []).filter((s) => isBrandItem(s.name, s.category_id, false));

    const combined: Array<{ type: "movie" | "series"; data: VodItem | SeriesItem }> = [];
    sList.forEach((s) => combined.push({ type: "series", data: s }));
    mList.forEach((m) => combined.push({ type: "movie", data: m }));

    return {
      brandMovies: mList,
      brandSeries: sList,
      allBrandItems: combined,
    };
  }, [movies.data, series.data, brandCatIds, brand]);

  // Filtered view according to search or activeTab
  const displayItems = useMemo(() => {
    let list = allBrandItems;

    if (localSearch.trim()) {
      const q = localSearch.toLowerCase().trim();
      list = list.filter((it) => it.data.name?.toLowerCase().includes(q));
    } else {
      if (activeTab === "movies") list = list.filter((it) => it.type === "movie");
      else if (activeTab === "series") list = list.filter((it) => it.type === "series");
      else if (activeTab === "list") {
        const favIds = new Set(favorites.map((f) => f.stream_id || f.id));
        list = list.filter((it) => {
          const id = it.type === "movie" ? (it.data as VodItem).stream_id : (it.data as SeriesItem).series_id;
          return favIds.has(id);
        });
      }
    }

    return list;
  }, [allBrandItems, localSearch, activeTab, favorites]);

  // Top 10 Ranking
  const top10Items = useMemo(() => {
    return allBrandItems
      .slice()
      .sort((a, b) => {
        const rA = parseFloat(a.data.rating || "0");
        const rB = parseFloat(b.data.rating || "0");
        if (rB !== rA) return rB - rA;
        return (b.data.added ? parseInt(b.data.added) : 0) - (a.data.added ? parseInt(a.data.added) : 0);
      })
      .slice(0, 10);
  }, [allBrandItems]);

  // Hero Featured Content
  const heroItems = useMemo(() => {
    const withCovers = allBrandItems.filter((item) => {
      if (item.type === "movie") {
        const m = item.data as VodItem;
        return m.stream_icon;
      } else {
        const s = item.data as SeriesItem;
        return s.cover_big || s.cover || s.stream_icon || s.poster_path;
      }
    });
    return withCovers.length > 0 ? withCovers.slice(0, 8) : allBrandItems.slice(0, 8);
  }, [allBrandItems]);

  const activeHero = heroItems[heroIndex % (heroItems.length || 1)];

  // Auto rotate hero
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroItems.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [heroItems.length]);

  const isLoading = (movies.isLoading || series.isLoading) && allBrandItems.length === 0;

  return (
    <div className={`min-h-screen ${brand.bgClass} pb-36 font-sans transition-colors duration-500 selection:bg-white selection:text-black overflow-x-hidden`} style={{ WebkitTapHighlightColor: "transparent" }}>
      {/* ---------------------------------------------------- */}
      {/* HEADER SUPERIOR LIMPO (Sem sobrepor os filmes)       */}
      {/* ---------------------------------------------------- */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 pt-[env(safe-area-inset-top,0px)] ${
          isScrolled
            ? `${brand.headerBg}/95 backdrop-blur-md shadow-2xl border-b border-white/10`
            : "bg-gradient-to-b from-black/90 via-black/60 to-transparent"
        }`}
      >
        <div className="flex items-center justify-between px-3 sm:px-8 lg:px-14 py-3 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-8 min-w-0">
            {/* Botão Voltar para FLOW TV */}
            <Link
              to="/"
              className="p-1.5 -ml-1 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition shrink-0 active:scale-95"
              title="Voltar ao início"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Logo Customizada por Marca */}
            <Link to="/" title="Voltar ao FLOW TV" className="group flex items-center shrink-0">
              <BrandLogoHeader brand={brand} />
            </Link>

            {/* Menu de Navegação Desktop */}
            <nav className="hidden items-center gap-5 text-xs font-medium text-[#e5e5e5] md:flex lg:gap-7 lg:text-sm">
              {brand.navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => changeTab(item.id)}
                  className={`transition-colors hover:text-white relative py-1 ${
                    activeTab === item.id ? "font-bold text-white" : "text-white/70"
                  }`}
                >
                  {item.label}
                  {activeTab === item.id && (
                    <span
                      className="absolute bottom-0 inset-x-0 h-0.5 rounded-full"
                      style={{ backgroundColor: brand.accentColor }}
                    />
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Ferramentas do Cabeçalho */}
          <div className="flex items-center gap-2.5 sm:gap-6 text-sm text-white shrink-0">
            <div className="relative flex items-center">
              {isSearchOpen ? (
                <div className="flex items-center rounded-full border border-white/40 bg-black/90 px-3 py-1 shadow-lg">
                  <Search className="h-3.5 w-3.5 text-white mr-1.5" />
                  <input
                    type="text"
                    autoFocus
                    placeholder={`Buscar...`}
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    onBlur={() => !localSearch && setIsSearchOpen(false)}
                    className="w-28 sm:w-48 bg-transparent text-xs text-white placeholder:text-white/50 focus:outline-none"
                  />
                  {localSearch && (
                    <button onClick={() => setLocalSearch("")} className="text-xs text-white/70 hover:text-white ml-1">✕</button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 text-white hover:text-white/80 active:scale-95 transition"
                  title="Buscar"
                >
                  <Search className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Avatar estilizado por Marca */}
            <BrandAvatar brand={brand} />
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* BANNER PRINCIPAL / HERO OTIMIZADO PARA MOBILE & IOS  */}
      {/* ---------------------------------------------------- */}
      <main className="relative pt-16 sm:pt-0">
        {isLoading ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
            <RefreshCw className="h-10 w-10 animate-spin" style={{ color: brand.accentColor }} />
            <p className="text-sm font-medium text-white/70">Carregando catálogo {brand.name}...</p>
          </div>
        ) : (
          <>
            {activeHero && !localSearch && activeTab === "all" && (
              <section className="relative w-full h-[50vh] sm:h-[68vh] min-h-[380px] max-h-[700px] flex items-end sm:items-center overflow-hidden">
                {(() => {
                  const isMovie = activeHero.type === "movie";
                  const m = isMovie ? (activeHero.data as VodItem) : null;
                  const s = !isMovie ? (activeHero.data as SeriesItem) : null;
                  const img = isMovie ? m?.stream_icon : (s?.cover_big || s?.cover || s?.stream_icon);
                  const title = isMovie ? m?.name : s?.name;
                  const targetLink = isMovie ? `/movie/${m?.stream_id}` : `/series/${s?.series_id}`;

                  return (
                    <>
                      {img && (
                        <div className="absolute inset-0 z-0 pointer-events-none select-none">
                          <img draggable={false}
                            src={proxiedImage(img)}
                            alt={title}
                            className="h-full w-full object-cover object-center filter brightness-65 scale-105 transition-all duration-1000"
                          />
                          {/* Gradientes Dinâmicos */}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/30" />
                          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
                        </div>
                      )}

                      <div className="relative z-10 max-w-2xl px-4 sm:px-10 lg:px-14 pb-8 sm:pb-0 pt-20 sm:pt-20">
                        {/* Selo do Streaming */}
                        <div className="inline-flex items-center gap-2 mb-2 sm:mb-3">
                          <span
                            className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-sm"
                            style={{ backgroundColor: brand.accentColor, color: brand.id === "appletv" ? "#000" : "#fff" }}
                          >
                            {isMovie ? brand.movieBadge : brand.seriesBadge}
                          </span>
                          <span className="text-[11px] sm:text-xs font-semibold text-white/80">
                            {isMovie ? "Filme" : "Série"}
                          </span>
                        </div>

                        <h1 className="font-extrabold text-2xl sm:text-5xl lg:text-6xl tracking-tight leading-tight drop-shadow-2xl mb-2 sm:mb-3 line-clamp-2 text-white">
                          {title}
                        </h1>

                        <p className="hidden sm:block text-xs sm:text-sm text-white/80 line-clamp-2 mb-6 max-w-lg leading-relaxed drop-shadow">
                          {isMovie ? "Disponível em alta definição e som espacial. Assista agora mesmo." : "Assista a todas as temporadas completas com alta qualidade de áudio e vídeo."}
                        </p>

                        <div className="flex items-center gap-2.5 sm:gap-3 mt-3 sm:mt-0">
                          <Link
                            to={targetLink}
                            search={{ from: "/hub/" + brand.id, brand: brand.name, play: "1" }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 sm:px-8 py-2.5 sm:py-3 font-bold text-black shadow-xl transition-all active:scale-95 hover:bg-white/90 text-xs sm:text-base flex-1 sm:flex-initial"
                          >
                            <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-black" />
                            Assistir
                          </Link>

                          <Link
                            to={targetLink}
                            search={{ from: "/hub/" + brand.id, brand: brand.name }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/20 backdrop-blur-md px-4 sm:px-6 py-2.5 sm:py-3 font-semibold text-white transition-all active:scale-95 hover:bg-white/30 text-xs sm:text-base flex-1 sm:flex-initial"
                          >
                            <Info className="h-4 w-4 sm:h-5 sm:w-5" />
                            Detalhes
                          </Link>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </section>
            )}

            {/* ---------------------------------------------------- */}
            {/* BRAND TILES (Botões de Franquias - Estilo Disney+)   */}
            {/* ---------------------------------------------------- */}
            {brand.brandTiles && activeTab === "all" && !localSearch && (
              <div className="px-3 sm:px-10 lg:px-14 py-3 sm:py-6">
                <div className="grid grid-cols-5 gap-1.5 sm:gap-4">
                  {brand.brandTiles.map((tile) => (
                    <button
                      key={tile.name}
                      onClick={() => setLocalSearch(tile.query)}
                      className={`group relative h-12 sm:h-24 rounded-lg sm:rounded-xl border ${tile.bg} bg-gradient-to-br ${tile.color} p-1 sm:p-3 flex items-center justify-center shadow-lg transition-all active:scale-95 hover:scale-105 hover:border-white`}
                    >
                      <span className="font-black text-[9px] sm:text-xl tracking-wide text-white uppercase drop-shadow text-center line-clamp-1">
                        {tile.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* CONTEÚDO PRINCIPAL (Fileiras Originais)              */}
            {/* ---------------------------------------------------- */}
            <div className="space-y-6 sm:space-y-12 px-3 sm:px-10 lg:px-14 mt-4">
              {/* Quando estiver em busca ou aba de filtro específica */}
              {(localSearch || activeTab !== "all") ? (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg sm:text-2xl font-bold flex items-center gap-2 text-white">
                      {localSearch ? (
                        <>Resultados para "{localSearch}" ({displayItems.length})</>
                      ) : activeTab === "movies" ? (
                        <>Filmes {brand.name}</>
                      ) : activeTab === "series" ? (
                        <>Séries {brand.name}</>
                      ) : activeTab === "sports" ? (
                        <>Em Alta em {brand.name}</>
                      ) : (
                        <>Minha Lista</>
                      )}
                    </h2>
                  </div>

                  {displayItems.length === 0 ? (
                    <div className="py-20 text-center">
                      <Film className="h-12 w-12 mx-auto text-white/30 mb-3" />
                      <p className="text-sm sm:text-base text-white/70 font-medium">Nenhum título encontrado.</p>
                      <button
                        onClick={() => { setLocalSearch(""); changeTab("all"); }}
                        className="mt-4 text-xs font-bold underline text-white/90 hover:text-white"
                      >
                        Limpar filtros e ver catálogo completo
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-4">
                      {displayItems.slice(0, visibleCount).map((item, idx) => (
                        <BrandPosterCard
                          key={`${item.type}-${idx}`}
                          item={item.data}
                          type={item.type}
                          account={account!}
                          cacheKey={key}
                          brand={brand}
                        />
                      ))}
                    </div>
                  )}

                  {displayItems.length > visibleCount && (
                    <div className="text-center mt-8 sm:mt-10">
                      <button
                        onClick={() => setVisibleCount((prev) => prev + 36)}
                        className="px-6 py-2.5 rounded-full border border-white/20 hover:border-white text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 transition active:scale-95"
                      >
                        Carregar Mais Títulos
                      </button>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  {/* Fileira 1: Populares na Marca */}
                  {brandSeries.length > 0 && (
                    <BrandPosterRow
                      title={`Populares no ${brand.name}`}
                      items={brandSeries.slice(0, 24)}
                      type="series"
                      account={account!}
                      cacheKey={key}
                      brand={brand}
                    />
                  )}

                  {/* Fileira 2: Top 10 Ranking */}
                  {top10Items.length > 0 && (
                    <BrandTop10PosterRow
                      items={top10Items}
                      account={account!}
                      cacheKey={key}
                      brand={brand}
                    />
                  )}

                  {/* Fileira 3: Filmes em Destaque */}
                  {brandMovies.length > 0 && (
                    <BrandPosterRow
                      title={`Filmes de Sucesso ${brand.name}`}
                      items={brandMovies.slice(0, 24)}
                      type="movie"
                      account={account!}
                      cacheKey={key}
                      brand={brand}
                    />
                  )}

                  {/* Fileira 4: Originais e Exclusivos */}
                  {brandSeries.length > 10 && (
                    <BrandPosterRow
                      title={`Séries Originais & Exclusivas`}
                      items={brandSeries.slice(10, 34)}
                      type="series"
                      account={account!}
                      cacheKey={key}
                      brand={brand}
                    />
                  )}

                  {/* Fileira 5: Recém Adicionados */}
                  {brandMovies.length > 10 && (
                    <BrandPosterRow
                      title={`Novidades no Catálogo`}
                      items={brandMovies.slice(10, 34)}
                      type="movie"
                      account={account!}
                      cacheKey={key}
                      brand={brand}
                    />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* ---------------------------------------------------- */}
      {/* BARRA DE NAVEGAÇÃO INFERIOR MODERNA COM ÍCONES       */}
      {/* (Fica fixa na parte de baixo, com espaço para gestos)*/}
      {/* ---------------------------------------------------- */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-[#0e0e11]/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] pt-2 pb-[max(env(safe-area-inset-bottom,0px),14px)] px-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 14px)" }}
      >
        <div className="flex items-center justify-around">
          {/* Início (Casinha) */}
          <button
            onClick={() => changeTab("all")}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-90 ${
              activeTab === "all" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "all" ? "bg-white/15" : ""
              }`}
              style={{ color: activeTab === "all" ? brand.accentColor : "inherit" }}
            >
              <Home className="h-5 w-5" />
            </div>
            <span
              className={`text-[10px] tracking-tight font-medium ${
                activeTab === "all" ? "font-bold text-white" : ""
              }`}
            >
              Início
            </span>
          </button>

          {/* Séries (TV) */}
          <button
            onClick={() => changeTab("series")}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-90 ${
              activeTab === "series" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "series" ? "bg-white/15" : ""
              }`}
              style={{ color: activeTab === "series" ? brand.accentColor : "inherit" }}
            >
              <Tv className="h-5 w-5" />
            </div>
            <span
              className={`text-[10px] tracking-tight font-medium ${
                activeTab === "series" ? "font-bold text-white" : ""
              }`}
            >
              Séries
            </span>
          </button>

          {/* Filmes (Clapperboard / Rolo de Filme) */}
          <button
            onClick={() => changeTab("movies")}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-90 ${
              activeTab === "movies" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "movies" ? "bg-white/15" : ""
              }`}
              style={{ color: activeTab === "movies" ? brand.accentColor : "inherit" }}
            >
              <Film className="h-5 w-5" />
            </div>
            <span
              className={`text-[10px] tracking-tight font-medium ${
                activeTab === "movies" ? "font-bold text-white" : ""
              }`}
            >
              Filmes
            </span>
          </button>

          {/* Bombando / Em Alta (Chama / Fogo) */}
          <button
            onClick={() => changeTab("sports")}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-90 ${
              activeTab === "sports" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "sports" ? "bg-white/15" : ""
              }`}
              style={{ color: activeTab === "sports" ? brand.accentColor : "inherit" }}
            >
              <Flame className="h-5 w-5" />
            </div>
            <span
              className={`text-[10px] tracking-tight font-medium ${
                activeTab === "sports" ? "font-bold text-white" : ""
              }`}
            >
              {brand.id === "netflix" ? "Bombando" : "Em Alta"}
            </span>
          </button>

          {/* Minha Lista (Coração / Bookmark) */}
          <button
            onClick={() => changeTab("list")}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all active:scale-90 ${
              activeTab === "list" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-colors ${
                activeTab === "list" ? "bg-white/15" : ""
              }`}
              style={{ color: activeTab === "list" ? brand.accentColor : "inherit" }}
            >
              <Bookmark className="h-5 w-5" />
            </div>
            <span
              className={`text-[10px] tracking-tight font-medium ${
                activeTab === "list" ? "font-bold text-white" : ""
              }`}
            >
              Minha Lista
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

// ----------------------------------------------------
// LOGO DO CABEÇALHO PERSONALIZADA POR MARCA
// ----------------------------------------------------
function BrandLogoHeader({ brand }: { brand: BrandTheme }) {
  switch (brand.id) {
    case "netflix":
      return (
        <span className="font-black text-xl sm:text-3xl tracking-tighter text-[#E50914] hover:opacity-90 transition-opacity">
          NETFLIX
        </span>
      );
    case "prime":
      return (
        <div className="flex items-center gap-0.5 sm:gap-1">
          <span className="font-black text-lg sm:text-2xl tracking-tight text-white">
            prime
          </span>
          <span className="font-light text-lg sm:text-2xl text-[#00A8E1]">
            video
          </span>
        </div>
      );
    case "disney":
      return (
        <div className="flex items-center font-black tracking-widest text-xl sm:text-3xl text-white">
          <span>Disney</span>
          <span className="text-[#0063E5] ml-0.5">+</span>
        </div>
      );
    case "max":
      return (
        <span className="font-black text-xl sm:text-3xl tracking-wider text-white bg-gradient-to-r from-blue-400 to-indigo-200 bg-clip-text text-transparent">
          MAX
        </span>
      );
    case "globoplay":
      return (
        <div className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF1E56] inline-block animate-pulse" />
          <span className="font-black text-lg sm:text-2xl tracking-tight text-white">
            globo<span className="text-[#FF1E56]">play</span>
          </span>
        </div>
      );
    case "appletv":
      return (
        <div className="flex items-center gap-0.5 font-semibold text-lg sm:text-2xl text-white">
          <span className="text-base sm:text-xl"></span>
          <span className="font-bold">tv+</span>
        </div>
      );
    case "paramount":
      return (
        <span className="font-black text-lg sm:text-2xl tracking-tighter text-[#0064FF] uppercase">
          Paramount+
        </span>
      );
    case "crunchyroll":
      return (
        <span className="font-extrabold text-lg sm:text-2xl tracking-tight text-[#F47521]">
          crunchyroll
        </span>
      );
    default:
      return (
        <span className="font-black text-xl sm:text-2xl text-white">
          {brand.name}
        </span>
      );
  }
}

// ----------------------------------------------------
// AVATAR PERSONALIZADO POR MARCA
// ----------------------------------------------------
function BrandAvatar({ brand }: { brand: BrandTheme }) {
  switch (brand.id) {
    case "netflix":
      return (
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded overflow-hidden bg-[#0071eb] flex items-center justify-center font-bold text-white shadow-md cursor-pointer active:scale-95 transition">
          <span className="text-xs sm:text-sm">😊</span>
        </div>
      );
    case "prime":
      return (
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full overflow-hidden bg-[#00A8E1] flex items-center justify-center font-bold text-black shadow-md cursor-pointer active:scale-95 transition">
          <span className="text-[10px] sm:text-xs font-black">P</span>
        </div>
      );
    case "disney":
      return (
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full overflow-hidden bg-gradient-to-tr from-blue-700 to-indigo-400 flex items-center justify-center font-bold text-white shadow-md border border-white/30 cursor-pointer active:scale-95 transition">
          <span className="text-[10px] sm:text-xs font-black">D+</span>
        </div>
      );
    default:
      return (
        <div
          className="h-7 w-7 sm:h-8 sm:w-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-white shadow-md cursor-pointer active:scale-95 transition"
          style={{ backgroundColor: brand.accentColor }}
        >
          <span className="text-[10px] sm:text-xs font-black">{brand.name.charAt(0)}</span>
        </div>
      );
  }
}

// ----------------------------------------------------
// FILEIRA DE POSTERS
// ----------------------------------------------------
function BrandPosterRow({
  title,
  items,
  type,
  account,
  cacheKey,
  brand,
}: {
  title: string;
  items: VodItem[] | SeriesItem[];
  type: "movie" | "series";
  account: Account;
  cacheKey: string;
  brand: BrandTheme;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = direction === "left" ? -350 : 350;
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="relative group">
      <h2 className="mb-2 text-sm sm:text-xl font-bold text-white hover:text-white/90 transition-colors flex items-center justify-between">
        <span className="flex items-center gap-1.5 sm:gap-2">
          <span className="h-3.5 sm:h-4 w-1 rounded-full" style={{ backgroundColor: brand.accentColor }} />
          {title}
        </span>
      </h2>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          className="hidden md:flex absolute -left-4 lg:-left-8 top-0 bottom-0 z-30 w-8 sm:w-10 bg-black/80 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-all items-center justify-center rounded-r cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div
          ref={scrollRef}
          className="-mx-3 sm:-mx-2 flex gap-2 sm:gap-4 overflow-x-auto px-3 sm:px-2 py-2 sm:py-3.5 no-scrollbar scroll-smooth "
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {items.map((item) => {
            const isMovie = type === "movie";
            const m = isMovie ? (item as VodItem) : null;
            const s = !isMovie ? (item as SeriesItem) : null;
            const id = isMovie ? m?.stream_id : s?.series_id;

            return (
              <div key={id} className="w-28 sm:w-44 md:w-48 shrink-0 transition-all duration-300">
                <BrandPosterCard item={item} type={type} account={account} cacheKey={cacheKey} brand={brand} />
              </div>
            );
          })}
        </div>

        <button
          onClick={() => scroll("right")}
          className="hidden md:flex absolute -right-4 lg:-right-8 top-0 bottom-0 z-30 w-8 sm:w-10 bg-black/80 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-all items-center justify-center rounded-l cursor-pointer"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </section>
  );
}

// ----------------------------------------------------
// BRAND POSTER CARD COM SELO DINÂMICO
// ----------------------------------------------------
function BrandPosterCard({
  item,
  type,
  account,
  cacheKey,
  brand,
}: {
  item: VodItem | SeriesItem;
  type: "movie" | "series";
  account: Account;
  cacheKey: string;
  brand: BrandTheme;
}) {
  const isMovie = type === "movie";
  const movie = isMovie ? (item as VodItem) : null;
  const series = !isMovie ? (item as SeriesItem) : null;

  const title = isMovie ? movie?.name : series?.name;
  const rating = isMovie ? movie?.rating : series?.rating;
  const image = isMovie ? movie?.stream_icon : (series?.cover || series?.cover_big || series?.stream_icon || series?.poster_path);
  const targetLink = isMovie ? `/movie/${movie?.stream_id}` : `/series/${series?.series_id}`;

  return (
    <Link
      to={targetLink}
      search={{ from: "/hub/" + brand.id, brand: brand.name }}
      style={{ touchAction: "manipulation" }} className="focusable group/card relative block w-full aspect-[2/3] select-none overflow-hidden rounded-md sm:rounded-lg bg-[#1a1a1a] border border-white/5 transition-all duration-300 active:scale-95 hover:scale-105 hover:z-30 hover:shadow-[0_10px_30px_rgba(0,0,0,0.8)] hover:border-white/40 cursor-pointer"
    >
      {image ? (
        <img draggable={false}
          src={proxiedImage(image)}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover object-center filter brightness-95 transition-transform duration-300 group-hover/card:scale-105 pointer-events-none select-none"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[#1c1c1c] p-2 text-center text-[10px] sm:text-xs text-white/60">
          <ImageOff className="h-5 w-5 mb-1 text-white/30" />
          <span className="line-clamp-2">{title}</span>
        </div>
      )}

      {/* Selo da Marca no Topo */}
      <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-10">
        {brand.id === "netflix" ? (
          <span className="text-[#E50914] font-black text-xs sm:text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            N
          </span>
        ) : brand.id === "prime" ? (
          <span className="bg-[#00A8E1] text-black text-[7px] sm:text-[9px] font-black px-1 sm:px-1.5 py-0.5 rounded shadow">
            PRIME
          </span>
        ) : brand.id === "disney" ? (
          <span className="bg-[#0063E5] text-white text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow">
            DISNEY+
          </span>
        ) : brand.id === "globoplay" ? (
          <span className="bg-[#FF1E56] text-white text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow">
            GLOBO
          </span>
        ) : brand.id === "appletv" ? (
          <span className="bg-white text-black text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow">
            TV+
          </span>
        ) : brand.id === "crunchyroll" ? (
          <span className="bg-[#F47521] text-black text-[7px] sm:text-[8px] font-black px-1 sm:px-1.5 py-0.5 rounded shadow">
            CR
          </span>
        ) : (
          <span
            className="text-white text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow"
            style={{ backgroundColor: brand.accentColor }}
          >
            {brand.name}
          </span>
        )}
      </div>

      {/* Gradiente Inferior com Título */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-1.5 sm:p-2.5 pt-6 sm:pt-8 z-10">
        <p className="font-bold text-[11px] sm:text-sm text-white drop-shadow line-clamp-1">
          {title}
        </p>
        <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5">
          <span
            className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider"
            style={{ color: brand.accentColor }}
          >
            {isMovie ? "Filme" : "Série"}
          </span>
          {rating && parseFloat(rating) > 0 && (
            <span className="text-[8px] sm:text-[9px] font-medium text-emerald-400">
              ★ {parseFloat(rating).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Hover Action Overlay (Desktop) */}
      <div className="hidden sm:flex absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity items-center justify-center gap-2 z-20">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-lg hover:scale-110 transition-transform">
          <Play className="h-4 w-4 fill-black translate-x-0.5" />
        </span>
        <span className="grid h-10 w-10 place-items-center rounded-full border border-white/60 bg-black/60 text-white hover:border-white transition-colors">
          <Plus className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

// ----------------------------------------------------
// TOP 10 RANKING COM NÚMEROS ESTILIZADOS
// ----------------------------------------------------
function BrandTop10PosterRow({
  items,
  account,
  cacheKey,
  brand,
}: {
  items: Array<{ type: "movie" | "series"; data: VodItem | SeriesItem }>;
  account: Account;
  cacheKey: string;
  brand: BrandTheme;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const amount = direction === "left" ? -350 : 350;
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  return (
    <section className="relative group">
      <h2 className="mb-2 text-sm sm:text-xl font-bold text-white flex items-center gap-1.5 sm:gap-2">
        <Flame className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: brand.accentColor }} />
        Top 10 Hoje no {brand.name}
      </h2>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          className="hidden md:flex absolute -left-4 lg:-left-8 top-0 bottom-0 z-30 w-8 sm:w-10 bg-black/80 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-all items-center justify-center rounded-r cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div
          ref={scrollRef}
          className="-mx-3 sm:-mx-2 flex gap-2.5 sm:gap-4 overflow-x-auto px-3 sm:px-2 py-2 sm:py-3.5 no-scrollbar scroll-smooth "
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {items.map((item, index) => {
            const rank = index + 1;
            return (
              <div key={index} className="relative flex shrink-0 items-end w-32 sm:w-48 md:w-52">
                {/* Número Grande Top 10 */}
                <div className="relative -mr-4 sm:-mr-8 z-0 pointer-events-none select-none">
                  <span
                    className="font-black text-6xl sm:text-9xl leading-none text-transparent tracking-tighter"
                    style={{
                      WebkitTextStroke: `2.5px ${brand.accentColor}99`,
                      textShadow: "0 0 15px rgba(0,0,0,0.9)",
                    }}
                  >
                    {rank}
                  </span>
                </div>

                <div className="relative z-10 flex-1">
                  <BrandPosterCard
                    item={item.data}
                    type={item.type}
                    account={account}
                    cacheKey={cacheKey}
                    brand={brand}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => scroll("right")}
          className="hidden md:flex absolute -right-4 lg:-right-8 top-0 bottom-0 z-30 w-8 sm:w-10 bg-black/80 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-all items-center justify-center rounded-l cursor-pointer"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </section>
  );
}
