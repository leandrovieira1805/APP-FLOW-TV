import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import { Search as SearchIcon, Loader2, X, Delete, Space, Keyboard } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { ContentCard } from "../components/ContentCard";
import { SeriesCard } from "../components/SeriesCard";
import { Grid } from "./movies";
import { useRequireAccount } from "../hooks/use-require-account";
import { useCachedQuery, accountKey } from "../lib/queries";
import { getVodStreams, getSeries, getLiveStreams } from "../lib/xtream";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, string>) => ({
    q: search.q as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Buscar — FLOW TV" },
      { name: "description", content: "Busque canais, filmes e séries em toda a sua lista IPTV no FLOW TV." },
    ],
  }),
  component: SearchPage,
});

const KEYBOARD_KEYS = [
  ["A", "B", "C", "D", "E", "F", "G"],
  ["H", "I", "J", "K", "L", "M", "N"],
  ["O", "P", "Q", "R", "S", "T", "U"],
  ["V", "W", "X", "Y", "Z", "0", "1"],
  ["2", "3", "4", "5", "6", "7", "8", "9"],
];

function SearchPage() {
  const { account, ready } = useRequireAccount();
  const key = accountKey(account);
  const searchParams = Route.useSearch();
  
  // Restore query from URL or sessionStorage so going back doesn't lose the search results
  const [q, setQ] = useState(() => {
    if (searchParams.q) return searchParams.q;
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem("flowtv_last_search_query") || "";
    }
    return "";
  });

  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync search query to sessionStorage
  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      if (q.trim()) {
        sessionStorage.setItem("flowtv_last_search_query", q);
      }
    }
  }, [q]);

  const movies = useCachedQuery(`${key}:vod:all`, () => getVodStreams(account!), { enabled: !!account });
  const series = useCachedQuery(`${key}:series:all`, () => getSeries(account!), { enabled: !!account });
  const live = useCachedQuery(`${key}:live:all`, () => getLiveStreams(account!), { enabled: !!account });

  const term = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (term.length < 2) return { movies: [], series: [], live: [] };
    const m = (movies.data ?? []).filter((x) => x.name.toLowerCase().includes(term)).slice(0, 40);
    const s = (series.data ?? []).filter((x) => x.name.toLowerCase().includes(term)).slice(0, 40);
    const l = (live.data ?? []).filter((x) => x.name.toLowerCase().includes(term)).slice(0, 40);
    return { movies: m, series: s, live: l };
  }, [term, movies.data, series.data, live.data]);

  const loading = movies.isLoading || series.isLoading || live.isLoading;
  const total = results.movies.length + results.series.length + results.live.length;

  const handleKeyPress = (char: string) => {
    setQ((prev) => prev + char);
  };

  const handleBackspace = () => {
    setQ((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setQ("");
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("flowtv_last_search_query");
    }
    if (inputRef.current) inputRef.current.focus();
  };

  if (!ready || !account) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const fromSearchUrl = `/search?q=${encodeURIComponent(q.trim())}`;

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-12">
        {/* Barra de Pesquisa */}
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-input bg-secondary/50 px-4 py-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 transition-all">
          <SearchIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar canais, filmes e séries…"
            className="focusable w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={handleClear}
              className="focusable rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none"
              title="Limpar busca"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowVirtualKeyboard((v) => !v)}
            className="focusable flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none"
            title="Alternar teclado na tela"
          >
            <Keyboard className="h-4 w-4" />
            <span className="hidden sm:inline">{showVirtualKeyboard ? "Ocultar Teclado" : "Teclado Virtual"}</span>
          </button>
        </div>

        {/* Layout Principal: Teclado Virtual + Resultados */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Teclado Virtual na Tela (TV Keyboard) */}
          {showVirtualKeyboard && (
            <div className="lg:col-span-4 xl:col-span-3">
              <div className="sticky top-20 rounded-2xl border border-border bg-card/60 p-4 shadow-card backdrop-blur">
                <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Teclado TV
                </p>
                <div className="space-y-2">
                  {KEYBOARD_KEYS.map((row, rIdx) => (
                    <div key={rIdx} className="flex justify-between gap-1">
                      {row.map((char) => (
                        <button
                          key={char}
                          type="button"
                          onClick={() => handleKeyPress(char)}
                          className="focusable flex h-10 flex-1 items-center justify-center rounded-lg border border-border/60 bg-secondary/30 font-semibold text-sm transition-all hover:bg-primary/20 hover:text-primary focus:border-primary focus:bg-primary focus:text-primary-foreground focus:scale-105 focus:shadow-glow focus:outline-none"
                        >
                          {char}
                        </button>
                      ))}
                    </div>
                  ))}

                  {/* Teclas de Ação */}
                  <div className="pt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleKeyPress(" ")}
                      className="focusable flex h-10 items-center justify-center gap-1 rounded-lg border border-border/60 bg-secondary/40 text-xs font-semibold transition-all hover:bg-primary/20 hover:text-primary focus:border-primary focus:bg-primary focus:text-primary-foreground focus:scale-105 focus:shadow-glow focus:outline-none"
                      title="Espaço"
                    >
                      <Space className="h-4 w-4" /> Espaço
                    </button>
                    <button
                      type="button"
                      onClick={handleBackspace}
                      className="focusable flex h-10 items-center justify-center gap-1 rounded-lg border border-border/60 bg-secondary/40 text-xs font-semibold transition-all hover:bg-destructive/20 hover:text-destructive focus:border-destructive focus:bg-destructive focus:text-destructive-foreground focus:scale-105 focus:shadow-glow focus:outline-none"
                      title="Apagar"
                    >
                      <Delete className="h-4 w-4" /> Apagar
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="focusable flex h-10 items-center justify-center gap-1 rounded-lg border border-border/60 bg-secondary/40 text-xs font-semibold transition-all hover:bg-destructive/20 hover:text-destructive focus:border-destructive focus:bg-destructive focus:text-destructive-foreground focus:scale-105 focus:shadow-glow focus:outline-none"
                      title="Limpar"
                    >
                      <X className="h-4 w-4" /> Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resultados de Busca */}
          <div className={showVirtualKeyboard ? "lg:col-span-8 xl:col-span-9" : "lg:col-span-12"}>
            {term.length < 2 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                <SearchIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium">Digite ao menos 2 letras para buscar.</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Use as setas do controle remoto para selecionar as letras acima ou digite diretamente.
                </p>
              </div>
            ) : loading && total === 0 ? (
              <div className="mt-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : total === 0 ? (
              <div className="mt-8 rounded-2xl border border-border bg-card/40 p-8 text-center text-muted-foreground">
                <p className="text-base font-medium">Nada encontrado para “{q}”.</p>
                <p className="mt-1 text-xs">Tente buscar por outro termo ou nome de canal/filme/série.</p>
              </div>
            ) : (
              <div className="space-y-10">
                {results.movies.length > 0 && (
                  <Section title={`Filmes (${results.movies.length})`}>
                    {results.movies.map((m) => (
                      <ContentCard 
                        key={m.stream_id} 
                        to="/movie/$id" 
                        params={{ id: String(m.stream_id) }} 
                        search={{ from: fromSearchUrl }}
                        title={m.name} 
                        image={m.stream_icon} 
                        rating={m.rating} 
                      />
                    ))}
                  </Section>
                )}
                {results.series.length > 0 && (
                  <Section title={`Séries (${results.series.length})`}>
                    {results.series.map((s) => (
                      <SeriesCard 
                        key={s.series_id} 
                        account={account} 
                        cacheKey={key} 
                        series={s} 
                        search={{ from: fromSearchUrl }}
                      />
                    ))}
                  </Section>
                )}
                {results.live.length > 0 && (
                  <Section title={`Canais ao vivo (${results.live.length})`}>
                    {results.live.map((c) => (
                      <ContentCard key={c.stream_id} to="/live" title={c.name} image={c.stream_icon} wide />
                    ))}
                  </Section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      <Grid>{children}</Grid>
    </section>
  );
}
