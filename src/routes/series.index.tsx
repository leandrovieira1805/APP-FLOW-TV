import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useMemo, useState } from "react";
import { Loader2, Clapperboard, ArrowLeft, Sparkles } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { SeriesCard } from "../components/SeriesCard";
import { useRequireAccount } from "../hooks/use-require-account";
import { useCachedQuery, accountKey } from "../lib/queries";
import { getSeriesCategories, getSeries } from "../lib/xtream";
import { CategoryPanel } from "../components/CategoryPanel";
import { Grid } from "./movies";
import { useIsMobile, isTvDevice } from "../hooks/use-mobile";

export const Route = createFileRoute("/series/")({
  validateSearch: (search: Record<string, string>) => ({
    sort: search.sort as "recent" | undefined,
    provider: search.provider as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Séries — FLOW TV" },
      { name: "description", content: "Explore séries IPTV por categoria e assista episódios no FLOW TV." },
    ],
  }),
  component: SeriesPage,
});

function SeriesPage() {
  const { account, ready } = useRequireAccount();
  const key = accountKey(account);
  const { sort, provider } = Route.useSearch();
  const [cat, setCat] = useState(sort === "recent" ? "" : "all");
  const [visible, setVisible] = useState(60);
  const isMobile = useIsMobile();
  const isTV = isTvDevice();
  const isDesktopOrTv = isTV || !isMobile;
  const [showItems, setShowItems] = useState(isDesktopOrTv);

  const categories = useCachedQuery(key + ":seriescats", () => getSeriesCategories(account!), { enabled: !!account });
  const series = useCachedQuery(key + ":series:all", () => getSeries(account!), { enabled: !!account });

  const lastProvider = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (provider && categories.data && lastProvider.current !== provider) {
      const targetCat = categories.data.find((c) => c.category_name.toLowerCase().includes(provider.toLowerCase()));
      if (targetCat) {
        setCat(targetCat.category_id);
        setShowItems(true);
      }
      lastProvider.current = provider;
    }
  }, [provider, categories.data]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of series.data ?? []) map.set(s.category_id, (map.get(s.category_id) ?? 0) + 1);
    return map;
  }, [series.data]);

  const filtered = useMemo(() => {
    let list = series.data ?? [];

    if (sort === "recent") {
      list = [...list].sort((a, b) => {
        const aRel = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const bRel = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return bRel - aRel || (b.series_id - a.series_id);
      });
    }

    return cat === "all" ? list : cat === "" ? list : list.filter((s) => s.category_id === cat);
  }, [series.data, cat, sort]);

  const pickCategory = (c: string) => {
    setCat(c);
    setVisible(60);
    setShowItems(true);
    setTimeout(() => {
      const container = document.querySelector(".items-grid-container");
      if (container) {
        const firstItem = container.querySelector<HTMLElement>(".focusable");
        if (firstItem) {
          firstItem.focus();
          firstItem.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
      }
    }, 150);
  };

  const activeName =
    sort === "recent"
      ? "Recém-lançados"
      : cat === "all"
        ? "Todas as séries"
        : categories.data?.find((c) => c.category_id === cat)?.category_name ?? "Séries";

  if (!ready || !account) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-12">
        <div className="mb-5 flex items-center gap-2">
          <Clapperboard className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-extrabold">Séries</h1>
        </div>

        <div className={"grid items-start gap-6 " + (isDesktopOrTv ? "grid-cols-[260px_1fr]" : "")}>
          {/* Seleções */}
          <div className={"selections-container sticky top-20 " + (showItems && !isDesktopOrTv ? "hidden" : "block")}>
            <h2 className="mb-3 font-display text-lg font-bold">Seleções</h2>
            <div className="mb-2 space-y-1">
              <button
                onClick={() => setCat("all")}
                className={"focusable flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors " + (
                  cat === "all" && sort !== "recent"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                )}
              >
                <Clapperboard className="h-4 w-4" />
                Todas as séries
                <span className="ml-auto text-xs opacity-70">{series.data?.length ?? 0}</span>
              </button>
              <Link
                to="/series"
                search={{ sort: "recent" }}
                className={"focusable flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors " + (
                  sort === "recent"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                )}
              >
                <Sparkles className="h-4 w-4" />
                Recém-lançados
              </Link>
            </div>
            <CategoryPanel
              categories={categories.data ?? []}
              counts={counts}
              total={series.data?.length ?? 0}
              value={cat}
              onSelect={pickCategory}
              loading={categories.isLoading && !categories.data}
              allLabel="Todas as séries"
            />
          </div>

          {/* Séries da seleção */}
          <div className={"items-grid-container " + (showItems || isDesktopOrTv ? "block" : "hidden")}>
            <div className="mb-1 flex items-center gap-2">
              {!isDesktopOrTv && (
                <button
                  onClick={() => setShowItems(false)}
                  className="focusable inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-sm font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Seleções
                </button>
              )}
              <h2 className="line-clamp-1 font-display text-lg font-bold">{activeName}</h2>
              <span className="ml-1 text-sm text-muted-foreground">{filtered.length}</span>
            </div>

            {series.isLoading && !series.data ? (
              <Grid skeleton />
            ) : filtered.length === 0 ? (
              <p className="mt-8 text-center text-muted-foreground">Nenhuma série nesta seleção.</p>
            ) : (
              <>
                <Grid>
                  {filtered.slice(0, visible).map((s) => (
                    <SeriesCard key={s.series_id} account={account} cacheKey={key} series={s} />
                  ))}
                </Grid>
                {visible < filtered.length && (
                  <div className="mt-8 text-center">
                    <button
                      onClick={() => setVisible((v) => v + 60)}
                      className="focusable rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50"
                    >
                      Carregar mais
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
