import { createFileRoute } from "@tanstack/react-router";
import { Heart, Loader2 } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { ContentCard } from "../components/ContentCard";
import { Grid } from "./movies";
import { useFavorites } from "../hooks/use-supabase-data";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Favoritos — FLOW TV" },
      { name: "description", content: "Seus canais, filmes e séries favoritos no FLOW TV." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { favorites, isLoading } = useFavorites();

  const routeFor = (contentType: "live" | "movie" | "series") =>
    contentType === "movie" ? "/movie/$id" : contentType === "series" ? "/series/$id" : "/live";

  return (
    <AppShell>
      <div className="px-4 py-6 lg:px-12">
        <div className="mb-5 flex items-center gap-2">
          <Heart className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-extrabold">Favoritos</h1>
        </div>

        {isLoading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : favorites.length === 0 ? (
          <div className="mt-16 text-center text-muted-foreground">
            <Heart className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>Você ainda não adicionou favoritos.</p>
            <p className="text-sm">Toque no coração em qualquer conteúdo para salvá-lo aqui.</p>
          </div>
        ) : (
          <Grid>
            {favorites.map((f) => (
              <ContentCard
                key={f.id}
                to={routeFor(f.contentType)}
                params={f.contentType === "live" ? undefined : { id: String(f.contentId) }}
                title={f.title}
                image={f.poster || ""}
              />
            ))}
          </Grid>
        )}
      </div>
    </AppShell>
  );
}
