import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Tv, Search, Heart, ChevronRight, ArrowLeft, Maximize } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { VideoPlayer, type VideoPlayerHandle } from "../components/VideoPlayer";
import { useRequireAccount } from "../hooks/use-require-account";
import { useCachedQuery, accountKey } from "../lib/queries";
import { getLiveCategories, getLiveStreams, liveStreamUrl, proxiedImage, type LiveStream } from "../lib/xtream";
import { toggleFavorite, isFavorite } from "../lib/storage";
import { toast } from "sonner";
import { useIsMobile } from "../hooks/use-mobile";

export const Route = createFileRoute("/live")({
  validateSearch: (search: Record<string, string>) => ({
    cat: search.cat as string | undefined,
    search: search.search as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "TV ao Vivo — FLOW TV" },
      { name: "description", content: "Assista canais de TV ao vivo IPTV com player estável no FLOW TV." },
    ],
  }),
  component: LivePage,
});

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]/g, " ")     // Substitui símbolos por espaços
    .replace(/\s+/g, " ")           // Normaliza múltiplos espaços
    .trim();
}

const RULES = [
  // NOTÍCIAS (Grupo 2)
  { id: "globonews", group: 2, name: "GloboNews", matches: ["globo news", "globonews"] },
  { id: "record_news", group: 2, name: "Record News", matches: ["record news", "recordnews"] },
  { id: "bandnews", group: 2, name: "BandNews", matches: ["band news", "bandnews"] },
  { id: "cnn_brasil", group: 2, name: "CNN Brasil", matches: ["cnn brasil", "cnn"] },
  { id: "jovem_pan_news", group: 2, name: "Jovem Pan News", matches: ["jovem pan news", "jovem pan", "jp news"] },

  // ESPORTES (Grupo 3)
  { id: "sportv_1", group: 3, name: "SporTV", matches: ["sportv 1", "sportv hd", "sportv fhd", "sportv full"] },
  { id: "sportv_2", group: 3, name: "SporTV 2", matches: ["sportv 2"] },
  { id: "sportv_3", group: 3, name: "SporTV 3", matches: ["sportv 3"] },
  { id: "premiere_2", group: 3, name: "Premiere 2", matches: ["premiere 2", "pfci 2"] },
  { id: "premiere_3", group: 3, name: "Premiere 3", matches: ["premiere 3", "pfci 3"] },
  { id: "premiere_1", group: 3, name: "Premiere", matches: ["premiere", "pfci"] },
  { id: "espn_2", group: 3, name: "ESPN 2", matches: ["espn 2"] },
  { id: "espn_3", group: 3, name: "ESPN 3", matches: ["espn 3"] },
  { id: "espn_4", group: 3, name: "ESPN 4", matches: ["espn 4"] },
  { id: "espn_5", group: 3, name: "ESPN 5", matches: ["espn 5"] },
  { id: "espn_1", group: 3, name: "ESPN", matches: ["espn 1", "espn"] },
  { id: "tnt_sports", group: 3, name: "TNT Sports", matches: ["tnt sports", "tnt sport"] },
  { id: "nosso_futebol", group: 3, name: "Nosso Futebol", matches: ["nosso futebol"] },
  { id: "nsports", group: 3, name: "NSports", matches: ["nsports", "n sports"] },
  { id: "combate", group: 3, name: "Combate", matches: ["combate"] },
  { id: "bandsports", group: 3, name: "Bandsports", matches: ["bandsports", "band sports"] },

  // TV ABERTA (Grupo 1)
  { id: "globo", group: 1, name: "Globo", matches: ["globo"] },
  { id: "sbt", group: 1, name: "SBT", matches: ["sbt"] },
  { id: "record", group: 1, name: "Record", matches: ["record"] },
  { id: "band", group: 1, name: "Band", matches: ["band"] },
  { id: "redetv", group: 1, name: "RedeTV!", matches: ["redetv", "rede tv"] },
  { id: "tv_cultura", group: 1, name: "TV Cultura", matches: ["tv cultura", "cultura"] },
  { id: "gazeta", group: 1, name: "Gazeta", matches: ["gazeta", "tv gazeta"] },
  { id: "tv_brasil", group: 1, name: "TV Brasil", matches: ["tv brasil"] },
];

function findMatchRule(norm: string) {
  for (const r of RULES) {
    for (const pattern of r.matches) {
      if (norm.includes(pattern)) {
        if (r.id === "globo" && (norm.includes("news") || norm.includes("globonews"))) continue;
        if (r.id === "record" && (norm.includes("news") || norm.includes("recordnews"))) continue;
        if (r.id === "band" && (norm.includes("news") || norm.includes("bandnews") || norm.includes("sports") || norm.includes("bandsports"))) continue;
        if (r.id === "sportv_1" && (norm.includes("sportv 2") || norm.includes("sportv2") || norm.includes("sportv 3") || norm.includes("sportv3"))) continue;
        if (r.id === "premiere_1" && (norm.includes("premiere 2") || norm.includes("premiere2") || norm.includes("premiere 3") || norm.includes("premiere3"))) continue;
        if (r.id === "espn_1" && (norm.includes("espn 2") || norm.includes("espn2") || norm.includes("espn 3") || norm.includes("espn3") || norm.includes("espn 4") || norm.includes("espn4") || norm.includes("espn 5") || norm.includes("espn5"))) continue;
        return r;
      }
    }
  }
  return null;
}

function LivePage() {
  const { account, ready } = useRequireAccount();
  const key = accountKey(account);
  
  // Track last selection timestamp to prevent race conditions on TV remotes (keydown + click sequence)
  const lastSelectTime = useRef(0);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const isMobile = useIsMobile();
  const searchParams = Route.useSearch();
  const [cat, setCat] = useState(searchParams.cat || "principais_hd");
  const [search, setSearch] = useState(searchParams.search || "");
  const [selected, setSelected] = useState<LiveStream | null>(null);
  const [reinitCount, setReinitCount] = useState(0);
  const [fav, setFav] = useState(false);
  const [showChannels, setShowChannels] = useState(false);

  const categories = useCachedQuery(`${key}:livecats`, () => getLiveCategories(account!), { enabled: !!account });
  const channels = useCachedQuery(`${key}:live:all`, () => getLiveStreams(account!), { enabled: !!account });

  useEffect(() => {
    if (searchParams.cat !== undefined) setCat(searchParams.cat);
  }, [searchParams.cat]);

  useEffect(() => {
    if (searchParams.search !== undefined) setSearch(searchParams.search);
  }, [searchParams.search]);

  // If URL search parameter matches a category name, select that category
  useEffect(() => {
    if (searchParams.search && categories.data && categories.data.length > 0) {
      const q = searchParams.search.toLowerCase();
      const matchedCat = categories.data.find(c => {
        const name = c.category_name.toLowerCase();
        return name.includes(q) || q.includes(name);
      });

      if (matchedCat) {
        setCat(matchedCat.category_id);
        setSearch("");
      } else {
        setCat("all");
        setSearch(searchParams.search);
      }
    }
  }, [searchParams.search, categories.data]);

  const principaisChannels = useMemo(() => {
    const uniqueMatches = new Map<string, { channel: LiveStream; rule: typeof RULES[number]; score: number }>();
    for (const c of channels.data ?? []) {
      const norm = normalizeName(c.name);
      
      const words = norm.split(" ");
      const hasQuality = words.some(w => ["hd", "fhd", "1080", "1080p"].includes(w)) || norm.includes("full hd");
      const hasIgnored = words.some(w => ["sd", "480p", "360p", "4k", "uhd"].includes(w)) || norm.includes("baixa qualidade");
      
      if (!hasQuality || hasIgnored) continue;
      
      const r = findMatchRule(norm);
      if (r) {
        let score = 0;
        if (words.includes("sp")) {
          score += 100;
        }
        if (words.some(w => ["fhd", "1080p", "1080"].includes(w)) || norm.includes("full hd")) {
          score += 10;
        } else if (words.includes("hd")) {
          score += 5;
        }

        const existing = uniqueMatches.get(r.id);
        if (!existing || score > existing.score) {
          uniqueMatches.set(r.id, { channel: c, rule: r, score });
        }
      }
    }
    
    return Array.from(uniqueMatches.values())
      .sort((a, b) => {
        if (a.rule.group !== b.rule.group) return a.rule.group - b.rule.group;
        return a.rule.name.localeCompare(b.rule.name, "pt-BR");
      })
      .map(item => item.channel);
  }, [channels.data]);

  const countByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of channels.data ?? []) {
      map.set(c.category_id, (map.get(c.category_id) ?? 0) + 1);
    }
    return map;
  }, [channels.data]);

  const filtered = useMemo(() => {
    let list = channels.data ?? [];
    if (cat === "principais_hd") {
      list = principaisChannels;
    } else if (cat !== "all") {
      list = list.filter((c) => c.category_id === cat);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list.slice(0, 400);
  }, [channels.data, cat, search, principaisChannels]);

  // Auto-select on load disabled per user request to avoid auto-starting playback

  useEffect(() => {
    if (selected) setFav(isFavorite(`live:${selected.stream_id}`));
  }, [selected]);

  if (!ready || !account) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const onFav = () => {
    if (!selected) return;
    const added = toggleFavorite({
      id: `live:${selected.stream_id}`,
      type: "live",
      refId: selected.stream_id,
      title: selected.name,
      poster: selected.stream_icon,
    });
    setFav(added);
    toast.success(added ? "Adicionado aos favoritos" : "Removido dos favoritos");
  };

  const currentIndex = selected ? filtered.findIndex((c) => c.stream_id === selected.stream_id) : -1;
  const goNext = () => {
    if (!filtered.length) return;
    const next = filtered[(currentIndex + 1 + filtered.length) % filtered.length];
    setSelected(next);
    setReinitCount((c) => c + 1);
  };
  const goPrev = () => {
    if (!filtered.length) return;
    const prev = filtered[(currentIndex - 1 + filtered.length) % filtered.length];
    setSelected(prev);
    setReinitCount((c) => c + 1);
  };

  const allCategories = [
    { category_id: "principais_hd", category_name: "📺 Principais HD" },
    { category_id: "all", category_name: "Todos os canais" },
    ...(categories.data ?? []),
  ];
  const activeCatName =
    allCategories.find((c) => c.category_id === cat)?.category_name ?? "Canais";

  const pickCategory = (id: string) => {
    setCat(id);
    setShowChannels(true);
    setTimeout(() => {
      const container = document.querySelector(".channels-list-container");
      if (container) {
        const channelList = container.querySelector("ul");
        if (channelList) {
          const firstChannel = channelList.querySelector<HTMLElement>(".focusable");
          if (firstChannel) {
            firstChannel.focus();
            firstChannel.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          }
        }
      }
    }, 150);
  };

  return (
    <AppShell>
      <div className={`grid gap-4 px-4 py-4 min-w-0 overflow-hidden ${isMobile ? "grid-cols-1" : "grid-cols-[200px_300px_1fr]"} lg:px-6`}>
        {/* Player - Mobile: first, Desktop: third */}
        <div className={`${isMobile ? "" : "col-start-3 sticky top-20 h-fit"} live-player-container`}>
          {selected ? (
            <>
              <VideoPlayer
            ref={playerRef}
            key="live-player"
            source={{ url: liveStreamUrl(account, selected.stream_id), isLive: true }}
            title={selected.name}
            poster={proxiedImage(selected.stream_icon)}
            onNext={filtered.length > 1 ? goNext : undefined}
            nextLabel="Próximo canal"
            onPrev={filtered.length > 1 ? goPrev : undefined}
            prevLabel="Canal anterior"
            playlist={filtered.length > 1 ? filtered.map((c) => ({
              url: liveStreamUrl(account, c.stream_id),
              title: c.name,
              smallTitle: activeCatName,
            })) : undefined}
            playlistStartIndex={currentIndex >= 0 ? currentIndex : 0}
            loopPlaylist
            onPlaylistIndex={(idx) => {
              const ch = filtered[idx];
              if (ch && (!selected || ch.stream_id !== selected.stream_id)) {
                setSelected(ch);
              }
            }}
            onExitFullscreen={() => setShowChannels(true)}
            forceReinit={reinitCount}
          />
              <div className={`mt-3 flex items-center gap-2 ${isMobile ? "flex" : "hidden"}`}>
                <button
                  onClick={goPrev}
                  className="focusable flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/50"
                >
                  ‹ Anterior
                </button>
                <button
                  onClick={goNext}
                  className="focusable flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/50"
                >
                  Próximo ›
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <h1 className="font-display text-xl font-bold">{selected.name}</h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => playerRef.current?.requestFullscreen()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        playerRef.current?.requestFullscreen();
                      }
                    }}
                    className="focusable flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50"
                  >
                    <Maximize className="h-4 w-4" />
                    Tela cheia
                  </button>
                  <button
                    onClick={onFav}
                    className="focusable flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50"
                  >
                    <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : ""}`} />
                    {fav ? "Favorito" : "Favoritar"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="grid aspect-video place-items-center rounded-xl bg-card">
              <Tv className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Category selection - Mobile: second, Desktop: first */}
        <div className={`selections-container sticky top-20 min-w-0 ${isMobile ? "" : "col-start-1 row-start-1"} ${showChannels ? (isMobile ? "hidden" : "block") : "block"}`}>
          <h2 className="mb-3 font-display text-lg font-bold">Seleções</h2>
          {categories.isLoading && !categories.data ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-card" />
              ))}
            </div>
          ) : (
            <ul className={`space-y-1 overflow-y-auto pr-1 ${isMobile ? "max-h-[60vh]" : "max-h-[calc(100vh-200px)]"}`}>
              {allCategories.map((c) => (
                <li key={c.category_id}>
                  <button
                    onClick={() => pickCategory(c.category_id)}
                    className={`focusable flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      cat === c.category_id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="line-clamp-1">{c.category_name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {c.category_id === "all"
                        ? channels.data?.length ?? 0
                        : c.category_id === "principais_hd"
                          ? principaisChannels.length
                          : countByCat.get(c.category_id) ?? 0}
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={`mt-3 ${isMobile ? "block" : "hidden"}`}>
            <button
              onClick={() => setShowChannels(true)}
              className="focusable flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/50"
            >
              Ver canais ›
            </button>
          </div>
        </div>

        {/* Channel list - Mobile: third, Desktop: second */}
        <div className={`channels-list-container min-w-0 ${isMobile ? "" : "col-start-2 row-start-1"} ${showChannels ? "block" : (isMobile ? "hidden" : "block")}`}>
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setShowChannels(false)}
              className={`focusable inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-sm font-medium ${isMobile ? "inline-flex" : "hidden"}`}
            >
              <ArrowLeft className="h-4 w-4" /> Seleções
            </button>
            <h2 className="line-clamp-1 font-display text-lg font-bold">{activeCatName}</h2>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-input bg-secondary/50 px-3.5 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar canal…"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>

          {channels.isLoading && !channels.data ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-card" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg bg-card p-4 text-sm text-muted-foreground">
              Nenhum canal nesta seleção.
            </p>
          ) : (
            <ul className={`space-y-1 overflow-y-auto pr-1 ${isMobile ? "max-h-[60vh]" : "max-h-[calc(100vh-280px)]"}`}>
              {filtered.map((c) => (
                <li key={c.stream_id}>
                  <button
                    onClick={() => {
                      const now = Date.now();
                      if (selected?.stream_id === c.stream_id) {
                        playerRef.current?.requestFullscreen();
                      } else {
                        setSelected(c);
                        setReinitCount((n) => n + 1);
                        lastSelectTime.current = now;
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const now = Date.now();
                        if (selected?.stream_id === c.stream_id) {
                          playerRef.current?.requestFullscreen();
                        } else {
                          setSelected(c);
                          setReinitCount((n) => n + 1);
                          lastSelectTime.current = now;
                        }
                      }
                    }}
                    className={`focusable flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                      selected?.stream_id === c.stream_id
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-card"
                    }`}
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">
                      {c.stream_icon ? (
                        <img src={proxiedImage(c.stream_icon)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                      ) : (
                        <Tv className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <span className="line-clamp-2 text-sm font-medium">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
