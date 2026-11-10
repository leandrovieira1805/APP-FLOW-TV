export interface BrandTheme {
  id: string;
  name: string;
  brandTitle: string;
  badge: string;
  movieBadge: string;
  seriesBadge: string;
  bgClass: string;
  headerBg: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  tagline: string;
  navItems: Array<{ id: "all" | "movies" | "series" | "sports" | "list"; label: string }>;
  brandTiles?: Array<{ name: string; query: string; color: string; bg: string }>;
  keywords: string[];
}

export const BRAND_CONFIGS: Record<string, BrandTheme> = {
  netflix: {
    id: "netflix",
    name: "Netflix",
    brandTitle: "NETFLIX",
    badge: "ORIGINAL",
    movieBadge: "FILME",
    seriesBadge: "SÉRIE",
    bgClass: "bg-[#141414] text-white",
    headerBg: "bg-[#141414]",
    accentColor: "#E50914",
    accentBg: "bg-[#E50914]",
    accentBorder: "border-[#E50914]",
    tagline: "Filmes, séries e muito mais. Sem limites.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "series", label: "Séries" },
      { id: "movies", label: "Filmes" },
      { id: "sports", label: "Bombando" },
      { id: "list", label: "Minha Lista" },
    ],
    keywords: ["netflix", "nfx", "4k netflix", "originais netflix", "original netflix", "netflix original"],
  },
  prime: {
    id: "prime",
    name: "Prime Video",
    brandTitle: "prime video",
    badge: "INCLUÍDO NO PRIME",
    movieBadge: "AMAZON ORIGINAL",
    seriesBadge: "AMAZON ORIGINAL",
    bgClass: "bg-[#0B111E] text-white",
    headerBg: "bg-[#0B111E]",
    accentColor: "#00A8E1",
    accentBg: "bg-[#00A8E1]",
    accentBorder: "border-[#00A8E1]",
    tagline: "Bem-vindo ao Prime Video. Assista a filmes e séries de sucesso.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "movies", label: "Filmes" },
      { id: "series", label: "Séries" },
      { id: "sports", label: "Esportes" },
      { id: "list", label: "Minha Área" },
    ],
    keywords: ["prime", "prime video", "amazon", "amazon prime", "primevideo"],
  },
  disney: {
    id: "disney",
    name: "Disney+",
    brandTitle: "Disney+",
    badge: "DISNEY+ ORIGINAL",
    movieBadge: "DISNEY+ EXCLUSIVO",
    seriesBadge: "DISNEY+ ORIGINAL",
    bgClass: "bg-[#040714] text-white",
    headerBg: "bg-[#040714]",
    accentColor: "#0063E5",
    accentBg: "bg-[#0063E5]",
    accentBorder: "border-[#0063E5]",
    tagline: "As melhores histórias do mundo em um só lugar.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "movies", label: "Filmes" },
      { id: "series", label: "Séries" },
      { id: "sports", label: "Originais" },
      { id: "list", label: "Minha Lista" },
    ],
    brandTiles: [
      { name: "Disney", query: "disney", color: "from-blue-900 to-blue-950", bg: "border-blue-500/40" },
      { name: "Pixar", query: "pixar", color: "from-teal-900 to-slate-900", bg: "border-teal-500/40" },
      { name: "Marvel", query: "marvel", color: "from-red-900 to-red-950", bg: "border-red-500/40" },
      { name: "Star Wars", query: "star wars", color: "from-amber-950 to-neutral-900", bg: "border-amber-500/40" },
      { name: "Nat Geo", query: "national", color: "from-yellow-950 to-stone-900", bg: "border-yellow-500/40" },
    ],
    keywords: ["disney", "disney+", "pixar", "marvel", "star wars", "star+", "star plus", "national geographic"],
  },
  max: {
    id: "max",
    name: "Max",
    brandTitle: "MAX",
    badge: "MAX ORIGINAL",
    movieBadge: "HBO ORIGINAL",
    seriesBadge: "MAX ORIGINAL",
    bgClass: "bg-[#00021A] text-white",
    headerBg: "bg-[#00021A]",
    accentColor: "#002B7F",
    accentBg: "bg-[#002B7F]",
    accentBorder: "border-[#002B7F]",
    tagline: "Muito mais para ver. HBO, Warner Bros., DC e muito mais.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "series", label: "Séries" },
      { id: "movies", label: "Filmes" },
      { id: "sports", label: "HBO" },
      { id: "list", label: "Minha Lista" },
    ],
    keywords: ["max", "hbo", "hbo max", "warner", "dc comics", "discovery"],
  },
  globoplay: {
    id: "globoplay",
    name: "Globoplay",
    brandTitle: "globoplay",
    badge: "ORIGINAL GLOBOPLAY",
    movieBadge: "TELECINE",
    seriesBadge: "ORIGINAL GLOBOPLAY",
    bgClass: "bg-[#0F0F10] text-white",
    headerBg: "bg-[#0F0F10]",
    accentColor: "#FF1E56",
    accentBg: "bg-[#FF1E56]",
    accentBorder: "border-[#FF1E56]",
    tagline: "O melhor do conteúdo brasileiro, novelas e séries exclusivas.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "series", label: "Novelas & Séries" },
      { id: "movies", label: "Filmes" },
      { id: "sports", label: "Canais Globo" },
      { id: "list", label: "Minha Lista" },
    ],
    keywords: ["globoplay", "globo play", "globo", "gshow", "novelas", "telecine", "viva"],
  },
  appletv: {
    id: "appletv",
    name: "Apple TV+",
    brandTitle: "tv+",
    badge: "APPLE ORIGINAL",
    movieBadge: "APPLE ORIGINAL",
    seriesBadge: "APPLE ORIGINAL",
    bgClass: "bg-[#000000] text-white",
    headerBg: "bg-[#000000]",
    accentColor: "#FFFFFF",
    accentBg: "bg-white text-black",
    accentBorder: "border-white",
    tagline: "Produções Apple Original de tirar o fôlego.",
    navItems: [
      { id: "all", label: "Todos os Originais" },
      { id: "movies", label: "Filmes" },
      { id: "series", label: "Séries" },
      { id: "sports", label: "Não Ficção" },
      { id: "list", label: "Minha Lista" },
    ],
    keywords: ["apple", "apple tv", "appletv", "apple tv+"],
  },
  paramount: {
    id: "paramount",
    name: "Paramount+",
    brandTitle: "Paramount+",
    badge: "PARAMOUNT+ EXCLUSIVE",
    movieBadge: "PARAMOUNT PICTURES",
    seriesBadge: "SHOWTIME ORIGINAL",
    bgClass: "bg-[#000C1F] text-white",
    headerBg: "bg-[#000C1F]",
    accentColor: "#0064FF",
    accentBg: "bg-[#0064FF]",
    accentBorder: "border-[#0064FF]",
    tagline: "Uma montanha de entretenimento. Filmes de cinema e séries icônicas.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "movies", label: "Filmes" },
      { id: "series", label: "Séries" },
      { id: "sports", label: "Showtime" },
      { id: "list", label: "Minha Lista" },
    ],
    keywords: ["paramount", "paramount+", "paramount plus", "showtime"],
  },
  crunchyroll: {
    id: "crunchyroll",
    name: "Crunchyroll",
    brandTitle: "crunchyroll",
    badge: "CRUNCHYROLL ANIME",
    movieBadge: "FILME ANIME",
    seriesBadge: "SIMULCAST",
    bgClass: "bg-[#141519] text-white",
    headerBg: "bg-[#141519]",
    accentColor: "#F47521",
    accentBg: "bg-[#F47521]",
    accentBorder: "border-[#F47521]",
    tagline: "A maior biblioteca de animes do mundo. Direto do Japão.",
    navItems: [
      { id: "all", label: "Início" },
      { id: "series", label: "Animes" },
      { id: "movies", label: "Filmes Anime" },
      { id: "sports", label: "Dublados" },
      { id: "list", label: "Minha Lista" },
    ],
    keywords: ["crunchyroll", "anime", "animes", "otaku", "shonen", "tokusatsu", "doramas"],
  },
};

export function resolveBrand(brandParam?: string, title?: string, fromPath?: string): BrandTheme | null {
  if (brandParam && BRAND_CONFIGS[brandParam.toLowerCase()]) {
    return BRAND_CONFIGS[brandParam.toLowerCase()];
  }
  if (fromPath && fromPath.includes("/hub/")) {
    const hubSlug = fromPath.split("/hub/")[1]?.split("?")[0]?.toLowerCase();
    if (hubSlug && BRAND_CONFIGS[hubSlug]) {
      return BRAND_CONFIGS[hubSlug];
    }
  }
  return null;
}
