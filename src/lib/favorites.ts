import { supabase, useSupabase } from "./supabase";

function getActiveUserId(): string {
  if (typeof window === "undefined") return "default_user";
  try {
    const raw = localStorage.getItem("flowtv.account");
    if (raw) {
      const acc = JSON.parse(raw);
      if (acc?.username) return String(acc.username).trim().toLowerCase();
    }
  } catch {}
  return "default_user";
}

export interface Favorite {
  id: string;
  userId: string;
  contentType: "live" | "movie" | "series";
  contentId: number;
  title: string;
  poster: string | null;
  createdAt: string;
}

export async function getFavorites(): Promise<Favorite[]> {
  if (useSupabase) {
    try {
      const userId = getActiveUserId();
      const { data, error } = await supabase
        .from("favorites")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        return data.map((d: any) => ({
          id: `${d.content_type}:${d.content_id}`,
          userId: d.user_id,
          contentType: d.content_type,
          contentId: Number(d.content_id),
          title: d.title,
          poster: d.poster,
          createdAt: d.created_at,
        }));
      }
    } catch (e) {
      console.warn("Supabase getFavorites error:", e);
    }
  }
  return [];
}

export async function addFavorite(
  contentType: "live" | "movie" | "series",
  contentId: number,
  title: string,
  poster: string
): Promise<Favorite | null> {
  const userId = getActiveUserId();
  const numContentId = Number(contentId);

  if (useSupabase) {
    try {
      const { data, error } = await supabase
        .from("favorites")
        .upsert(
          {
            user_id: userId,
            content_type: contentType,
            content_id: numContentId,
            title,
            poster,
            created_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_type,content_id" }
        )
        .select()
        .single();

      if (!error && data) {
        return {
          id: `${data.content_type}:${data.content_id}`,
          userId: data.user_id,
          contentType: data.content_type,
          contentId: Number(data.content_id),
          title: data.title,
          poster: data.poster,
          createdAt: data.created_at,
        };
      }
    } catch (e) {
      console.warn("Supabase addFavorite error:", e);
    }
  }
  return null;
}

export async function removeFavorite(
  contentType: "live" | "movie" | "series",
  contentId: number
): Promise<void> {
  const userId = getActiveUserId();
  if (useSupabase) {
    try {
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("content_type", contentType)
        .eq("content_id", Number(contentId));
    } catch (e) {
      console.warn("Supabase removeFavorite error:", e);
    }
  }
}

export async function isFavorite(
  contentType: "live" | "movie" | "series",
  contentId: number
): Promise<boolean> {
  const favorites = await getFavorites();
  return favorites.some(
    (f) => f.contentType === contentType && f.contentId === contentId
  );
}
